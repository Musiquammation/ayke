import { Fields } from "../Fields";
import { botActionNodeHelper, describeBot } from "../Bot";
import { GMTrustIssues } from "../gamemods/GMTrustIssues";
import {
	AIR_ACCEL,
	AIR_DECEL,
	GROUND_DECEL,
	MATCH_DURATION,
	PLAYER_FEET,
	PLAYER_SPEED,
	YAW_SEND_THRESHOLD,
	ZONE_COUNT,
	ZONE_POINTS,
} from "../gamemods/trustIssues/constants";
import { isAbove, Level, Platform } from "../gamemods/trustIssues/level";
import { forwardOf, Player, Splat, timeToLand } from "../gamemods/trustIssues/simulation";

/* -------------------------------------------------------------------------- */
/* Trust Issues bot: an explorer that only trusts what it can see.            */
/*                                                                            */
/* The bot knows the platforms that are painted (by anybody: it takes         */
/* advantage of the others' explosions) and judges which ones it can jump     */
/* between. Each tick:                                                        */
/*                                                                            */
/*  1. If a zone worth points is reachable through visible platforms, it      */
/*     follows the shortest visible way to it.                                */
/*  2. Otherwise it picks the best "lookout": a spot of a visible platform,   */
/*     never exploded from yet, close to a zone and not too deep in the       */
/*     path. It walks there (braking in time, inertia matters) and explodes:  */
/*     that reveals every platform around the spot. Spots that were exploded */
/*     from are exhausted, so dead ends are abandoned by themselves.          */
/*  3. If nothing is left to explore (should not happen), it falls back on    */
/*     the real map so it never gets stuck forever.                           */
/*                                                                            */
/* A bot stuck too long on the same platform (missed jumps, bad landing)      */
/* explodes to start again from the spawn.                                    */
/* -------------------------------------------------------------------------- */

const { all, runner } = botActionNodeHelper<GMTrustIssues, Data>();

/** Large platforms (spawn, zones) get several lookout spots, this far apart at most. */
const SPOT_SPACING = 4.2;
/** Lookout spots are kept this far inside the platform. */
const SPOT_INSET = 0.9;
/** A splat closer than this (horizontally) to a spot exhausts it. */
const SPOT_EXHAUST_RADIUS = 2.2;
/** Explodes when closer than this to the chosen spot. */
const SPOT_REACHED = 0.6;
/** Feet this close above a platform = standing on it. */
const STAND_TOLERANCE = 0.4;
/** Exploring cost of each jump needed to reach a spot (in meters of distance to a zone). */
const HOP_COST = 2.5;
/** A jump failed this many times is not tried anymore (probably too far for real). */
const MAX_FAILED_JUMPS = 3;
/** A jump is judged once the bot stands somewhere this long after jumping. */
const HOP_SETTLE_TIME = 0.3;
/** The jump trigger handles edges crossed within this angle (radians) of the jump direction. */
const JUMP_ALIGNMENT = 0.8;
/** Jumps aim this far inside the next platform. */
const LANDING_INSET = 1.2;
/** Seconds walking without moving before jumping (something blocks the way). */
const BLOCKED_TIME = 0.2;
/**
 * The bot may be asked for its inputs rarely (once per drawn frame: a slow
 * computer means few decisions per second). Its anticipation grows with the
 * measured delay between two decisions, capped to this.
 */
const MAX_DECISION_DELAY = 0.25;
/** Seconds on the same platform (while trying to leave it) before giving up and exploding. */
const STUCK_TIME = 9;


interface Spot {
	platform: number;
	x: number;
	z: number;
}

class Data {
	lastMoveX = 0;
	lastMoveZ = 0;
	lastYaw = 0;
	/** Platform the bot stands on (or stood on last). */
	current = 0;
	/** Game clock when the bot arrived on `current` */
	since = 0;
	/** Seconds spent walking forward without moving (blocked by a ledge) */
	blocked = 0;
	/** Game clock of the previous decision, and the delay between the last two decisions */
	lastClock = -1;
	interval = 1 / 60;

	/** Jump in progress (from -> to platform ids), and when it started */
	hop: { from: number, to: number, clock: number } | null = null;
	/** Failed jumps ("from>to" -> count): a jump failed too often is not tried anymore */
	failedJumps = new Map<string, number>();

	/** known[i] = platform i is visible (always for the spawn and the zones). */
	known: boolean[] | null = null;
	/** Lookout spots of every platform, and which ones are exhausted. */
	spots: Spot[] = [];
	exhausted: boolean[] = [];
	/** Splat ids already taken into account. */
	seenSplats: number[] = [];
}

function dataConstructor(): Data {
	return new Data();
}


/* ---------------------------- Knowledge ---------------------------- */

/**
 * Lookout spots of a platform: its center for a small one, a grid along the
 * inside of its border for a large one (the paint sphere would not reach
 * beyond the edges from its center).
 */
function platformSpots(p: Platform): Spot[] {
	const hw = p.w / 2 - SPOT_INSET;
	const hd = p.d / 2 - SPOT_INSET;
	if (p.w <= SPOT_SPACING + 1 && p.d <= SPOT_SPACING + 1)
		return [{ platform: p.id, x: p.x, z: p.z }];

	const nx = Math.max(1, Math.ceil(2 * hw / SPOT_SPACING));
	const nz = Math.max(1, Math.ceil(2 * hd / SPOT_SPACING));
	const spots: Spot[] = [];
	for (let i = 0; i <= nx; i++) {
		for (let j = 0; j <= nz; j++) {
			if (i !== 0 && i !== nx && j !== 0 && j !== nz)
				continue; // border only
			spots.push({ platform: p.id, x: p.x - hw + 2 * hw * i / nx, z: p.z - hd + 2 * hd * j / nz });
		}
	}
	return spots;
}

/** Reset what the bot knows to the start of the game. */
function resetKnowledge(level: Level, data: Data) {
	data.known = level.platforms.map(p => p.kind !== 'hidden');
	data.spots = level.platforms.flatMap(platformSpots);
	data.exhausted = data.spots.map(() => false);
	data.seenSplats = [];
}

/** Take the new splats into account: what they painted, and the spots they exhausted. */
function updateKnowledge(level: Level, splats: Splat[], data: Data) {
	const valid = data.known !== null
		&& data.seenSplats.length <= splats.length
		&& data.seenSplats.every((id, i) => splats[i].id === id);
	if (!valid)
		resetKnowledge(level, data);

	const known = data.known!;
	for (let i = data.seenSplats.length; i < splats.length; i++) {
		const s = splats[i];
		for (const p of level.platforms) {
			if (!known[p.id] && s.touches(p))
				known[p.id] = true;
		}
		for (const [k, spot] of data.spots.entries()) {
			const top = level.platforms[spot.platform].top;
			if (Math.hypot(s.x - spot.x, s.z - spot.z) < SPOT_EXHAUST_RADIUS && Math.abs(s.y - PLAYER_FEET - top) < 2)
				data.exhausted[k] = true;
		}
		data.seenSplats.push(s.id);
	}
	return known;
}


/* ---------------------------- Navigation ---------------------------- */

/**
 * Breadth first search from `from`, only through the platforms allowed by
 * `usable`. Returns the previous platform of each reached one and its depth.
 */
function explore(level: Level, from: number, usable: (id: number) => boolean, failed: Map<string, number> | null = null) {
	const prev = new Map<number, number>([[from, -1]]);
	const depth = new Map<number, number>([[from, 0]]);
	const queue = [from];
	for (let head = 0; head < queue.length; head++) {
		const a = queue[head];
		for (const b of level.links[a]) {
			if (!prev.has(b) && usable(b) && (failed?.get(`${a}>${b}`) ?? 0) < MAX_FAILED_JUMPS) {
				prev.set(b, a);
				depth.set(b, depth.get(a)! + 1);
				queue.push(b);
			}
		}
	}
	return { prev, depth };
}

/** Rebuild the way from the search start to `to`. */
function wayTo(prev: Map<number, number>, to: number) {
	const path: number[] = [];
	for (let n = to; n !== -1; n = prev.get(n)!)
		path.push(n);
	return path.reverse();
}

/** The platform the player stands on, or null when airborne. */
function standingOn(level: Level, self: Player): Platform | null {
	if (!self.grounded)
		return null;
	const feet = self.feet();
	for (const p of level.platforms) {
		if (isAbove(p, self.x, self.z, 0.1) && Math.abs(feet - p.top) < STAND_TOLERANCE)
			return p;
	}
	return null;
}

/**
 * Zones the bot still wants: the ones it never reached that still give points
 * (or all the ones it never reached, when none gives points anymore).
 */
function wantedZones(game: GMTrustIssues, self: Player) {
	const missing = game.level.zones.filter(z => !self.hasZone(z.zone));
	const paying = missing.filter(z => (ZONE_POINTS[game.zoneArrivals[z.zone].length] ?? 0) > 0);
	return paying.length > 0 ? paying : missing;
}


/** Closest point of the footprint of `p` (inset by `inset`) to (x, z). */
function clampInto(p: Platform, x: number, z: number, inset: number) {
	const hw = Math.max(0, p.w / 2 - inset);
	const hd = Math.max(0, p.d / 2 - inset);
	return {
		x: Math.max(p.x - hw, Math.min(p.x + hw, x)),
		z: Math.max(p.z - hd, Math.min(p.z + hd, z)),
	};
}


/* ---------------------------- Plans ---------------------------- */

/** What the bot does now: walk a way of platforms, then explode at the end (or not). */
interface Plan {
	path: number[];
	/** Spot to explode at, on the last platform of the path (null: just walk to the end). */
	spot: Spot | null;
}

/** 1. A visible way to a wanted zone (the shortest one, the zones giving more points first on ties). */
function planToZone(game: GMTrustIssues, data: Data, known: boolean[], zones: Platform[]): Plan | null {
	const { prev, depth } = explore(game.level, data.current, id => known[id], data.failedJumps);
	let best: Plan | null = null;
	let bestCost = Infinity;
	for (const z of zones) {
		const d = depth.get(z.id);
		if (d === undefined)
			continue;
		const cost = d - (ZONE_POINTS[game.zoneArrivals[z.zone].length] ?? 0) * 0.05;
		if (cost < bestCost) {
			bestCost = cost;
			best = { path: wayTo(prev, z.id), spot: null };
		}
	}
	return best;
}

/** 2. The best lookout to explode at: close to a wanted zone, not too many jumps away. */
function planLookout(game: GMTrustIssues, data: Data, known: boolean[], zones: Platform[]): Plan | null {
	const { prev, depth } = explore(game.level, data.current, id => known[id], data.failedJumps);
	let best: Plan | null = null;
	let bestCost = Infinity;

	for (const [k, spot] of data.spots.entries()) {
		const d = depth.get(spot.platform);
		if (data.exhausted[k] || d === undefined)
			continue;
		const p = game.level.platforms[spot.platform];
		if (p.kind === 'zone' && zones.some(z => z.id === p.id))
			continue; // a wanted zone is reached, not explored from

		const toZone = Math.min(...zones.map(z => Math.hypot(z.x - spot.x, z.z - spot.z)));
		const cost = toZone + d * HOP_COST;
		if (cost < bestCost) {
			bestCost = cost;
			best = { path: wayTo(prev, spot.platform), spot };
		}
	}
	return best;
}

/** 3. Fallback on the real map: walk the real way, explode where the next platform is invisible. */
function planFallback(game: GMTrustIssues, data: Data, known: boolean[], zones: Platform[]): Plan | null {
	const { prev } = explore(game.level, data.current, () => true);
	const target = zones.find(z => prev.has(z.id));
	if (!target)
		return null;
	const path = wayTo(prev, target.id);
	const hidden = path.findIndex(id => !known[id]);
	if (hidden < 0)
		return { path, spot: null };
	const last = game.level.platforms[path[hidden - 1]];
	return { path: path.slice(0, hidden), spot: { platform: last.id, x: last.x, z: last.z } };
}


/* ---------------------------- Inputs ---------------------------- */

/** Yaw looking from (x, z) toward (tx, tz) (see `forwardOf`). */
function yawToward(x: number, z: number, tx: number, tz: number) {
	return Math.atan2(-(tx - x), -(tz - z));
}

/** Send the move and the view direction, only when they changed. */
function steer(inputs: Fields[], data: Data, yaw: number, forward: number) {
	const delta = Math.atan2(Math.sin(yaw - data.lastYaw), Math.cos(yaw - data.lastYaw));
	if (Math.abs(delta) > YAW_SEND_THRESHOLD) {
		data.lastYaw = yaw;
		inputs.push({ action: 'yaw', yaw });
	}
	if (forward !== data.lastMoveZ || data.lastMoveX !== 0) {
		data.lastMoveX = 0;
		data.lastMoveZ = forward;
		inputs.push({ action: 'move', move: { x: 0, z: forward } });
	}
}

/**
 * Safety on small platforms: where would the bot stop if it braked now, given
 * that its next decision may come late? If that point is off the platform and
 * it does not mean to jump that way, brake hard (face the motion, walk
 * backward). Returns true when braking.
 */
function edgeGuard(inputs: Fields[], data: Data, self: Player, current: Platform, jumpYaw: number | null) {
	const speed = Math.hypot(self.vx, self.vz);
	if (speed < 0.5)
		return false;

	const ux = self.vx / speed;
	const uz = self.vz / speed;
	const stop = speed * data.interval + speed * speed / (2 * GROUND_DECEL);
	if (isAbove(current, self.x + ux * stop, self.z + uz * stop))
		return false;

	if (jumpYaw !== null) {
		const f = forwardOf(jumpYaw);
		if (ux * f.x + uz * f.z > Math.cos(JUMP_ALIGNMENT))
			return false; // going toward the jump: the jump trigger handles the edge
	}

	steer(inputs, data, yawToward(self.x, self.z, self.x + ux, self.z + uz), -1);
	return true;
}

/**
 * Walk to a point of the platform the bot stands on and stop there. Brakes
 * when the remaining distance is the braking distance (the bot has inertia).
 * Returns true once arrived.
 */
function walkTo(inputs: Fields[], data: Data, self: Player, current: Platform, x: number, z: number) {
	const dist = Math.hypot(x - self.x, z - self.z);
	const speed = Math.hypot(self.vx, self.vz);
	if (edgeGuard(inputs, data, self, current, null))
		return false;
	// Braking distance, plus the distance covered until the next decision
	const braking = speed * speed / (2 * GROUND_DECEL) + 0.1 + speed * data.interval;
	const yaw = dist > 0.05 ? yawToward(self.x, self.z, x, z) : data.lastYaw;
	steer(inputs, data, yaw, dist > braking ? 1 : 0);
	return dist < SPOT_REACHED && speed < 2.5;
}

/** Walk toward the next platform, jump at the edge (earlier when going fast). */
function hopTo(inputs: Fields[], data: Data, self: Player, current: Platform, next: Platform, on: Platform | null) {
	// Aim at the closest point of the next platform, well inside its edges:
	// the shortest jump, and a landing that does not end on a corner
	const inset = Math.min(LANDING_INSET, next.w / 2 - 0.2, next.d / 2 - 0.2);
	const target = clampInto(next, self.x, self.z, inset);
	const yaw = yawToward(self.x, self.z, target.x, target.z);

	if (on === current && edgeGuard(inputs, data, self, current, yaw))
		return;
	steer(inputs, data, yaw, self.grounded ? 1 : airControl(self, next, target, data.interval));

	if (on === current) {
		const f = forwardOf(yaw);
		const speed = Math.hypot(self.vx, self.vz);
		// Jump before the edge if it would be passed before the next decision
		const ahead = 0.2 + speed * (0.035 + data.interval);
		// Blocked against a higher platform: jump on it
		data.blocked = speed < 0.8 ? data.blocked + data.interval : 0;
		if (!isAbove(current, self.x + f.x * ahead, self.z + f.z * ahead) || data.blocked > BLOCKED_TIME) {
			data.blocked = 0;
			if (!data.hop)
				data.hop = { from: current.id, to: next.id, clock: data.lastClock };
			inputs.push({ action: 'jump', jump: {} });
		}
	}
}


/**
 * In the air: the horizontal speed needed to land on the target (distance left
 * divided by the time left before the feet reach the platform). Among
 * "forward", "nothing" and "backward", picks the key whose speed at the next
 * decision is the closest to it (the next decision may be far away).
 */
function airControl(self: Player, next: Platform, target: { x: number, z: number }, interval: number) {
	const timeLeft = timeToLand(self.feet(), self.vy, next.top);
	if (timeLeft === null)
		return 1; // still under the platform: keep going, hope for the ledge
	const wanted = Math.hypot(target.x - self.x, target.z - self.z) / Math.max(0.05, timeLeft);
	const speed = Math.hypot(self.vx, self.vz);
	const step = Math.min(interval, timeLeft);

	const options: [number, number][] = [
		[1, Math.min(PLAYER_SPEED, speed + AIR_ACCEL * step)],
		[0, Math.max(0, speed - AIR_DECEL * step)],
		[-1, Math.max(0, speed - AIR_ACCEL * step)],
	];
	let best = options[0];
	for (const o of options) {
		if (Math.abs(o[1] - wanted) < Math.abs(best[1] - wanted))
			best = o;
	}
	return best[0];
}


/**
 * Outcome of the jump in progress: landing on the target is a success; landing
 * anywhere else (back on the same platform, on another one, or on the spawn
 * after a fall) is a failure, remembered for this jump.
 */
function checkHop(data: Data, on: Platform | null, clock: number) {
	const hop = data.hop;
	if (!hop)
		return;
	if (clock < hop.clock) {
		data.hop = null; // the state went back in time (load)
		return;
	}
	if (!on || clock - hop.clock < HOP_SETTLE_TIME)
		return;

	if (on.id !== hop.to) {
		const key = `${hop.from}>${hop.to}`;
		data.failedJumps.set(key, (data.failedJumps.get(key) ?? 0) + 1);
	}
	data.hop = null;
}


const play = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const self = game.players[playerIdx];
	if (!self || game.finished)
		return [inputs, 'success'];

	const level = game.level;
	const clock = MATCH_DURATION - game.time;
	if (data.lastClock >= 0 && clock > data.lastClock)
		data.interval = Math.min(MAX_DECISION_DELAY, Math.max(1 / 60, clock - data.lastClock));
	data.lastClock = clock;
	const known = updateKnowledge(level, game.splats, data);

	const on = standingOn(level, self);
	checkHop(data, on, clock);
	if (on && on.id !== data.current) {
		data.current = on.id;
		data.since = clock;
	}
	if (clock < data.since)
		data.since = clock; // the state went back in time (load)

	const zones = wantedZones(game, self);
	if (zones.length === 0) {
		steer(inputs, data, data.lastYaw, 0);
		return [inputs, 'success'];
	}

	// Stuck (missed jumps again and again): start again from the spawn
	if (on && on.kind !== 'spawn' && clock - data.since > STUCK_TIME) {
		data.since = clock;
		inputs.push({ action: 'explode', explode: {} });
		return [inputs, 'success'];
	}

	const plan = planToZone(game, data, known, zones)
		?? planLookout(game, data, known, zones)
		?? planFallback(game, data, known, zones);
	if (!plan) {
		steer(inputs, data, data.lastYaw, 0);
		return [inputs, 'success'];
	}

	const current = level.platforms[plan.path[0]];

	// Not on the last platform of the way yet: keep hopping
	if (plan.path.length >= 2) {
		hopTo(inputs, data, self, current, level.platforms[plan.path[1]], on);
		return [inputs, 'success'];
	}

	// On the last platform: go to the lookout spot and explode there
	if (plan.spot && on === current && walkTo(inputs, data, self, current, plan.spot.x, plan.spot.z))
		inputs.push({ action: 'explode', explode: {} });
	else if (plan.spot && on !== current)
		steer(inputs, data, yawToward(self.x, self.z, plan.spot.x, plan.spot.z), 1);

	return [inputs, 'success'];
});


const root = (function () {
	return all([play]);
})();

export default describeBot(
	[{ root, data: dataConstructor }]
);

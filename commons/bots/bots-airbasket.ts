import { Fields } from "../Fields";
import { GMAirBasket, getVectorToReachTarget } from "../gamemods/GMAirBasket";
import { norm2 } from "../util/norm2";
import { botActionNodeHelper, describeBot } from "../Bot";

const { all, runner } = botActionNodeHelper<GMAirBasket, Data>();

type Player = InstanceType<typeof GMAirBasket.types.Player>;
type Bucket = InstanceType<typeof GMAirBasket.types.Bucket>;
type Team = 'red' | 'blue';
type Point = { x: number; y: number };

const PlayerT = GMAirBasket.types.Player;
const BallT = GMAirBasket.types.Ball;

/**
 * ================================================================
 * ANTICIPATING BOT OVERVIEW
 * ================================================================
 *
 * Every decision is based on predicted futures rather than on the
 * current positions:
 *
 * 1. FREE BALL (race):
 *    The ball trajectory is simulated (including the reset to the
 *    center when it leaves the arena). For each player we compute the
 *    earliest point of that trajectory they can reach in time. The two
 *    best interceptors of a team go for the ball, the others already
 *    position themselves for what comes next: support spots if their
 *    team will win the race, throw lanes to block if the enemy will.
 *
 * 2. ALLY CARRIER (offense):
 *    The carrier evaluates dunks (it falls and cannot jump), shots on
 *    every free bucket and passes, rejecting any trajectory an enemy
 *    can intercept. Wingers spread to distinct open buckets near the
 *    carrier, and one goes back to the center when a score is imminent
 *    (the ball resets there after a point).
 *
 * 3. ENEMY CARRIER (defense):
 *    The closest defender presses the carrier's predicted position
 *    (bumps can push it out of bounds). The others predict which
 *    buckets the carrier will most likely aim for and stand in the
 *    middle of those throw lanes to intercept the shot.
 *
 * Roles are assigned with the same deterministic greedy algorithm by
 * every bot of a team, so teammates never pick the same task.
 * ================================================================
 */

const INPUTS = {
	jump: { jump: {}, action: 'jump' },
	downOn: { downOn: {}, action: 'downOn' },
	downOff: { downOff: {}, action: 'downOff' },
	left: { left: {}, action: 'left' },
	right: { right: {}, action: 'right' },
	stop: { stop: {}, action: 'stop' },
	throwOff: { throwOff: {}, action: 'throwOff' },
};

const STATS = {
	FOCUS_Y: 200,
	JUMP_VY: 600,
	DEADZONE_X: 20,      // Prevents pixel-perfect robotic jittering
	CLIMB_SPEED: 650,    // Average upward speed while spamming jump
	DROP_SPEED: 1300,    // Average downward speed with gravity + push down
	REACTION: 0.1,       // Seconds added to every reach estimation
	BALL_HORIZON: 3,     // Seconds of free ball simulation
	BALL_STEP: 0.05,
	LANE_SAFE: 0.25,     // Minimal enemy delay (s) to consider a throw lane clear
	BACKUP_MARGIN: 0.35, // Second chaser goes if it can arrive this close to the best enemy
	PASS_RANGE: 2600,
};

const SAFE_X = GMAirBasket.DATA.X_LIMIT - 600;
const SAFE_Y_TOP = GMAirBasket.DATA.Y_LIMIT - 400;
const SAFE_Y_BOTTOM = GMAirBasket.DATA.Y_LIMIT - 700;
const CENTER: Point = { x: 0, y: -100 };

/* ================================================================
 * PREDICTION HELPERS
 * ================================================================ */

function clampSafe(p: Point): Point {
	return {
		x: Math.max(-SAFE_X, Math.min(SAFE_X, p.x)),
		y: Math.max(-SAFE_Y_TOP, Math.min(SAFE_Y_BOTTOM, p.y)),
	};
}

/** Rough estimation of the time (s) a player needs to reach a point. */
function reachTime(p: Player, x: number, y: number): number {
	let px = p.x, py = p.y, vx = p.vx, delay = 0;
	if (!p.isAlive()) {
		if (p.spawnX === null || p.spawnY === null) return Infinity;
		px = p.spawnX; py = p.spawnY; vx = 0; delay = p.alive;
	}

	// Current momentum carries the player a bit before it can turn
	const tx = Math.abs(x - px - vx * 0.1) / PlayerT.SPEED + 0.08;
	const dy = y - py;
	const ty = dy < 0 ? -dy / STATS.CLIMB_SPEED : dy / STATS.DROP_SPEED;
	return delay + Math.max(tx, ty) + STATS.REACTION;
}

function canGrab(game: GMAirBasket, idx: number) {
	// Before "grabber infinite", the last thrower cannot take the ball back
	return game.timeStep >= 1 || idx !== game.ball.prevGrabber;
}

interface BallSample extends Point { t: number }
interface Intercept extends Point { t: number; reachable: boolean }

/** Free ball positions over the next seconds (resets to center when OOB). */
function simulateBall(game: GMAirBasket): BallSample[] {
	const b = game.ball;
	const samples: BallSample[] = [];
	let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
	const limX = GMAirBasket.DATA.X_LIMIT - BallT.RADIUS / 2;
	const limY = GMAirBasket.DATA.Y_LIMIT - BallT.RADIUS / 2;

	for (let t = 0; t <= STATS.BALL_HORIZON; t += STATS.BALL_STEP) {
		samples.push({ t, x, y });
		vy += BallT.GRAVITY * STATS.BALL_STEP;
		x += vx * STATS.BALL_STEP;
		y += vy * STATS.BALL_STEP;
		if (x < -limX || x > limX || y < -limY || y > limY) {
			// Ball will be reset at the center: anticipate it
			x = 0; y = 0; vx = 0; vy = -BallT.SPAWN_JUMP;
		}
	}
	return samples;
}

function interceptBall(p: Player, samples: BallSample[]): Intercept {
	let best: BallSample = samples[samples.length - 1];
	let bestSlack = Infinity;
	for (const s of samples) {
		const slack = reachTime(p, s.x, s.y) - s.t;
		if (slack <= 0) return { ...s, reachable: true };
		if (slack < bestSlack) { bestSlack = slack; best = s; }
	}
	return { ...best, t: best.t + bestSlack, reachable: false };
}

interface ThrowPath { fx: number; fy: number; vx: number; vy: number; T: number }

function throwPath(from: Point, to: Point): ThrowPath | null {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (Math.abs(dx) < 1) return null;
	const v = getVectorToReachTarget(dx, dy, PlayerT.THROW, BallT.GRAVITY);
	if (!v.success || v.x === 0) return null;
	const T = dx / v.x;
	if (!(T > 0) || T > 4) return null;

	const path = { fx: from.x, fy: from.y, vx: v.x, vy: v.y, T };
	// Reject lobs leaving the arena (the ball would be reset)
	for (let t = 0; t <= T; t += 0.1) {
		const pt = pathPoint(path, t);
		if (Math.abs(pt.x) > GMAirBasket.DATA.X_LIMIT - 100 || Math.abs(pt.y) > GMAirBasket.DATA.Y_LIMIT - 100) {
			return null;
		}
	}
	return path;
}

function pathPoint(path: ThrowPath, t: number): Point {
	return {
		x: path.fx + path.vx * t,
		y: path.fy + path.vy * t + 0.5 * BallT.GRAVITY * t * t,
	};
}

interface LaneRisk {
	/** Minimal margin (s) an enemy has before reaching the ball along the path. */
	slack: number;
	/** Where the fastest enemy would catch the ball (null if nobody can). */
	catchPoint: Point | null;
}

function laneRisk(game: GMAirBasket, path: ThrowPath, team: Team): LaneRisk {
	let slack = Infinity;
	let catchPoint: Point | null = null;
	let catchT = Infinity;
	for (const p of game.players) {
		if (p.team === team || !p.isAlive()) continue;
		for (let t = 0.1; t <= path.T; t += 0.1) {
			const pt = pathPoint(path, t);
			// Ball radius + player size give a generous grab tolerance
			const s = reachTime(p, pt.x, pt.y) - t - 0.1;
			if (s < slack) slack = s;
			if (s <= 0.1 && t < catchT) { catchT = t; catchPoint = pt; }
		}
	}
	return { slack, catchPoint };
}

/**
 * Estimated seconds a carrier placed at `from` needs to score, ignoring
 * defenders. `direct` tells whether it can score without moving first.
 */
function scoringDelay(game: GMAirBasket, from: Point & { vy: number }): { delay: number; direct: boolean } {
	let best = Infinity;
	let nearest = Infinity;
	for (const b of freeBuckets(game)) {
		const dunk = dunkTime(from, b);
		if (dunk !== null) best = Math.min(best, dunk);
		const path = throwPath(from, b);
		if (path) best = Math.min(best, path.T + 0.2);
		nearest = Math.min(nearest, Math.sqrt(norm2(b.x - from.x, b.y - from.y)));
	}
	if (Number.isFinite(best)) return { delay: best, direct: true };
	// Has to travel (or pass) first
	return { delay: 1.5 + nearest / PlayerT.SPEED, direct: false };
}

/**
 * Value of a throw lane: clear, contested by an enemy who could not score
 * right after the catch (acceptable), or handing an easy point to them.
 */
function laneValue(game: GMAirBasket, path: ThrowPath, team: Team): number {
	const risk = laneRisk(game, path, team);
	if (risk.slack > STATS.LANE_SAFE) return 1.5;
	if (!risk.catchPoint) return 0;
	const enemy = scoringDelay(game, { ...risk.catchPoint, vy: 0 });
	if (!enemy.direct) return -0.6;
	return enemy.delay > 1.5 ? -1.5 : -3;
}

/** Time for a falling carrier to reach a given height (null if never). */
function fallTime(p: Point & { vy: number }, targetY: number): number | null {
	const a = 0.5 * PlayerT.GRAB_GRAVITY;
	const c = -(targetY - p.y);
	const disc = p.vy * p.vy - 4 * a * c;
	if (disc < 0) return null;
	const sq = Math.sqrt(disc);
	const t1 = (-p.vy - sq) / (2 * a);
	const t2 = (-p.vy + sq) / (2 * a);
	if (t1 > 0) return t1;
	if (t2 > 0) return t2;
	return null;
}

function dunkTime(p: Point & { vy: number }, bucket: Bucket): number | null {
	const t = fallTime(p, bucket.y);
	if (t === null || t > 1.6) return null;
	const need = Math.max(0, Math.abs(bucket.x - p.x) - 40) / PlayerT.SPEED + 0.1;
	return need <= t ? t : null;
}

function freeBuckets(game: GMAirBasket) {
	return game.buckets.filter(b => b.team === null);
}

/**
 * Deterministic task assignment: tasks are processed by priority, each
 * one taken by the free teammate reaching it first. Every bot of a team
 * runs it with the same inputs, so they agree on who does what.
 */
function assignTask(mates: Player[], tasks: Point[], me: Player): number {
	const free = new Set(mates);
	for (let i = 0; i < tasks.length && free.size > 0; i++) {
		let best: Player | null = null;
		let bestT = Infinity;
		for (const m of free) {
			const t = reachTime(m, tasks[i].x, tasks[i].y);
			if (t < bestT) { bestT = t; best = m; }
		}
		if (!best) break;
		if (best === me) return i;
		free.delete(best);
	}
	return -1;
}

/* ================================================================
 * TACTICAL ANALYSIS
 * ================================================================ */

type CarrierPlan =
	| { kind: 'dunk'; bucket: Bucket; score: number }
	| { kind: 'throw'; target: Point; bucket: Bucket | null; score: number }
	| { kind: 'hold'; target: Point; score: number };

/** Height under which a carrier is considered lost (it dies at Y_LIMIT). */
const DEATH_Y = GMAirBasket.DATA.Y_LIMIT - 300;
const EDGE_X = GMAirBasket.DATA.X_LIMIT - 900;

const TOP_DEATH_Y = -GMAirBasket.DATA.Y_LIMIT + 150;

/** Seconds before the carrier leaves the arena (0 if its rise already dooms it). */
function timeToDeath(carrier: Player): number {
	// A carrier cannot jump nor stop its ascent: check its apex
	if (carrier.vy < 0) {
		const apex = carrier.y - carrier.vy * carrier.vy / (2 * PlayerT.GRAB_GRAVITY);
		if (apex < TOP_DEATH_Y) return 0;
	}
	return fallTime(carrier, DEATH_Y) ?? 0;
}

/**
 * Looks ahead along the carrier's fall: earliest moment (before `deadline`)
 * at which some open bucket can be dunked or shot, given that the carrier
 * can move horizontally meanwhile. Defenders are ignored here: it only
 * tells whether waiting can still lead to a point.
 */
function futureShot(game: GMAirBasket, carrier: Player, deadline: number): { x: number; t: number } | null {
	const buckets = freeBuckets(game);
	for (const b of buckets) {
		if (dunkTime(carrier, b) !== null) return { x: b.x, t: 0 };
	}

	for (let t = 0.2; t <= deadline; t += 0.2) {
		const y = carrier.y + carrier.vy * t + 0.5 * PlayerT.GRAB_GRAVITY * t * t;
		const range = Math.max(0, t - 0.1) * PlayerT.SPEED;
		const minX = Math.max(-SAFE_X, carrier.x - range);
		const maxX = Math.min(SAFE_X, carrier.x + range);
		let best: { x: number; t: number; d: number } | null = null;

		for (const b of buckets) {
			const side = Math.sign(carrier.x - b.x) || 1;
			for (const k of [300, 900, 1500, 2200]) {
				const x = Math.max(minX, Math.min(maxX, b.x + side * k));
				if (!throwPath({ x, y }, b)) continue;
				const d = Math.abs(x - carrier.x);
				if (!best || d < best.d) best = { x, t, d };
			}
		}
		if (best) return { x: best.x, t: best.t };
	}
	return null;
}

interface PlanCache { game: GMAirBasket; tick: number; idx: number; key: string; plan: CarrierPlan }
let planCache: PlanCache | null = null;

function planCarrier(game: GMAirBasket, idx: number): CarrierPlan {
	const carrier = game.players[idx];
	const key = `${carrier.x},${carrier.y},${carrier.vx},${carrier.vy}`;
	if (planCache && planCache.game === game && planCache.tick === game.internalFrameTick && planCache.idx === idx && planCache.key === key) {
		return planCache.plan;
	}
	const plan = computeCarrierPlan(game, idx);
	planCache = { game, tick: game.internalFrameTick, idx, key, plan };
	return plan;
}

function computeCarrierPlan(game: GMAirBasket, idx: number): CarrierPlan {
	const carrier = game.players[idx];
	const team = carrier.team;
	const buckets = freeBuckets(game);

	let bestDunk: CarrierPlan | null = null;
	let bestShot: CarrierPlan | null = null;
	let bestPass: CarrierPlan | null = null;
	let fallbackPass: Point | null = null;
	const better = (a: CarrierPlan | null, b: CarrierPlan) => (!a || b.score > a.score ? b : a);

	// Dunks: no interception possible, only bumps
	for (const b of buckets) {
		const t = dunkTime(carrier, b);
		if (t === null) continue;
		let enemyDelay = Infinity;
		for (const p of game.players) {
			if (p.team === team || !p.isAlive()) continue;
			enemyDelay = Math.min(enemyDelay, reachTime(p, b.x, b.y - 60) - t);
		}
		bestDunk = better(bestDunk, { kind: 'dunk', bucket: b, score: 4 - t + (enemyDelay > 0.2 ? 2 : enemyDelay > 0 ? 0.5 : -1.5) });
	}

	// Shots on buckets (a contested shot is still fine if the interceptor cannot score)
	for (const b of buckets) {
		const path = throwPath(carrier, b);
		if (!path) continue;
		bestShot = better(bestShot, {
			kind: 'throw', target: { x: b.x, y: b.y }, bucket: b,
			score: 3.5 - path.T * 0.8 + laneValue(game, path, team),
		});
	}

	// Passes must bring the ball closer to a point than keeping it
	const own = scoringDelay(game, carrier);
	let closestMate = Infinity;
	for (let i = 0; i < game.players.length; i++) {
		const mate = game.players[i];
		if (i === idx || mate.team !== team || !mate.isAlive()) continue;

		const d2 = norm2(mate.x - carrier.x, mate.y - carrier.y);
		if (d2 < closestMate) { closestMate = d2; fallbackPass = clampSafe(mate); }
		if (d2 > STATS.PASS_RANGE ** 2) continue;

		// Aim where the teammate will be when the ball arrives
		let target: Point = mate;
		let path = throwPath(carrier, target);
		if (path) {
			target = clampSafe({ x: mate.x + mate.vx * path.T * 0.5, y: mate.y });
			path = throwPath(carrier, target);
		}
		if (!path) continue;

		const receiver = scoringDelay(game, { x: target.x, y: target.y, vy: Math.max(0, mate.vy) });
		const gain = own.delay - (receiver.delay + path.T);
		if (gain < 0.2) continue;
		bestPass = better(bestPass, {
			kind: 'throw', target, bucket: null,
			score: 1.5 + Math.min(2, gain) + (receiver.direct ? 0.5 : 0) - path.T * 0.5 + laneValue(game, path, team),
		});
	}

	const deadline = timeToDeath(carrier);
	const urgent = deadline < 0.45 || Math.abs(carrier.x) > EDGE_X;

	// 1. Clear chances to score right now, or a pass that clearly progresses
	if (bestDunk && bestDunk.score >= 3) return bestDunk;
	if (bestShot && bestShot.score >= 3) return bestShot;
	if (bestPass && bestPass.score >= 3) return bestPass;

	// 2. Never die with the ball: release it with whatever is best
	if (urgent) {
		let plan: CarrierPlan | null = null;
		for (const p of [bestShot, bestPass]) if (p) plan = better(plan, p);
		if (plan) return plan;
		// No valid trajectory: still release it toward a mate or upward
		return { kind: 'throw', target: fallbackPass ?? { x: carrier.x * 0.5, y: carrier.y - 1500 }, bucket: null, score: -Infinity };
	}

	if (bestDunk) return bestDunk;

	// 3. Will waiting give us a bucket soon? If not, don't camp: move the ball
	const future = futureShot(game, carrier, deadline - 0.3);
	if (!future || future.t > 0.8) {
		let plan: CarrierPlan | null = null;
		for (const p of [bestShot, bestPass]) if (p && p.score > 0) plan = better(plan, p);
		if (plan) return plan;
	}

	// 4. Fall toward the spot where the shot will open up
	return { kind: 'hold', target: { x: future ? future.x : (fallbackPass?.x ?? 0), y: DEATH_Y }, score: -Infinity };
}

/** Points where a carrier at `from` will most likely send the ball. */
function likelyLanes(game: GMAirBasket, from: Point & { vy: number }): Point[] {
	const lanes: { pt: Point; weight: number }[] = [];
	for (const b of freeBuckets(game)) {
		const dist = Math.sqrt(norm2(b.x - from.x, b.y - from.y));
		if (dunkTime(from, b) !== null) {
			// Stand right above the bucket to bump the diving carrier
			lanes.push({ pt: { x: b.x, y: b.y - 120 }, weight: dist * 0.6 });
			continue;
		}
		const path = throwPath(from, b);
		if (!path) continue;
		lanes.push({ pt: pathPoint(path, path.T * 0.55), weight: dist });
	}
	lanes.sort((a, b) => a.weight - b.weight);
	return lanes.map(l => clampSafe(l.pt));
}

/** Open spots where wingers can receive a pass and score right away. */
function supportSpots(game: GMAirBasket, from: Point, exclude: Bucket | null, team: Team): Point[] {
	const spots: { pt: Point; weight: number }[] = [];
	for (const b of freeBuckets(game)) {
		if (b === exclude) continue;
		const dx = from.x - b.x, dy = from.y - b.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist > STATS.PASS_RANGE + 600) continue;

		let guarded = 0;
		for (const p of game.players) {
			if (p.team === team || !p.isAlive()) continue;
			if (norm2(p.x - b.x, p.y - b.y) < 500 * 500) guarded++;
		}
		// Slightly above the bucket and toward the carrier: catch, then fall in.
		// Slide toward the carrier until a pass can actually reach the spot.
		let pt = clampSafe({ x: b.x, y: b.y - 250 });
		for (let k = Math.min(350, dist * 0.3); k <= dist * 0.8; k += 300) {
			pt = clampSafe({ x: b.x + dx * k / dist, y: b.y + dy * k / dist - 250 });
			if (throwPath(from, pt)) break;
		}
		spots.push({ pt, weight: dist + guarded * 1500 });
	}
	spots.sort((a, b) => a.weight - b.weight);
	return spots.map(s => clampSafe(s.pt));
}

interface FreeBallAnalysis {
	tick: number;
	game: GMAirBasket;
	key: string;
	intercepts: Intercept[];
}

let freeBallCache: FreeBallAnalysis | null = null;

function analyzeFreeBall(game: GMAirBasket): FreeBallAnalysis {
	// The ball state is part of the key in case the game was reloaded without ticking
	const b = game.ball;
	const key = `${b.x},${b.y},${b.vx},${b.vy},${b.prevGrabber}`;
	if (freeBallCache && freeBallCache.game === game && freeBallCache.tick === game.internalFrameTick && freeBallCache.key === key) {
		return freeBallCache;
	}
	const samples = simulateBall(game);
	const intercepts = game.players.map((p, i) => {
		if (!canGrab(game, i)) return { x: 0, y: 0, t: Infinity, reachable: false };
		return interceptBall(p, samples);
	});
	freeBallCache = { tick: game.internalFrameTick, game, key, intercepts };
	return freeBallCache;
}

/* ================================================================
 * MOVEMENT
 * ================================================================ */

class Data {
	private lastAvoidOOBTick = 0;
	private dir = 0;
	private pushDownStates: Record<number, boolean> = {};
	// Per-bot offset: breaks perfectly symmetric races (two simultaneous touches grab nothing)
	private readonly biasX = (Math.random() - 0.5) * 80;

	/**
	 * HARD BOUNDS SAFETY SYSTEM:
	 * Prevents players from dying or going out of bounds.
	 * Overrides all tactical movement if dangerously close to limits.
	 */
	avoidOOB(game: GMAirBasket, player: Player, inputs: Fields[]): { overrideX: boolean; nearBottom: boolean } {
		if (game.internalFrameTick === this.lastAvoidOOBTick) {
			const nearBottom = player.y >= GMAirBasket.DATA.Y_LIMIT - 650;
			return { overrideX: this.isNearXBounds(player), nearBottom };
		}
		this.lastAvoidOOBTick = game.internalFrameTick;

		// Large safety margins to counter heavy momentum and gravity acceleration
		const MARGIN_X = 500;
		const MARGIN_Y_BOTTOM = 650;
		const MARGIN_Y_TOP = 300;

		let overrideX = false;

		// --- 1. HORIZONTAL SAFETY (X BOUNDS) ---
		if (player.x >= GMAirBasket.DATA.X_LIMIT - MARGIN_X) {
			this.goLeft(inputs);
			overrideX = true;
		} else if (player.x <= -GMAirBasket.DATA.X_LIMIT + MARGIN_X) {
			this.goRight(inputs);
			overrideX = true;
		}

		// --- 2. VERTICAL SAFETY (Y BOUNDS & PIT DEATH) ---
		const nearBottom = player.y >= GMAirBasket.DATA.Y_LIMIT - MARGIN_Y_BOTTOM;

		if (nearBottom) {
			// Hard cut-off: kill all active push-down flags immediately
			this.pushDownStates[0] = false;
			this.pushDownStates[1] = false;
			inputs.push(INPUTS.downOff);

			// Spam jump aggressively to overcome downward velocity
			inputs.push(INPUTS.jump);
		} else if (player.y <= -GMAirBasket.DATA.Y_LIMIT + MARGIN_Y_TOP) {
			// Too high: push down to stay in play area
			this.pushDown(true, 0, inputs);
		} else {
			this.pushDown(false, 0, inputs);
		}

		return { overrideX, nearBottom };
	}

	private isNearXBounds(player: Player): boolean {
		const MARGIN_X = 500;
		return (
			player.x >= GMAirBasket.DATA.X_LIMIT - MARGIN_X ||
			player.x <= -GMAirBasket.DATA.X_LIMIT + MARGIN_X
		);
	}

	pushDown(active: boolean, slot: number, inputs: Fields[]) {
		if (active) {
			const wasIdle = Object.values(this.pushDownStates).every(v => !v);
			this.pushDownStates[slot] = true;
			if (wasIdle) inputs.push(INPUTS.downOn);
		} else if (this.pushDownStates[slot]) {
			this.pushDownStates[slot] = false;
			if (Object.values(this.pushDownStates).every(v => !v)) inputs.push(INPUTS.downOff);
		}
	}

	goLeft(inputs: Fields[]) { if (this.dir === -1) return; this.dir = -1; inputs.push(INPUTS.left); }
	goRight(inputs: Fields[]) { if (this.dir === 1) return; this.dir = 1; inputs.push(INPUTS.right); }
	goStop(inputs: Fields[]) { if (this.dir === 0) return; this.dir = 0; inputs.push(INPUTS.stop); }

	steerX(player: Player, x: number, inputs: Fields[], safety: { overrideX: boolean }) {
		if (safety.overrideX) return;
		const dx = x - player.x;
		if (dx < -STATS.DEADZONE_X) this.goLeft(inputs);
		else if (dx > STATS.DEADZONE_X) this.goRight(inputs);
		else this.goStop(inputs);
	}

	/**
	 * Steers towards target, yielding control if safety overrides are active.
	 */
	reach(
		player: Player,
		target: Point,
		inputs: Fields[],
		safety: { overrideX: boolean; nearBottom: boolean }
	) {
		target = clampSafe({ x: target.x + this.biasX, y: target.y });
		this.steerX(player, target.x, inputs, safety);

		const dy = target.y - player.y;

		// Vertical steering with absolute ban on pushDown near the pit
		if (dy < 0) {
			// Never jump past the ceiling: grabbing the ball while rising would be fatal
			const apex = player.y - PlayerT.JUMP * PlayerT.JUMP / (2 * GMAirBasket.DATA.GRAVITY);
			if (player.vy > -STATS.JUMP_VY && apex > -GMAirBasket.DATA.Y_LIMIT + 200) inputs.push(INPUTS.jump);
			this.pushDown(false, 1, inputs);
		} else if (dy > STATS.FOCUS_Y && !safety.nearBottom) {
			this.pushDown(true, 1, inputs);
		} else {
			this.pushDown(false, 1, inputs);
		}
	}

	/**
	 * Carrier steering: it cannot jump, so it only aligns horizontally and
	 * pushes down when it is already aligned enough to land in the bucket.
	 */
	dive(player: Player, target: Point, inputs: Fields[], safety: { overrideX: boolean; nearBottom: boolean }) {
		this.steerX(player, target.x, inputs, safety);
		const fall = fallTime(player, target.y);
		const need = Math.abs(target.x - player.x) / PlayerT.SPEED;
		const hurry = fall !== null && target.y > player.y && need < fall * 0.4;
		this.pushDown(hurry && !safety.nearBottom, 1, inputs);
	}
}

function dataConstructor(): Data {
	return new Data();
}

/* ================================================================
 * ROLES
 * ================================================================ */

function teammates(game: GMAirBasket, team: Team, excludeIdx: number) {
	return game.players.filter((p, i) => i !== excludeIdx && p.team === team && p.isAlive());
}

function playCarrier(game: GMAirBasket, data: Data, playerIdx: number, inputs: Fields[], safety: { overrideX: boolean; nearBottom: boolean }) {
	const player = game.players[playerIdx];
	const plan = planCarrier(game, playerIdx);

	switch (plan.kind) {
		case 'dunk':
			data.dive(player, plan.bucket, inputs, safety);
			return false;

		case 'throw':
			inputs.push({ throwTarget: { x: plan.target.x, y: plan.target.y }, action: 'throwTarget' });
			return true;

		case 'hold':
			// Waiting for a shot: never accelerate the fall
			data.steerX(player, plan.target.x, inputs, safety);
			data.pushDown(false, 1, inputs);
			return false;
	}
}

function playOffense(game: GMAirBasket, data: Data, player: Player, carrierIdx: number, inputs: Fields[], safety: { overrideX: boolean; nearBottom: boolean }) {
	const carrier = game.players[carrierIdx];
	const plan = planCarrier(game, carrierIdx);
	const tasks: Point[] = [];

	// A point is coming: the ball will reset at the center, be there first
	const scoring = plan.kind === 'dunk' || (plan.kind === 'throw' && plan.bucket !== null && plan.score >= 3);
	if (scoring) tasks.push(CENTER);

	const exclude = plan.kind === 'dunk' ? plan.bucket : plan.kind === 'throw' ? plan.bucket : null;
	const from = clampSafe({ x: carrier.x + carrier.vx * 0.3, y: carrier.y + carrier.vy * 0.3 });
	tasks.push(...supportSpots(game, from, exclude, player.team));

	const mates = teammates(game, player.team, carrierIdx);
	const task = assignTask(mates, tasks, player);
	if (task >= 0) {
		data.reach(player, tasks[task], inputs, safety);
	} else {
		// Nothing left to cover: stay close to the carrier as a passing option
		data.reach(player, { x: carrier.x + (player.x < carrier.x ? -700 : 700), y: carrier.y - 200 }, inputs, safety);
	}
}

function playDefense(game: GMAirBasket, data: Data, player: Player, carrier: Player & { vy: number }, inputs: Fields[], safety: { overrideX: boolean; nearBottom: boolean }) {
	// The carrier falls under GRAB_GRAVITY: predict where it will be
	const predict = (t: number): Point => clampSafe({
		x: carrier.x + carrier.vx * t,
		y: carrier.y + carrier.vy * t + 0.5 * PlayerT.GRAB_GRAVITY * t * t,
	});

	const mates = teammates(game, player.team, -1);
	let presser: Player | null = null;
	let presserT = Infinity;
	for (const m of mates) {
		const t = reachTime(m, carrier.x, carrier.y);
		if (t < presserT) { presserT = t; presser = m; }
	}

	if (presser === player) {
		// Aim at where the carrier will be when we arrive (two refinement passes)
		let t = Math.min(1.2, presserT);
		for (let i = 0; i < 2; i++) {
			const p = predict(t);
			t = Math.min(1.2, reachTime(player, p.x, p.y));
		}
		data.reach(player, predict(t), inputs, safety);
		return;
	}

	// Cut the throw lanes the carrier is about to use
	const from = { ...predict(0.15), vy: carrier.vy + PlayerT.GRAB_GRAVITY * 0.15 };
	const tasks = likelyLanes(game, from);
	tasks.push(CENTER);

	const task = assignTask(mates.filter(m => m !== presser), tasks, player);
	data.reach(player, task >= 0 ? tasks[task] : predict(0.8), inputs, safety);
}

function playFreeBall(game: GMAirBasket, data: Data, playerIdx: number, inputs: Fields[], safety: { overrideX: boolean; nearBottom: boolean }) {
	const player = game.players[playerIdx];
	const team = player.team;
	const { intercepts } = analyzeFreeBall(game);

	const order: number[] = [];
	let enemyBest: Intercept | null = null;
	for (let i = 0; i < game.players.length; i++) {
		const p = game.players[i];
		if (!p.isAlive() && p.alive > 1) continue;
		if (p.team === team) {
			order.push(i);
		} else if (!enemyBest || intercepts[i].t < enemyBest.t) {
			enemyBest = intercepts[i];
		}
	}
	order.sort((a, b) => intercepts[a].t - intercepts[b].t);

	const rank = order.indexOf(playerIdx);
	const mine = intercepts[playerIdx];
	const enemyT = enemyBest ? enemyBest.t : Infinity;
	const eligible = Number.isFinite(mine.t);

	if (eligible && rank === 0) {
		// Hopeless race: go where the enemy will grab it to bump it right away
		if (enemyBest && enemyT + 0.25 < mine.t) data.reach(player, enemyBest, inputs, safety);
		else data.reach(player, mine, inputs, safety);
		return;
	}

	if (eligible && rank === 1 && mine.t < enemyT + STATS.BACKUP_MARGIN) {
		data.reach(player, mine, inputs, safety);
		return;
	}

	// Not chasing: prepare what comes right after the grab
	const chasers = order.slice(0, 2).filter(i => i !== playerIdx && Number.isFinite(intercepts[i].t));
	const others = order.filter(i => !chasers.includes(i)).map(i => game.players[i]);
	const ours = order.length > 0 ? intercepts[order[0]] : null;

	let tasks: Point[];
	if (ours && ours.t <= enemyT) {
		tasks = supportSpots(game, ours, null, team);
	} else if (enemyBest) {
		tasks = likelyLanes(game, { x: enemyBest.x, y: enemyBest.y, vy: 0 });
	} else {
		tasks = [];
	}

	const task = assignTask(others, tasks, player);
	data.reach(player, task >= 0 ? tasks[task] : mine, inputs, safety);
}

const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const player = game.players[playerIdx];

	if (!player.isAlive()) {
		return [[INPUTS.throwOff], 'success'];
	}

	// Execute safety check first and capture active overrides
	const safety = data.avoidOOB(game, player, inputs);

	let threwThisTick = false;
	const grabberIdx = game.ball.grabber;

	if (grabberIdx === playerIdx) {
		threwThisTick = playCarrier(game, data, playerIdx, inputs, safety);
	} else if (grabberIdx >= 0) {
		const grabber = game.players[grabberIdx];
		if (grabber.team === player.team) {
			playOffense(game, data, player, grabberIdx, inputs, safety);
		} else {
			playDefense(game, data, player, grabber, inputs, safety);
		}
	} else {
		playFreeBall(game, data, playerIdx, inputs, safety);
	}

	if (!threwThisTick) {
		inputs.push(INPUTS.throwOff);
	}

	return [inputs, 'success'];
});

const root = all([method]);

export default describeBot(
	[{root, data: dataConstructor}]
);

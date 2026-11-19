import { Fields } from "../../Fields";
import {
	AIR_ACCEL,
	AIR_DECEL,
	COYOTE_TIME,
	EXPLODE_COOLDOWN,
	FALL_GRAVITY_FACTOR,
	GRAVITY,
	GROUND_ACCEL,
	GROUND_DECEL,
	JUMP_BUFFER,
	JUMP_CUT,
	JUMP_VELOCITY,
	MATCH_DURATION,
	MAX_FALL_SPEED,
	PAINT_RADIUS,
	PLAYER_BOUNCE,
	PLAYER_FEET,
	PLAYER_RADIUS,
	PLAYER_SPEED,
	RESPAWN_DELAY,
	TURN_BOOST,
	ZONE_COUNT,
	ZONE_POINTS,
} from "./constants";
import { isAbove, Level, Platform, pointBoxDistance } from "./level";
import { TrustPhysics } from "./physics";

/* -------------------------------------------------------------------------- */
/* Shared game rules: players, paint splats, zones, scores.                   */
/* Everything here is deterministic (no randomness after the level seed).     */
/* -------------------------------------------------------------------------- */

/** How far (vertically) the feet may be from the top of a zone to count as standing on it. */
const ZONE_FEET_TOLERANCE = 0.35;
/** All zones visited. */
const ALL_ZONES_MASK = (1 << ZONE_COUNT) - 1;


/** Forward direction (on the ground plane) for a yaw. yaw = 0 looks toward -z (three.js convention). */
export function forwardOf(yaw: number) {
	return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Right direction (on the ground plane) for a yaw. */
export function rightOf(yaw: number) {
	return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}


export class Player {
	connected = true;

	/** Center of the capsule */
	x = 0;
	y = 0;
	z = 0;
	/** Velocity (the horizontal part has some inertia) */
	vx = 0;
	vy = 0;
	vz = 0;

	/** Requested movement, relative to the view: strafe (-1 left, 1 right) and forward (-1 back, 1 forward) */
	moveX = 0;
	moveZ = 0;
	/** View direction (radians) */
	yaw = 0;

	grounded = false;
	/** Time left during which a jump is still allowed after leaving the ground */
	coyote = 0;
	/** Time left during which a pressed jump waits for the ground */
	jumpBuffer = 0;
	explodeCooldown = 0;
	/** > 0 after exploding: seconds left before respawning (the player is gone meanwhile) */
	respawnTimer = 0;

	score = 0;
	/** Bit i set = zone i already reached */
	zones = 0;
	/** Number of explosions (statistics shown in the HUD) */
	explosions = 0;

	constructor(readonly idx: number) {}

	/** Exploded, waiting to respawn. */
	isDead() {
		return this.respawnTimer > 0;
	}

	/** Altitude of the feet. */
	feet() {
		return this.y - PLAYER_FEET;
	}

	hasZone(zone: number) {
		return (this.zones & (1 << zone)) !== 0;
	}

	zoneCount() {
		let n = 0;
		for (let i = 0; i < ZONE_COUNT; i++)
			if (this.hasZone(i))
				n++;
		return n;
	}

	save(): Fields {
		return {
			connected: this.connected,
			x: this.x, y: this.y, z: this.z, vx: this.vx, vy: this.vy, vz: this.vz,
			moveX: this.moveX, moveZ: this.moveZ, yaw: this.yaw,
			grounded: this.grounded, coyote: this.coyote, jumpBuffer: this.jumpBuffer,
			explodeCooldown: this.explodeCooldown,
			respawnTimer: this.respawnTimer,
			score: this.score, zones: this.zones, explosions: this.explosions,
		};
	}

	load(o: Fields) {
		this.connected = o.connected ?? true;
		this.x = o.x ?? 0;
		this.y = o.y ?? 0;
		this.z = o.z ?? 0;
		this.vx = o.vx ?? 0;
		this.vy = o.vy ?? 0;
		this.vz = o.vz ?? 0;
		this.moveX = o.moveX ?? 0;
		this.moveZ = o.moveZ ?? 0;
		this.yaw = o.yaw ?? 0;
		this.grounded = o.grounded ?? false;
		this.coyote = o.coyote ?? 0;
		this.jumpBuffer = o.jumpBuffer ?? 0;
		this.explodeCooldown = o.explodeCooldown ?? 0;
		this.respawnTimer = o.respawnTimer ?? 0;
		this.score = o.score ?? 0;
		this.zones = o.zones ?? 0;
		this.explosions = o.explosions ?? 0;
	}
}


/** A paint explosion: everything closer than PAINT_RADIUS gets the color of `player`. */
export class Splat {
	constructor(
		public id = 0,
		public x = 0,
		public y = 0,
		public z = 0,
		public player = 0,
		/** Game clock (seconds since the start) when it exploded */
		public time = 0,
	) {}

	save(): Fields {
		return { id: this.id, x: this.x, y: this.y, z: this.z, player: this.player, time: this.time };
	}

	static load(o: Fields) {
		return new Splat(o.id ?? 0, o.x ?? 0, o.y ?? 0, o.z ?? 0, o.player ?? 0, o.time ?? 0);
	}

	/** Does this explosion paint (at least a part of) the platform? */
	touches(p: Platform) {
		return pointBoxDistance(p, this.x, this.y, this.z) < PAINT_RADIUS;
	}
}


/** Everything the rules need to read or write. Implemented by GMTrustIssues. */
export interface TrustState {
	readonly level: Level;
	readonly players: Player[];
	splats: Splat[];
	/** zoneArrivals[z] = indices of the players who reached the zone z, in arrival order */
	zoneArrivals: number[][];
	nextSplatId: number;
	time: number;
	finished: boolean;
}


/* ---------------------------- Spawning ---------------------------- */

/** Spawn position of a player: around the center of the spawn platform. */
export function spawnPoint(state: TrustState, idx: number) {
	const spawn = state.level.spawn;
	const angle = idx * Math.PI * 2 / Math.max(1, state.players.length);
	return {
		x: spawn.x + Math.cos(angle) * 2,
		y: spawn.top + PLAYER_FEET + 0.05,
		z: spawn.z + Math.sin(angle) * 2,
	};
}

/** Put a player back on the spawn, motionless. Its view direction is kept. */
export function respawn(state: TrustState, player: Player) {
	const p = spawnPoint(state, player.idx);
	player.x = p.x;
	player.y = p.y;
	player.z = p.z;
	player.vx = 0;
	player.vy = 0;
	player.vz = 0;
	player.respawnTimer = 0;
	player.grounded = false;
	player.coyote = 0;
	player.jumpBuffer = 0;
}

/** Place every player on the spawn, looking at the first zone. */
export function initialSpawn(state: TrustState) {
	const zone = state.level.zones[0];
	for (const p of state.players) {
		respawn(state, p);
		p.yaw = Math.atan2(-(zone.x - p.x), -(zone.z - p.z));
	}
}


/* ---------------------------- Actions ---------------------------- */

/**
 * E: the player explodes. The paint splat is recorded (it colors the platforms
 * around). The player stays where it exploded (gone, motionless) for
 * RESPAWN_DELAY, so it can look at what got painted, then respawns.
 */
export function explode(state: TrustState, player: Player) {
	if (state.finished || player.explodeCooldown > 0 || player.isDead())
		return;

	state.splats.push(new Splat(
		state.nextSplatId++,
		player.x, player.y, player.z,
		player.idx,
		MATCH_DURATION - state.time,
	));
	player.explosions++;
	player.explodeCooldown = EXPLODE_COOLDOWN;
	player.vx = 0;
	player.vy = 0;
	player.vz = 0;
	player.grounded = false;
	player.jumpBuffer = 0;
	player.respawnTimer = RESPAWN_DELAY;
}

/** Space: remember the jump for a short time (it happens as soon as the player can jump). */
export function queueJump(player: Player) {
	if (player.isDead())
		return;
	player.jumpBuffer = JUMP_BUFFER;
}


/**
 * Space released: a jump still going up is cut short, so a tap gives a small
 * hop and holding gives the full jump.
 */
export function releaseJump(player: Player) {
	player.jumpBuffer = 0;
	if (!player.isDead() && player.vy > 0)
		player.vy *= JUMP_CUT;
}

/** Gravity for a vertical speed: stronger while falling. */
export function gravityFor(vy: number) {
	return vy > 0 ? GRAVITY : GRAVITY * FALL_GRAVITY_FACTOR;
}

/**
 * Time before feet at altitude `feet`, going at `vy`, come down to `top`
 * (null when the jump never gets that high). Used by the bots to aim.
 */
export function timeToLand(feet: number, vy: number, top: number) {
	let t = 0;
	if (vy > 0) {
		t = vy / GRAVITY;
		feet += vy * vy / (2 * GRAVITY);
	}
	const fallVy = Math.min(0, vy);
	const g = GRAVITY * FALL_GRAVITY_FACTOR;
	const drop = feet - top;
	const disc = fallVy * fallVy + 2 * g * drop;
	if (disc < 0 || drop < -1e-6)
		return null;
	return t + (fallVy + Math.sqrt(disc)) / g;
}


/* ---------------------------- Step ---------------------------- */

/** Advance the whole game by dt seconds. */
export function stepWorld(state: TrustState, physics: TrustPhysics, dt: number) {
	if (state.finished)
		return;

	state.time -= dt;
	if (state.time <= 0) {
		state.time = 0;
		state.finished = true;
		return;
	}

	for (const p of state.players)
		stepPlayer(state, physics, p, dt);
	resolvePlayerCollisions(state, physics);

	if (isOver(state))
		state.finished = true;
}

/** Timers, jump, gravity, movement (through the character controller), falls and zones. */
function stepPlayer(state: TrustState, physics: TrustPhysics, p: Player, dt: number) {
	p.explodeCooldown = Math.max(0, p.explodeCooldown - dt);

	// Exploded: wait (motionless, out of the game) before going back to the spawn
	if (p.isDead()) {
		p.respawnTimer -= dt;
		if (p.respawnTimer <= 0)
			respawn(state, p);
		return;
	}

	p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
	p.coyote = p.grounded ? COYOTE_TIME : Math.max(0, p.coyote - dt);

	// Jump (buffered, with coyote time)
	if (p.jumpBuffer > 0 && p.coyote > 0) {
		p.vy = JUMP_VELOCITY;
		p.jumpBuffer = 0;
		p.coyote = 0;
		p.grounded = false;
	}

	// Gravity
	p.vy = Math.max(-MAX_FALL_SPEED, p.vy - gravityFor(p.vy) * dt);

	updateHorizontalSpeed(p, dt);

	// On the ground, the body is not pushed into the floor: the character
	// controller would sometimes take that contact for a wall and stop the walk
	// (snap-to-ground keeps the body on the floor anyway)
	const pushingDown = p.grounded && p.vy <= 0;
	const desired = { x: p.vx * dt, y: pushingDown ? 0 : p.vy * dt, z: p.vz * dt };
	const moved = physics.movePlayer(p.idx, p, desired);
	p.x += moved.dx;
	p.y += moved.dy;
	p.z += moved.dz;

	// Hitting a wall stops the motion toward it
	if (dt > 0) {
		if (Math.abs(moved.dx - desired.x) > 1e-4)
			p.vx = moved.dx / dt;
		if (Math.abs(moved.dz - desired.z) > 1e-4)
			p.vz = moved.dz / dt;
	}

	// Landing stops the fall, a ceiling stops the jump
	if (moved.grounded && p.vy < 0)
		p.vy = 0;
	if (p.vy > 0 && moved.dy < desired.y - 1e-4)
		p.vy = 0;
	p.grounded = moved.grounded;

	if (p.y < state.level.killY) {
		respawn(state, p);
		return;
	}

	checkZones(state, p);
}

/** Can this player collide with the others? (not while waiting to respawn, not once gone) */
function isSolid(p: Player) {
	return p.connected && !p.isDead();
}

/**
 * Players are vertical capsules that collide with each other. Overlapping
 * players are pushed apart (half each, through the character controller so
 * nobody goes through a platform), and when they were getting closer they
 * exchange part of their speed: running into someone shoves him.
 * Pairs are handled in a fixed order: the result is deterministic.
 */
function resolvePlayerCollisions(state: TrustState, physics: TrustPhysics) {
	const players = state.players;
	const minDist = PLAYER_RADIUS * 2;

	for (let i = 0; i < players.length; i++) {
		for (let j = i + 1; j < players.length; j++) {
			const a = players[i];
			const b = players[j];
			if (!isSolid(a) || !isSolid(b) || Math.abs(a.y - b.y) >= PLAYER_FEET * 2)
				continue;

			let nx = b.x - a.x;
			let nz = b.z - a.z;
			let dist = Math.hypot(nx, nz);
			if (dist >= minDist)
				continue;

			// Exactly on top of each other (rare): separate along a fixed direction
			if (dist < 1e-6) {
				const angle = (i * 7 + j * 13) * 0.7;
				nx = Math.cos(angle);
				nz = Math.sin(angle);
				dist = 0;
			} else {
				nx /= dist;
				nz /= dist;
			}

			pushApart(physics, a, b, nx, nz, minDist - dist);
			exchangeSpeed(a, b, nx, nz);
		}
	}
}

/** Move a and b away from each other along n (a -> b), half of the overlap each. */
function pushApart(physics: TrustPhysics, a: Player, b: Player, nx: number, nz: number, overlap: number) {
	const half = overlap / 2 + 1e-3;
	for (const [p, sign] of [[a, -1], [b, 1]] as const) {
		const moved = physics.movePlayer(p.idx, p, { x: nx * half * sign, y: 0, z: nz * half * sign });
		p.x += moved.dx;
		p.z += moved.dz;
	}
}

/**
 * If a and b were getting closer along n, share their speed along n like two
 * equal masses bumping (a bit of bounce): the faster one shoves the other.
 */
function exchangeSpeed(a: Player, b: Player, nx: number, nz: number) {
	const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
	if (closing <= 0)
		return;
	const impulse = closing * (1 + PLAYER_BOUNCE) / 2;
	a.vx -= impulse * nx;
	a.vz -= impulse * nz;
	b.vx += impulse * nx;
	b.vz += impulse * nz;
}

/**
 * Inertia: the horizontal velocity moves toward the wanted one (keys, relative
 * to the view) by a limited amount per second. On the ground it reacts fast and
 * stops quickly; in the air the momentum is mostly kept.
 */
function updateHorizontalSpeed(p: Player, dt: number) {
	const f = forwardOf(p.yaw);
	const r = rightOf(p.yaw);
	let mx = r.x * p.moveX + f.x * p.moveZ;
	let mz = r.z * p.moveX + f.z * p.moveZ;
	const len = Math.hypot(mx, mz);
	if (len > 1) {
		mx /= len;
		mz /= len;
	}

	const moving = len > 0;
	let rate = p.grounded
		? (moving ? GROUND_ACCEL : GROUND_DECEL)
		: (moving ? AIR_ACCEL : AIR_DECEL);

	// Turning around: the more the wanted direction is against the motion, the stronger
	const speed = Math.hypot(p.vx, p.vz);
	if (moving && speed > 0.5) {
		const against = -(p.vx * mx + p.vz * mz) / (speed * Math.hypot(mx, mz));
		if (against > 0)
			rate *= 1 + TURN_BOOST * against;
	}

	const dvx = mx * PLAYER_SPEED - p.vx;
	const dvz = mz * PLAYER_SPEED - p.vz;
	const dist = Math.hypot(dvx, dvz);
	if (dist < 1e-6)
		return;
	const step = Math.min(dist, rate * dt);
	p.vx += dvx / dist * step;
	p.vz += dvz / dist * step;
}

/** A player standing on a zone he never reached gets its points, then goes back to the spawn. */
function checkZones(state: TrustState, p: Player) {
	if (!p.grounded)
		return;

	for (const zone of state.level.zones) {
		if (!isAbove(zone, p.x, p.z) || Math.abs(p.feet() - zone.top) > ZONE_FEET_TOLERANCE)
			continue;

		if (!p.hasZone(zone.zone)) {
			const arrivals = state.zoneArrivals[zone.zone];
			p.score += ZONE_POINTS[arrivals.length] ?? 0;
			arrivals.push(p.idx);
			p.zones |= 1 << zone.zone;
		}
		respawn(state, p);
		return;
	}
}

/**
 * The game stops early when nobody can score anymore: every zone already gave
 * all its points, or every connected player reached every zone.
 */
function isOver(state: TrustState) {
	const scorers = Math.min(ZONE_POINTS.length, state.players.length);
	if (state.zoneArrivals.every(a => a.length >= scorers))
		return true;

	const active = state.players.filter(p => p.connected);
	return active.length > 0 && active.every(p => p.zones === ALL_ZONES_MASK);
}


/* ---------------------------- Ranking ---------------------------- */

/** Compare two players: higher score first, then more zones. 0 = tie. */
export function compareStanding(a: Player, b: Player) {
	return (b.score - a.score) || (b.zoneCount() - a.zoneCount());
}

/** Player indices sorted from the best to the worst (stable on ties). */
export function ranking(players: Player[]) {
	return players.map(p => p.idx).sort((a, b) => compareStanding(players[a], players[b]) || a - b);
}

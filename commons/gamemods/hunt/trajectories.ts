import {
	BOMB_FLIGHT_TIME,
	BOMB_MAX_RANGE,
	BOMB_RADIUS,
	BOOMERANG_MIN_REACH,
	BOOMERANG_REACH,
	BOOMERANG_RADIUS,
	BOOMERANG_SIDE,
	BOOMERANG_TIME,
	DASH_DISTANCE,
	EXPLOSION_RADIUS,
	EXPLOSION_RAYS,
	GRAVITY,
	GUN_HEIGHT,
	MAX_FALL_SPEED,
	PREVIEW_MAX_STEPS,
	PREVIEW_STEP,
	STEP_HEIGHT,
	SUPER_JUMP_MAX_RISE,
	SUPER_JUMP_RANGE,
	SUPER_JUMP_TIME,
} from "./constants";
import { Box, Entity, Player, Vec3 } from "./entities";
import { BodyHit, HuntPhysics } from "./physics";

/* -------------------------------------------------------------------------- */
/* Motion of the items. The simulation and the client previews call the same  */
/* functions, so what the preview shows is what the item will do.             */
/* -------------------------------------------------------------------------- */

export interface BallisticBody extends Vec3 {
	vx: number;
	vy: number;
	vz: number;
}

/** Horizontal vector toward the aim, shortened to `range`. */
function reach(p: Vec3, aim: Vec3, range: number) {
	let dx = aim.x - p.x;
	let dy = aim.y - p.y;
	const dist = Math.hypot(dx, dy);
	if (dist > range) {
		dx *= range / dist;
		dy *= range / dist;
	}
	return { dx, dy };
}

/** Unit horizontal direction toward the aim (the facing angle when the aim is on the player). */
export function aimDirection(p: Player, aim: Vec3) {
	const dx = aim.x - p.x;
	const dy = aim.y - p.y;
	const d = Math.hypot(dx, dy);
	if (d < 1)
		return { x: Math.cos(p.facing), y: Math.sin(p.facing) };
	return { x: dx / d, y: dy / d };
}

/**
 * Apply gravity to a body and land it on the surface under it.
 * Returns true when it stands on the ground after this step.
 */
export function fall(physics: HuntPhysics, b: Vec3 & { vz: number }, dt: number, self: Entity | null) {
	const ground = physics.groundHeight(b.x, b.y, b.z, self);
	b.vz = Math.max(-MAX_FALL_SPEED, b.vz - GRAVITY * dt);
	b.z += b.vz * dt;
	if (b.z <= ground) {
		b.z = ground;
		b.vz = 0;
		return true;
	}
	return false;
}


/* ---------------------------- Bomb ---------------------------- */

/** Initial state of a bomb thrown by `p`: an arc landing on the aimed surface (range limited). */
export function bombLaunch(physics: HuntPhysics, p: Player, aim: Vec3): BallisticBody {
	const { dx, dy } = reach(p, aim, BOMB_MAX_RANGE);
	const startZ = p.z + GUN_HEIGHT;
	const targetZ = physics.groundHeight(p.x + dx, p.y + dy, Math.max(aim.z, p.z));
	const T = BOMB_FLIGHT_TIME;
	return {
		x: p.x, y: p.y, z: startZ,
		vx: dx / T, vy: dy / T,
		vz: (targetZ - startZ + 0.5 * GRAVITY * T * T) / T,
	};
}

/** Players a bomb thrown by `owner` explodes on. */
function bombTouches(owner: number) {
	return (e: Entity) => e instanceof Player && e.idx !== owner && e.isTargetable();
}

/**
 * Move a bomb by dt. Returns the point where it explodes (it touched an obstacle,
 * a box or a player, or it landed), or null while it keeps flying.
 */
export function stepBomb(physics: HuntPhysics, b: BallisticBody, owner: number, dt: number): Vec3 | null {
	const vz = Math.max(-MAX_FALL_SPEED, b.vz - GRAVITY * dt);
	const dx = b.vx * dt;
	const dy = b.vy * dt;
	const dz = vz * dt;

	const hit = physics.castBall(b.x, b.y, b.z, dx, dy, dz, BOMB_RADIUS, bombTouches(owner));
	if (hit) {
		b.x += dx * hit.toi;
		b.y += dy * hit.toi;
		b.z += dz * hit.toi;
		return { x: b.x, y: b.y, z: Math.max(0, b.z - BOMB_RADIUS) };
	}

	b.x += dx;
	b.y += dy;
	b.z += dz;
	b.vz = vz;

	const ground = physics.groundHeight(b.x, b.y, b.z);
	if (b.z - BOMB_RADIUS <= ground && b.vz < 0)
		return { x: b.x, y: b.y, z: ground };

	return null;
}

/**
 * Area blasted by an explosion at (x, y, z): a polygon of EXPLOSION_RAYS points,
 * each one stopped by the first obstacle (walls hide what is behind them).
 */
export function explosionZone(physics: HuntPhysics, x: number, y: number, z: number) {
	const points: { x: number; y: number }[] = [];
	for (let i = 0; i < EXPLOSION_RAYS; i++) {
		const a = i / EXPLOSION_RAYS * Math.PI * 2;
		const ux = Math.cos(a);
		const uy = Math.sin(a);
		const d = physics.rayDistance(x, y, z + STEP_HEIGHT, ux, uy, EXPLOSION_RADIUS);
		points.push({ x: x + ux * d, y: y + uy * d });
	}
	return points;
}


/* ---------------------------- Boomerang ---------------------------- */

export interface BoomerangThrow {
	originX: number;
	originY: number;
	dirX: number;
	dirY: number;
	reach: number;
}

/** Throw parameters of a boomerang: the apex of its loop is on the aimed point (range limited). */
export function boomerangThrow(p: Player, aim: Vec3): BoomerangThrow {
	const dir = aimDirection(p, aim);
	const dist = Math.hypot(aim.x - p.x, aim.y - p.y);
	return {
		originX: p.x,
		originY: p.y,
		dirX: dir.x,
		dirY: dir.y,
		reach: Math.max(BOOMERANG_MIN_REACH, Math.min(BOOMERANG_REACH, dist)),
	};
}

/**
 * Point of a boomerang loop at the progress u (0 .. 1).
 * It goes out passing on the right of the throw direction and comes back on the
 * left. The loop is anchored on the throw point at first, then more and more on
 * the owner (anchorX, anchorY), so it comes back to the owner even if it moved.
 */
export function boomerangPoint(t: BoomerangThrow, u: number, anchorX: number, anchorY: number) {
	const w = u * u;
	const ax = t.originX + (anchorX - t.originX) * w;
	const ay = t.originY + (anchorY - t.originY) * w;
	const forward = t.reach * Math.sin(Math.PI * u);
	const side = BOOMERANG_SIDE * Math.sin(Math.PI * 2 * u);
	// Right of (dirX, dirY) on the screen (y down) is (-dirY, dirX)
	return {
		x: ax + t.dirX * forward - t.dirY * side,
		y: ay + t.dirY * forward + t.dirX * side,
	};
}

/** Entities a boomerang thrown by `owner` catches (on top of the boxes, which always stop it). */
export function boomerangCatches(owner: number) {
	return (e: Entity) => e instanceof Player && e.idx !== owner && e.isTargetable();
}

/** True when a boomerang hit is a catch (something with life) rather than a wall. */
export function isCatch(hit: BodyHit) {
	return hit.entity instanceof Player || hit.entity instanceof Box;
}

/** Flight time of the boomerang between two progress values. */
export function boomerangProgress(u: number, dt: number) {
	return Math.min(1, u + dt / BOOMERANG_TIME);
}

/**
 * Path of a boomerang thrown right now (the owner is supposed not to move).
 * Stops at the first thing it touches.
 */
export function traceBoomerang(physics: HuntPhysics, p: Player, aim: Vec3) {
	const t = boomerangThrow(p, aim);
	const z = p.z + GUN_HEIGHT;
	const accept = boomerangCatches(p.idx);
	const points: Vec3[] = [{ x: p.x, y: p.y, z }];
	let hit: BodyHit | null = null;

	let u = 0;
	for (let i = 0; i < PREVIEW_MAX_STEPS && u < 1 && !hit; i++) {
		const prev = points[points.length - 1];
		u = boomerangProgress(u, PREVIEW_STEP);
		const next = boomerangPoint(t, u, p.x, p.y);
		hit = physics.castBall(prev.x, prev.y, z, next.x - prev.x, next.y - prev.y, 0, BOOMERANG_RADIUS, accept);
		const k = hit ? hit.toi : 1;
		points.push({ x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k, z });
	}

	return { points, hit };
}


/* ---------------------------- Dash ---------------------------- */

/** Straight path of a dash started right now, cut by the first obstacle. */
export function traceDash(physics: HuntPhysics, p: Player, aim: Vec3) {
	const dir = aimDirection(p, aim);
	const end = physics.movePlayer(p, dir.x * DASH_DISTANCE, dir.y * DASH_DISTANCE, p);
	return {
		from: { x: p.x, y: p.y, z: p.z },
		to: { x: end.x, y: end.y, z: p.z },
	};
}


/* ---------------------------- Super jump ---------------------------- */

/** Velocity of a super jump toward the aimed point (range limited). */
export function leapLaunch(physics: HuntPhysics, p: Player, aim: Vec3) {
	const { dx, dy } = reach(p, aim, SUPER_JUMP_RANGE);
	const maxZ = p.z + SUPER_JUMP_MAX_RISE;
	const targetZ = Math.min(maxZ, physics.groundHeight(p.x + dx, p.y + dy, maxZ));
	const T = SUPER_JUMP_TIME;
	return {
		vx: dx / T,
		vy: dy / T,
		vz: (targetZ - p.z + 0.5 * GRAVITY * T * T) / T,
	};
}

/** Move a leaping body by dt (sliding along walls). Returns true when it landed. */
export function stepLeap(physics: HuntPhysics, b: BallisticBody, dt: number, self: Entity | null) {
	const moved = physics.movePlayer(b, b.vx * dt, b.vy * dt, self);
	b.x = moved.x;
	b.y = moved.y;
	return fall(physics, b, dt, self);
}

/** Path of the feet during a super jump started right now. */
export function traceLeap(physics: HuntPhysics, p: Player, aim: Vec3) {
	const body: BallisticBody = { x: p.x, y: p.y, z: p.z, ...leapLaunch(physics, p, aim) };
	const points: Vec3[] = [{ x: body.x, y: body.y, z: body.z }];
	for (let i = 0; i < PREVIEW_MAX_STEPS; i++) {
		const landed = stepLeap(physics, body, PREVIEW_STEP, p);
		points.push({ x: body.x, y: body.y, z: body.z });
		if (landed)
			break;
	}
	return points;
}

/** Path of a bomb thrown right now, and where it explodes. */
export function traceBomb(physics: HuntPhysics, p: Player, aim: Vec3) {
	const body = bombLaunch(physics, p, aim);
	const points: Vec3[] = [{ x: body.x, y: body.y, z: body.z }];
	let end: Vec3 | null = null;
	for (let i = 0; i < PREVIEW_MAX_STEPS && !end; i++) {
		end = stepBomb(physics, body, p.idx, PREVIEW_STEP);
		points.push({ x: body.x, y: body.y, z: body.z });
	}
	return { points, end: end ?? points[points.length - 1] };
}

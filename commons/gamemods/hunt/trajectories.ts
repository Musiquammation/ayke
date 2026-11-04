import {
	BOMB_FLIGHT_TIME,
	BOMB_MAX_RANGE,
	BOMB_RADIUS,
	EXPLOSION_RADIUS,
	EXPLOSION_RAYS,
	GRAVITY,
	GUN_HEIGHT,
	MAX_FALL_SPEED,
	PREVIEW_MAX_STEPS,
	PREVIEW_STEP,
	SHELL_ARM_TIME,
	SHELL_COUNT,
	SHELL_MAX_BOUNCES,
	SHELL_PREVIEW_LENGTH,
	SHELL_RADIUS,
	SHELL_SPEED,
	SHELL_SPREAD,
	STEP_HEIGHT,
	SUPER_JUMP_MAX_RISE,
	SUPER_JUMP_RANGE,
	SUPER_JUMP_TIME,
	WEAPONS,
} from "./constants";
import { Entity, Player, Vec3 } from "./entities";
import { HuntPhysics } from "./physics";

/* -------------------------------------------------------------------------- */
/* Motion of the items (and shapes of the shots). The simulation and the      */
/* client previews call the same functions, so what the preview shows is what */
/* the item will do.                                                          */
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

/** Players a bomb thrown by `owner` explodes on (it cannot touch its thrower in flight). */
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


/* ---------------------------- Shells ---------------------------- */

/** A shell: slides on the ground and bounces on the walls. */
export interface ShellBody extends BallisticBody {
	owner: number;
	bounces: number;
	armTime: number;
}

/** Gap kept between a bouncing shell and the wall it bounced on. */
const SHELL_SKIN = 1;

/** Initial states of the shells thrown by `p`, fanned out around the aim direction. */
export function shellLaunch(p: Player, aim: Vec3): ShellBody[] {
	const dir = aimDirection(p, aim);
	const base = Math.atan2(dir.y, dir.x);
	return Array.from({ length: SHELL_COUNT }, (_, i) => {
		const a = base + (i - (SHELL_COUNT - 1) / 2) * SHELL_SPREAD;
		return {
			x: p.x, y: p.y, z: p.z,
			vx: Math.cos(a) * SHELL_SPEED,
			vy: Math.sin(a) * SHELL_SPEED,
			vz: 0,
			owner: p.idx,
			bounces: 0,
			armTime: SHELL_ARM_TIME,
		};
	});
}

/** Players a shell touches: anybody, its thrower only once it is armed. */
function shellTouches(s: ShellBody) {
	return (e: Entity) => e instanceof Player && e.isTargetable() && (s.armTime <= 0 || e.idx !== s.owner);
}

/**
 * Move a shell by dt (z is the altitude of its bottom): it slides, bounces on the
 * walls and falls from the edges. Returns the player it touched, 'broken' once it
 * bounced more than SHELL_MAX_BOUNCES times, or null while it keeps sliding.
 */
export function stepShell(physics: HuntPhysics, s: ShellBody, dt: number): Player | 'broken' | null {
	s.armTime = Math.max(0, s.armTime - dt);
	const dx = s.vx * dt;
	const dy = s.vy * dt;
	// Like a walking body, obstacles lower than STEP_HEIGHT are ignored
	const z = s.z + STEP_HEIGHT + SHELL_RADIUS;

	const hit = physics.castBall(s.x, s.y, z, dx, dy, 0, SHELL_RADIUS, shellTouches(s));
	if (!hit) {
		s.x += dx;
		s.y += dy;
	} else {
		const len = Math.hypot(dx, dy);
		const advance = len > 0 ? Math.max(0, hit.toi * len - SHELL_SKIN) / len : 0;
		s.x += dx * advance;
		s.y += dy * advance;
		if (hit.entity instanceof Player)
			return hit.entity;

		// Bounce: mirror the velocity on the wall
		const into = s.vx * hit.nx + s.vy * hit.ny;
		if (into < 0) {
			s.vx -= 2 * into * hit.nx;
			s.vy -= 2 * into * hit.ny;
		}
		s.x += hit.nx * SHELL_SKIN;
		s.y += hit.ny * SHELL_SKIN;
		if (++s.bounces > SHELL_MAX_BOUNCES)
			return 'broken';
	}

	fall(physics, s, dt, null);
	return null;
}

/** Paths of the shells thrown right now (cut after SHELL_PREVIEW_LENGTH, or where they stop). */
export function traceShells(physics: HuntPhysics, p: Player, aim: Vec3) {
	return shellLaunch(p, aim).map(s => {
		const points: Vec3[] = [{ x: s.x, y: s.y, z: s.z }];
		let travelled = 0;
		let end: Player | 'broken' | null = null;
		for (let i = 0; i < PREVIEW_MAX_STEPS * 2 && travelled < SHELL_PREVIEW_LENGTH && !end; i++) {
			const prev = points[points.length - 1];
			end = stepShell(physics, s, PREVIEW_STEP);
			travelled += Math.hypot(s.x - prev.x, s.y - prev.y);
			points.push({ x: s.x, y: s.y, z: s.z });
		}
		return { points, hit: end instanceof Player };
	});
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


/* ---------------------------- Weapons ---------------------------- */

/** Length of each shape cast along a bullet path (the casts check the altitude per step). */
const SHOT_TRACE_STEP = 80;
/** Rays used to draw the angular sector of a scattered shot. */
const SECTOR_RAYS = 32;

/** Direction (3D unit vector) of a bullet leaving the gun of `p` toward `target`. */
function bulletDirection(p: Player, target: Vec3) {
	const z = p.z + GUN_HEIGHT;
	const dx = target.x - p.x;
	const dy = target.y - p.y;
	const dz = target.z - z;
	const len = Math.hypot(dx, dy, dz);
	if (len < 1)
		return { x: Math.cos(p.facing), y: Math.sin(p.facing), z: 0 };
	return { x: dx / len, y: dy / len, z: dz / len };
}

/**
 * Straight path of a bullet of the current weapon fired toward the aim, cut by the
 * first obstacle or opponent it would hit (without taking homing into account).
 */
export function traceShot(physics: HuntPhysics, p: Player, aim: Vec3) {
	const def = WEAPONS[p.weapon];
	const dir = bulletDirection(p, aim);
	const from = { x: p.x, y: p.y, z: p.z + GUN_HEIGHT };
	const hittable = (e: Entity) => e instanceof Player && e !== p && e.isTargetable();

	let travelled = 0;
	let hit = false;
	while (travelled < def.range) {
		const step = Math.min(SHOT_TRACE_STEP, def.range - travelled);
		const h = physics.castBall(
			from.x + dir.x * travelled, from.y + dir.y * travelled, from.z + dir.z * travelled,
			dir.x * step, dir.y * step, dir.z * step, def.radius, hittable
		);
		if (h) {
			travelled += step * h.toi;
			hit = true;
			break;
		}
		travelled += step;
	}

	const to = {
		x: from.x + dir.x * travelled,
		y: from.y + dir.y * travelled,
		z: from.z + dir.z * travelled,
	};
	return { from, to, hit };
}

/**
 * Angular sector covered by the pellets of a scattered shot: they land in a disc of
 * `scatter` radius around the aim, so the sector opens by atan(scatter / distance).
 * Each ray is stopped by the first obstacle.
 */
export function shotSector(physics: HuntPhysics, p: Player, aim: Vec3) {
	const def = WEAPONS[p.weapon];
	const center = { x: p.x, y: p.y, z: p.z };
	const dir = aimDirection(p, aim);
	const dist = Math.hypot(aim.x - p.x, aim.y - p.y);
	const half = Math.atan2(def.scatter, Math.max(1, dist));
	const base = Math.atan2(dir.y, dir.x);
	const z = p.z + GUN_HEIGHT;

	const points: { x: number; y: number }[] = [];
	for (let i = 0; i <= SECTOR_RAYS; i++) {
		const a = base - half + i / SECTOR_RAYS * half * 2;
		const ux = Math.cos(a);
		const uy = Math.sin(a);
		const d = physics.rayDistance(p.x, p.y, z, ux, uy, def.range, p);
		points.push({ x: p.x + ux * d, y: p.y + uy * d });
	}
	return { center, points };
}

import RAPIER from '@dimforge/rapier2d-compat';
import { ALL, GROUP_PLAYER, GROUP_STATIC, groups, spansOverlap } from "./collision";
import { GROUND_PROBE_RATIO, PLAYER_HEIGHT, PLAYER_RADIUS, STEP_HEIGHT } from "./constants";
import { Entity, Player, Vec3 } from "./entities";

/* -------------------------------------------------------------------------- */
/* Rapier wrapper.                                                            */
/*                                                                            */
/* Rapier only knows the ground plane (x, y). Altitude (z) is handled here:   */
/* every entity gives its vertical span [base, top], and query predicates     */
/* ignore the entities whose span does not overlap the moving body.           */
/*                                                                            */
/* The Rapier world is NOT part of the shared state: each entity copies its   */
/* state into its collider at every sync, so loads are safe.                  */
/* -------------------------------------------------------------------------- */

/** Movement is split in several shape casts so bodies slide along walls. */
const SLIDE_ITERATIONS = 4;
/** Distance kept between a moving shape and the obstacles. */
const SKIN = 0.5;

export interface BodyHit {
	entity: Entity;
	toi: number;
	/** Outward normal of what was hit, on the ground plane. */
	nx: number;
	ny: number;
}

let rapierReady: Promise<void> | null = null;
let rapierLoaded = false;

/** Load Rapier's WASM module once (calling RAPIER.init twice is harmless, but useless). */
export function ensureRapier() {
	if (!rapierReady)
		rapierReady = RAPIER.init().then(() => { rapierLoaded = true; });
	return rapierReady;
}

/** True once Rapier can be used synchronously. */
export function isRapierReady() {
	return rapierLoaded;
}


export class HuntPhysics {
	private readonly world: RAPIER.World;
	/** Collider handle -> entity owning it. */
	private readonly owners = new Map<number, Entity>();
	private readonly bodies: Entity[] = [];

	// Reused query shapes (allocating Rapier shapes every tick is wasteful)
	readonly playerShape = new RAPIER.Ball(PLAYER_RADIUS);
	private readonly probeShape = new RAPIER.Ball(PLAYER_RADIUS * GROUND_PROBE_RATIO);
	private readonly balls = new Map<number, RAPIER.Ball>();

	/**
	 * Create the physics world with a collider for every entity having a body.
	 * `ensureRapier()` must have been awaited before. The entities must stay the
	 * same objects for the whole game (loads update them in place).
	 */
	constructor(entities: Entity[]) {
		this.world = new RAPIER.World({ x: 0, y: 0 });
		for (const e of entities) {
			const c = e.attachBody(this.world);
			if (c) {
				this.owners.set(c.handle, e);
				this.bodies.push(e);
			}
		}
		this.refresh();
	}

	/** Get (and cache) a ball shape of the given radius. */
	ball(radius: number) {
		let shape = this.balls.get(radius);
		if (!shape) {
			shape = new RAPIER.Ball(radius);
			this.balls.set(radius, shape);
		}
		return shape;
	}

	/** Copy the shared state of every entity into its collider, then update Rapier's structures. */
	sync() {
		for (const e of this.bodies)
			e.syncBody();
		this.refresh();
	}

	/** Let Rapier update its broad phase after colliders moved (no dynamic body, so nothing else moves). */
	private refresh() {
		this.world.step();
	}

	/** Predicate: does this collider block a walking body spanning [z0, z1]? */
	private blockers(z0: number, z1: number, self: Entity | null) {
		return (c: RAPIER.Collider) => {
			const e = this.owners.get(c.handle);
			if (!e || e === self || !e.blocksMovement())
				return false;
			const s = e.span();
			return s !== null && spansOverlap(z0, z1, s.base, s.top);
		};
	}

	/**
	 * Move a shape by (dx, dy) from (x, y), sliding along the obstacles overlapping
	 * the vertical span [z0, z1]. Returns the reached position.
	 */
	slide(shape: RAPIER.Shape, x: number, y: number, dx: number, dy: number, z0: number, z1: number, self: Entity | null) {
		const blocks = this.blockers(z0, z1, self);

		for (let i = 0; i < SLIDE_ITERATIONS; i++) {
			const len = Math.hypot(dx, dy);
			if (len < 1e-6)
				break;

			const hit = this.world.castShape(
				{ x, y }, 0, { x: dx, y: dy }, shape,
				0, 1, false,
				undefined, groups(ALL, GROUP_STATIC), undefined, undefined,
				blocks
			);

			if (!hit) {
				x += dx;
				y += dy;
				break;
			}

			// Advance until the contact, keeping a small gap, so the next cast along the
			// wall does not touch it again
			const toi = hit.time_of_impact;
			const advance = Math.max(0, toi * len - SKIN) / len;
			x += dx * advance;
			y += dy * advance;
			const rest = 1 - toi;
			dx *= rest;
			dy *= rest;

			// normal1 is the outward normal of the obstacle, in world space.
			// Keep only the tangential part of the remaining motion.
			const nx = hit.normal1.x;
			const ny = hit.normal1.y;
			const into = dx * nx + dy * ny;
			if (into < 0) {
				dx -= into * nx;
				dy -= into * ny;
			}
		}

		return { x, y };
	}

	/** Move a player-sized body (feet at altitude z) by (dx, dy), sliding along obstacles. */
	movePlayer(p: Vec3, dx: number, dy: number, self: Entity | null) {
		return this.slide(this.playerShape, p.x, p.y, dx, dy, p.z + STEP_HEIGHT, p.z + PLAYER_HEIGHT, self);
	}

	/** Move an entity with a body (a box) by (dx, dy), sliding along the other obstacles. */
	moveEntity(e: Entity & Vec3, dx: number, dy: number, height: number) {
		const body = e.getBody();
		if (!body)
			return { x: e.x + dx, y: e.y + dy };
		return this.slide(body.shape, e.x, e.y, dx, dy, e.z + STEP_HEIGHT, e.z + height, e);
	}

	/**
	 * Push a player out of the obstacles it overlaps (it can happen when it lands
	 * on the edge of a crate, or when a box respawns or is dropped on it).
	 * Returns the corrected position.
	 */
	resolvePenetration(p: Player) {
		let x = p.x;
		let y = p.y;
		const blocks = this.blockers(p.z + STEP_HEIGHT, p.z + PLAYER_HEIGHT, p);

		for (let i = 0; i < SLIDE_ITERATIONS; i++) {
			let pushed = false;
			this.world.intersectionsWithShape(
				{ x, y }, 0, this.playerShape,
				c => {
					const contact = c.contactShape(this.playerShape, { x, y }, 0, 0);
					if (contact && contact.distance < 0) {
						// normal1: outward normal of the obstacle (world space)
						const push = -contact.distance + SKIN;
						x += contact.normal1.x * push;
						y += contact.normal1.y * push;
						pushed = true;
					}
					return true;
				},
				undefined, groups(ALL, GROUP_STATIC), undefined, undefined,
				blocks
			);
			if (!pushed)
				break;
		}

		return { x, y };
	}

	/**
	 * Altitude of the highest surface under (x, y) that a body with its feet
	 * at altitude `z` can stand on (i.e. not more than STEP_HEIGHT above it).
	 * Returns 0 (the floor) when there is nothing.
	 */
	groundHeight(x: number, y: number, z: number, self: Entity | null = null) {
		let ground = 0;
		this.world.intersectionsWithShape(
			{ x, y }, 0, this.probeShape,
			c => {
				const e = this.owners.get(c.handle);
				const s = e && e !== self && e.blocksMovement() ? e.span() : null;
				if (s && s.top <= z + STEP_HEIGHT && s.top > ground)
					ground = s.top;
				return true; // keep searching
			},
			undefined, groups(ALL, GROUP_STATIC)
		);
		return ground;
	}

	/** True when a player body standing at (x, y, z) would overlap an obstacle. */
	isBlocked(x: number, y: number, z: number) {
		let blocked = false;
		this.world.intersectionsWithShape(
			{ x, y }, 0, this.playerShape,
			() => {
				blocked = true;
				return false; // stop
			},
			undefined, groups(ALL, GROUP_STATIC), undefined, undefined,
			this.blockers(z + STEP_HEIGHT, z + PLAYER_HEIGHT, null)
		);
		return blocked;
	}

	/** True when the shape placed at (x, y), spanning [base, top], overlaps a living player. */
	overlapsPlayer(shape: RAPIER.Shape, x: number, y: number, base: number, top: number) {
		let found = false;
		this.world.intersectionsWithShape(
			{ x, y }, 0, shape,
			c => {
				const s = this.owners.get(c.handle)?.span();
				if (s && spansOverlap(s.base, s.top, base, top)) {
					found = true;
					return false;
				}
				return true;
			},
			undefined, groups(ALL, GROUP_PLAYER)
		);
		return found;
	}

	/**
	 * Cast a ball from (x, y) along (dx, dy) (the motion of this tick).
	 * The ball is at altitude z + t * dz at the fraction t of the motion.
	 * Obstacles always stop it; other entities only when `accept` returns true.
	 * Returns the first thing hit, or null.
	 */
	castBall(
		x: number, y: number, z: number,
		dx: number, dy: number, dz: number,
		radius: number,
		accept: (e: Entity) => boolean,
	): BodyHit | null {
		// Altitude range covered by the ball during this tick
		const zMin = Math.min(z, z + dz) - radius;
		const zMax = Math.max(z, z + dz) + radius;

		const predicate = (c: RAPIER.Collider) => {
			const e = this.owners.get(c.handle);
			const s = e?.span();
			if (!e || !s || !spansOverlap(zMin, zMax, s.base, s.top))
				return false;
			return e.blocksMovement() || accept(e);
		};

		const hit = this.world.castShape(
			{ x, y }, 0, { x: dx, y: dy }, this.ball(radius),
			0, 1, true,
			undefined, groups(ALL, GROUP_STATIC | GROUP_PLAYER), undefined, undefined,
			predicate
		);

		if (!hit)
			return null;
		return {
			entity: this.owners.get(hit.collider.handle)!,
			toi: hit.time_of_impact,
			nx: hit.normal1.x,
			ny: hit.normal1.y,
		};
	}

	/**
	 * Distance from (x, y) along the unit direction (ux, uy) to the first obstacle
	 * crossing the altitude z (capped at maxDist). `ignore` is never considered.
	 */
	rayDistance(x: number, y: number, z: number, ux: number, uy: number, maxDist: number, ignore: Entity | null = null) {
		const hit = this.world.castRay(
			new RAPIER.Ray({ x, y }, { x: ux, y: uy }), maxDist, true,
			undefined, groups(ALL, GROUP_STATIC), undefined, undefined,
			this.blockers(z, z + 1, ignore)
		);
		return hit ? hit.timeOfImpact : maxDist;
	}

	/** True when nothing blocks the segment (x0, y0) -> (x1, y1) at altitude z. */
	lineOfSight(x0: number, y0: number, x1: number, y1: number, z: number, ignore: Entity | null = null) {
		const d = Math.hypot(x1 - x0, y1 - y0);
		if (d < 1e-3)
			return true;
		return this.rayDistance(x0, y0, z, (x1 - x0) / d, (y1 - y0) / d, d, ignore) >= d - 1e-3;
	}
}

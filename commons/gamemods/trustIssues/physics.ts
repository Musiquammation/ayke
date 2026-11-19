import RAPIER from '@dimforge/rapier3d-compat';
import {
	CONTROLLER_OFFSET,
	GROUP_LEVEL,
	GROUP_PLAYER,
	PLAYER_HALF_HEIGHT,
	PLAYER_RADIUS,
} from "./constants";
import { Level } from "./level";

/* -------------------------------------------------------------------------- */
/* Rapier (3D) wrapper.                                                       */
/*                                                                            */
/* The world only holds fixed colliders (one cuboid per platform) and one     */
/* capsule per player, moved by a kinematic character controller.             */
/*                                                                            */
/* The Rapier world is NOT part of the shared state: before moving a player,  */
/* its collider is placed at the position stored in the shared state, so      */
/* loads (and rollbacks) are always safe.                                     */
/* -------------------------------------------------------------------------- */

let rapierReady: Promise<void> | null = null;
let rapierLoaded = false;

/** Load Rapier's WASM module once. */
export function ensureRapier() {
	if (!rapierReady)
		rapierReady = RAPIER.init().then(() => { rapierLoaded = true; });
	return rapierReady;
}

/** True once Rapier can be used synchronously. */
export function isRapierReady() {
	return rapierLoaded;
}

/** Rapier interaction groups: 16 bits of membership, 16 bits of filter. */
function groups(membership: number, filter: number) {
	return (membership << 16) | filter;
}

/** Result of a move: the motion actually done, and whether the body ends on the ground. */
export interface MoveResult {
	dx: number;
	dy: number;
	dz: number;
	grounded: boolean;
}

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}


export class TrustPhysics {
	private readonly world: RAPIER.World;
	private readonly controller: RAPIER.KinematicCharacterController;
	private readonly playerColliders: RAPIER.Collider[] = [];
	/** Only the level is considered by the controller (players walk through each other). */
	private readonly filter = groups(GROUP_PLAYER, GROUP_LEVEL);

	/** `ensureRapier()` must have been awaited before. */
	constructor(level: Level, playerCount: number) {
		this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });

		// Static level: one fixed cuboid per platform (spawn, zones and hidden ones)
		for (const p of level.platforms) {
			const desc = RAPIER.ColliderDesc.cuboid(p.w / 2, p.h / 2, p.d / 2)
				.setTranslation(p.x, p.top - p.h / 2, p.z)
				.setCollisionGroups(groups(GROUP_LEVEL, 0xffff));
			this.world.createCollider(desc);
		}

		// One capsule per player (moved by hand before each query)
		for (let i = 0; i < playerCount; i++) {
			const desc = RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
				.setTranslation(0, 1000 + i * 10, 0)
				.setCollisionGroups(groups(GROUP_PLAYER, 0));
			this.playerColliders.push(this.world.createCollider(desc));
		}

		this.controller = this.world.createCharacterController(CONTROLLER_OFFSET);
		this.controller.setUp({ x: 0, y: 1, z: 0 });
		this.controller.enableSnapToGround(0.25);
		// Climb small ledges: without it the capsule gets stuck on the edge of a slightly higher platform
		this.controller.enableAutostep(0.45, 0.1, false);
		this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
		this.controller.setApplyImpulsesToDynamicBodies(false);

		// Let Rapier build its acceleration structures (nothing is dynamic, nothing moves)
		this.world.step();
	}

	/**
	 * Move the capsule of a player from `pos` by `desired`, sliding along the
	 * platforms. Returns the motion actually done.
	 */
	movePlayer(idx: number, pos: Vec3, desired: Vec3): MoveResult {
		const collider = this.playerColliders[idx];
		collider.setTranslation(pos);
		this.controller.computeColliderMovement(collider, desired, undefined, this.filter);
		const m = this.controller.computedMovement();
		return {
			dx: m.x,
			dy: m.y,
			dz: m.z,
			grounded: this.controller.computedGrounded(),
		};
	}

	/** Free the WASM memory of the world. */
	dispose() {
		this.world.free();
	}
}

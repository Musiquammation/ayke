import RAPIER from '@dimforge/rapier2d-compat';
import type * as THREE from 'three';
import { Fields } from "../../../Fields";
import { Span } from "../collision";

/* -------------------------------------------------------------------------- */
/* Base classes of every game object.                                         */
/*                                                                            */
/* An Entity combines:                                                        */
/* - its shared state (save / load: exactly what goes over the network),      */
/* - an optional Rapier collider, mirroring that state in the physics world,  */
/* - a three.js model, created lazily the first time it is drawn (so the      */
/*   server never builds one).                                                */
/* -------------------------------------------------------------------------- */

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

/** Anything sent over the network. */
export interface Serializable {
	save(): Fields;
	load(obj: Fields): void;
}

/** Client-side information the models need to draw themselves. */
export interface ViewContext {
	readonly clock: number;
	readonly selfIdx: number;
	/** Direction of the local player's gun, computed on the client (null = use the shared one). */
	readonly selfFacing: number | null;
	color(playerIdx: number): string;
	/** Texture of the 'hunt' image folder, or null while it is missing. */
	texture(label: string): THREE.Texture | null;
}

/** Something with life: it can be shot and blown up. */
export interface Damageable {
	hp: number;
	readonly maxHp: number;
	/** False when it is not on the map (dead player, broken box). */
	isTargetable(): boolean;
	/** Point bullets aim at. */
	center(): Vec3;
	/** Radius on the ground plane, used by the cursor and the explosions. */
	hitRadius(): number;
}


export abstract class Entity implements Serializable {
	/** Rapier collider mirroring this entity (null when the entity has no body). */
	protected body: RAPIER.Collider | null = null;
	/** three.js model (null until the entity is drawn for the first time). */
	private model: THREE.Object3D | null = null;

	abstract save(): Fields;
	abstract load(obj: Fields): void;


	/* ---------- Physics ---------- */

	/** Description of the collider of this entity. Null = no body (bullets, effects...). */
	protected describeBody(): RAPIER.ColliderDesc | null {
		return null;
	}

	/** Create the collider in the world (called once by HuntPhysics). */
	attachBody(world: RAPIER.World) {
		const desc = this.describeBody();
		if (desc)
			this.body = world.createCollider(desc);
		this.syncBody();
		return this.body;
	}

	getBody() {
		return this.body;
	}

	/** Copy the shared state into the collider (position, enabled). */
	syncBody() {}

	/** Vertical span occupied right now, or null when the entity does not collide. */
	span(): Span | null {
		return null;
	}

	/** True when walking bodies are stopped by this entity. */
	blocksMovement() {
		return false;
	}


	/* ---------- Model ---------- */

	protected abstract createModel(view: ViewContext): THREE.Object3D;

	/** Copy the shared state into the model (position, animation, visibility). */
	protected abstract updateModel(model: THREE.Object3D, view: ViewContext): void;

	/** False when the entity must not be drawn (dead player, broken box). */
	isVisible() {
		return true;
	}

	/** The up-to-date model (created on the first call). */
	getModel(view: ViewContext) {
		this.model ??= this.createModel(view);
		this.updateModel(this.model, view);
		return this.model;
	}
}


/** An entity standing somewhere on the map: its position is part of the shared state. */
export abstract class PositionedEntity extends Entity implements Vec3 {
	x = 0;
	y = 0;
	z = 0;

	override save(): Fields {
		return { x: this.x, y: this.y, z: this.z };
	}

	override load(obj: Fields) {
		this.x = obj.x ?? 0;
		this.y = obj.y ?? 0;
		this.z = obj.z ?? 0;
	}
}


/** A positioned entity with a velocity. */
export abstract class MovingEntity extends PositionedEntity {
	vx = 0;
	vy = 0;
	vz = 0;

	override save(): Fields {
		return { ...super.save(), vx: this.vx, vy: this.vy, vz: this.vz };
	}

	override load(obj: Fields) {
		super.load(obj);
		this.vx = obj.vx ?? 0;
		this.vy = obj.vy ?? 0;
		this.vz = obj.vz ?? 0;
	}
}


/**
 * Load a list of entities in place: existing instances are reused (so they keep
 * their model), missing ones are created, extra ones are dropped.
 */
export function loadEntities<T extends Serializable>(list: T[], objs: Fields[] | undefined, create: () => T) {
	const data = objs ?? [];
	list.length = Math.min(list.length, data.length);
	for (const [i, obj] of data.entries()) {
		if (i >= list.length)
			list.push(create());
		list[i].load(obj);
	}
}

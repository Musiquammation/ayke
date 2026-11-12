import RAPIER from '@dimforge/rapier2d-compat';
import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { ALL, GROUP_STATIC, groups, Span } from "../collision";
import { ObstacleDef, ObstacleKind } from "../level";
import { Entity } from "./Entity";
import { place, solid, unitBox } from "./models";

/** Colors of each obstacle kind. */
const BLOCK_COLORS: Record<ObstacleKind, string> = {
	wall: "#4a4e69",
	pillar: "#5c677d",
	platform: "#8d6e63",
	crate: "#b08968",
	cover: "#6b705c",
};

/**
 * A static piece of the map: an axis-aligned rectangle extruded from `base` to `top`.
 * Its geometry comes from the level definition, so nothing about it is ever sent.
 */
export class Block extends Entity {
	constructor(readonly def: ObstacleDef) {
		super();
	}

	override save(): Fields {
		return {};
	}

	override load(_obj: Fields) {}

	protected override describeBody() {
		const o = this.def;
		return RAPIER.ColliderDesc.cuboid(o.w / 2, o.h / 2)
			.setTranslation(o.cx, o.cy)
			.setCollisionGroups(groups(GROUP_STATIC, ALL));
	}

	override span(): Span {
		return this.def;
	}

	override blocksMovement() {
		return true;
	}

	protected override createModel() {
		const o = this.def;
		const mesh = new THREE.Mesh(unitBox(), solid(BLOCK_COLORS[o.kind]));
		mesh.scale.set(o.w, o.h, o.top - o.base);
		place(mesh, o.cx, o.cy, (o.base + o.top) / 2);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		return mesh;
	}

	protected override updateModel() {}
}

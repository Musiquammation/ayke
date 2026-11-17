import RAPIER from '@dimforge/rapier2d-compat';
import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { ALL, GROUP_STATIC, groups, Span } from "../collision";
import { BOX_HEIGHT, BOX_HP, BOX_SIZE } from "../constants";
import { BoxSlotDef } from "../level";
import { Damageable, MovingEntity, ViewContext } from "./Entity";
import { place, solid, unitBox } from "./models";

const BOX_COLOR = "#d4a373";

/** A breakable box. It (re)spawns on its slot of the level. */
export class Box extends MovingEntity implements Damageable {
	readonly maxHp = BOX_HP;
	hp = BOX_HP;
	respawn = 0;
	breaks = 0;

	constructor(readonly slot: BoxSlotDef) {
		super();
		this.resetToSlot();
	}

	/** True when the box is standing (it blocks and can be shot). */
	isStanding() {
		return this.respawn <= 0;
	}

	/** Put the box back on its slot. */
	resetToSlot() {
		this.x = this.slot.cx;
		this.y = this.slot.cy;
		this.z = this.slot.base;
		this.vz = 0;
	}

	isTargetable() {
		return this.isStanding();
	}

	center() {
		return { x: this.x, y: this.y, z: this.z + BOX_HEIGHT / 2 };
	}

	hitRadius() {
		return BOX_SIZE * 0.6;
	}

	override save(): Fields {
		return {
			...super.save(),
			hp: this.hp, respawn: this.respawn, breaks: this.breaks,
		};
	}

	override load(obj: Fields) {
		super.load(obj);
		this.hp = obj.hp ?? BOX_HP;
		this.respawn = obj.respawn ?? 0;
		this.breaks = obj.breaks ?? 0;
	}

	/* ---------- Physics ---------- */

	protected override describeBody() {
		return RAPIER.ColliderDesc.cuboid(BOX_SIZE / 2, BOX_SIZE / 2)
			.setCollisionGroups(groups(GROUP_STATIC, ALL));
	}

	override syncBody() {
		this.body?.setTranslation({ x: this.x, y: this.y });
		this.body?.setEnabled(this.isStanding());
	}

	override span(): Span | null {
		return this.isStanding() ? { base: this.z, top: this.z + BOX_HEIGHT } : null;
	}

	override blocksMovement() {
		return true;
	}

	/* ---------- Model ---------- */

	override isVisible() {
		return this.isStanding();
	}

	protected override createModel(view: ViewContext) {
		const tex = view.texture('box');
		const material = tex
			? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
			: solid(BOX_COLOR);
		const mesh = new THREE.Mesh(unitBox(), material);
		mesh.scale.set(BOX_SIZE, BOX_SIZE, BOX_HEIGHT);
		mesh.castShadow = true;
		mesh.receiveShadow = true;

		// Dark cross on the top face, so the box reads as a crate without texture
		const group = new THREE.Group();
		group.add(mesh);
		if (!tex) {
			for (const sign of [1, -1]) {
				const bar = new THREE.Mesh(unitBox(), solid("#7f5539"));
				bar.scale.set(BOX_SIZE * 1.25, 8, 2);
				bar.position.z = BOX_HEIGHT / 2 + 1;
				bar.rotation.z = sign * Math.PI / 4;
				group.add(bar);
			}
		}
		return group;
	}

	protected override updateModel(model: THREE.Object3D) {
		place(model, this.x, this.y, this.z + BOX_HEIGHT / 2);
	}
}

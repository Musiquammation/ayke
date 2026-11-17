import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { EXPLOSION_DURATION, EXPLOSION_RADIUS } from "../constants";
import { PositionedEntity } from "./Entity";
import { ownedTransparent, place, unitSphere } from "./models";

/**
 * The visual part of an explosion: the damage is applied when it is created
 * (see `explode` in the simulation), this only fades out.
 */
export class Explosion extends PositionedEntity {
	remaining = EXPLOSION_DURATION;

	override save(): Fields {
		return { ...super.save(), remaining: this.remaining };
	}

	override load(obj: Fields) {
		super.load(obj);
		this.remaining = obj.remaining ?? 0;
	}

	protected override createModel() {
		const group = new THREE.Group();
		const fire = new THREE.Mesh(unitSphere(), ownedTransparent("#ff9f1c", 0.8));
		fire.name = 'fire';
		group.add(fire);
		const core = new THREE.Mesh(unitSphere(), ownedTransparent("#ffe8a3", 0.9));
		core.name = 'core';
		group.add(core);
		return group;
	}

	protected override updateModel(model: THREE.Object3D) {
		const t = 1 - this.remaining / EXPLOSION_DURATION;
		place(model, this.x, this.y, this.z + 20);

		const fire = model.getObjectByName('fire') as THREE.Mesh;
		fire.scale.set(1, 1, 0.5).multiplyScalar(EXPLOSION_RADIUS * (0.4 + 0.6 * t));
		(fire.material as THREE.MeshBasicMaterial).opacity = 0.8 * Math.max(0, 1 - t);

		const core = model.getObjectByName('core') as THREE.Mesh;
		core.scale.setScalar(Math.max(0.01, EXPLOSION_RADIUS * 0.4 * (1 - t)));
	}
}

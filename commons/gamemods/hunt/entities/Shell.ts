import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { SHELL_LIFE, SHELL_RADIUS } from "../constants";
import { MovingEntity, ViewContext } from "./Entity";
import { place, solid, unitRing, unitSphere } from "./models";

/**
 * A shell sliding on the ground. It bounces on the walls (SHELL_MAX_BOUNCES times),
 * throws up the first player it touches, and breaks when it touches another shell.
 */
export class Shell extends MovingEntity {
	owner = -1;
	bounces = 0;
	armTime = 0;
	life = SHELL_LIFE;

	/** True once the shell can touch its thrower and the other shells. */
	isArmed() {
		return this.armTime <= 0;
	}

	override save(): Fields {
		return {
			...super.save(),
			owner: this.owner, bounces: this.bounces,
			armTime: this.armTime, life: this.life,
		};
	}

	override load(obj: Fields) {
		super.load(obj);
		this.owner = obj.owner ?? -1;
		this.bounces = obj.bounces ?? 0;
		this.armTime = obj.armTime ?? 0;
		this.life = obj.life ?? 0;
	}

	protected override createModel() {
		// A flattened dome on a light rim, spinning
		const group = new THREE.Group();
		const dome = new THREE.Mesh(unitSphere(), solid("#22c55e", 0.15));
		dome.scale.set(SHELL_RADIUS, SHELL_RADIUS, SHELL_RADIUS * 0.7);
		dome.castShadow = true;
		group.add(dome);

		const rim = new THREE.Mesh(unitRing(), solid("#f0fdf4"));
		rim.scale.setScalar(SHELL_RADIUS * 1.1);
		rim.position.z = 1;
		group.add(rim);

		// Plates on the dome, so the spin is visible
		for (let i = 0; i < 3; i++) {
			const a = i * Math.PI * 2 / 3;
			const plate = new THREE.Mesh(unitSphere(), solid("#15803d"));
			plate.scale.set(SHELL_RADIUS * 0.3, SHELL_RADIUS * 0.3, SHELL_RADIUS * 0.15);
			plate.position.set(Math.cos(a) * SHELL_RADIUS * 0.45, Math.sin(a) * SHELL_RADIUS * 0.45, SHELL_RADIUS * 0.55);
			group.add(plate);
		}
		return group;
	}

	protected override updateModel(model: THREE.Object3D, view: ViewContext) {
		place(model, this.x, this.y, this.z);
		model.rotation.z = view.clock * 14;
	}
}

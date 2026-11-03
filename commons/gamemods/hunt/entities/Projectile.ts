import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { WEAPONS } from "../constants";
import { MovingEntity } from "./Entity";
import { place, solid, unitSphere } from "./models";

const FORWARD = new THREE.Vector3(0, 0, 1);
const tmp = new THREE.Vector3();

/** A bullet flying in a straight line (in 3D) until it hits something or runs out of range. */
export class Projectile extends MovingEntity {
	owner = -1;
	weapon = 0;
	rangeLeft = 0;
	damage = 0;

	override save(): Fields {
		return {
			...super.save(),
			owner: this.owner, weapon: this.weapon,
			rangeLeft: this.rangeLeft, damage: this.damage,
		};
	}

	override load(obj: Fields) {
		super.load(obj);
		this.owner = obj.owner ?? -1;
		this.weapon = obj.weapon ?? 0;
		this.rangeLeft = obj.rangeLeft ?? 0;
		this.damage = obj.damage ?? 0;
	}

	protected override createModel() {
		// A glowing sphere stretched along its local z axis, which is turned toward the velocity
		return new THREE.Mesh(unitSphere());
	}

	protected override updateModel(model: THREE.Object3D) {
		// Instances are reused by loads: the weapon may have changed
		const def = WEAPONS[this.weapon];
		(model as THREE.Mesh).material = solid(def.color, 1.2);
		model.scale.set(def.radius, def.radius, def.radius * 3.5);
		place(model, this.x, this.y, this.z);
		tmp.set(this.vx, -this.vy, this.vz);
		if (tmp.lengthSq() > 0)
			model.quaternion.setFromUnitVectors(FORWARD, tmp.normalize());
	}
}

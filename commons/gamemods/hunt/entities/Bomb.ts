import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { BOMB_FIRE, BOMB_ICE, BOMB_RADIUS } from "../constants";
import { MovingEntity, ViewContext } from "./Entity";
import { place, solid, unitSphere } from "./models";

/**
 * A bomb following a ballistic arc. When it lands or touches something, it explodes
 * (BOMB_FIRE) or leaves an ice zone (BOMB_ICE).
 */
export class Bomb extends MovingEntity {
	owner = -1;
	kind = BOMB_FIRE;

	override save(): Fields {
		return { ...super.save(), owner: this.owner, kind: this.kind };
	}

	override load(obj: Fields) {
		super.load(obj);
		this.owner = obj.owner ?? -1;
		this.kind = obj.kind ?? BOMB_FIRE;
	}

	protected override createModel() {
		const group = new THREE.Group();
		const shell = new THREE.Mesh(unitSphere(), solid("#2f3e46"));
		shell.name = 'shell';
		shell.scale.setScalar(BOMB_RADIUS * 1.6);
		shell.castShadow = true;
		group.add(shell);

		const fuse = new THREE.Mesh(unitSphere(), solid("#ffb703", 2));
		fuse.name = 'fuse';
		fuse.scale.setScalar(6);
		fuse.position.z = BOMB_RADIUS * 1.8;
		group.add(fuse);
		return group;
	}

	protected override updateModel(model: THREE.Object3D, view: ViewContext) {
		place(model, this.x, this.y, this.z);
		model.rotation.x = view.clock * 7;
		// Instances are reused by loads: the kind may have changed
		(model.getObjectByName('shell') as THREE.Mesh).material = this.kind === BOMB_ICE ? solid("#7dd3fc", 0.35) : solid("#2f3e46");
		model.getObjectByName('fuse')!.scale.setScalar(5 + Math.sin(view.clock * 40) * 2);
	}
}

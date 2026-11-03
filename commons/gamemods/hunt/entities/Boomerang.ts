import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { BOOMERANG_RADIUS } from "../constants";
import { PositionedEntity, ViewContext } from "./Entity";
import { place, solid, unitBox } from "./models";

/** What a boomerang caught. */
export type CatchKind = 'none' | 'player' | 'box';
const CATCH_KINDS: CatchKind[] = ['none', 'player', 'box'];

/**
 * A boomerang. While flying, its position is computed from the throw (origin, direction)
 * and the progress `u` along its loop. Once it caught something, it flies straight back
 * to its owner, dragging its catch.
 */
export class Boomerang extends PositionedEntity {
	owner = -1;
	originX = 0;
	originY = 0;
	dirX = 1;
	dirY = 0;
	reach = 0;
	/** Progress along the loop, 0 .. 1. */
	u = 0;
	catchKind: CatchKind = 'none';
	catchIdx = -1;
	pullTime = 0;

	isPulling() {
		return this.catchKind !== 'none';
	}

	override save(): Fields {
		return {
			...super.save(),
			owner: this.owner,
			originX: this.originX, originY: this.originY,
			dirX: this.dirX, dirY: this.dirY, reach: this.reach,
			u: this.u,
			catchKind: CATCH_KINDS.indexOf(this.catchKind),
			catchIdx: this.catchIdx,
			pullTime: this.pullTime,
		};
	}

	override load(obj: Fields) {
		super.load(obj);
		this.owner = obj.owner ?? -1;
		this.originX = obj.originX ?? 0;
		this.originY = obj.originY ?? 0;
		this.dirX = obj.dirX ?? 1;
		this.dirY = obj.dirY ?? 0;
		this.reach = obj.reach ?? 0;
		this.u = obj.u ?? 0;
		this.catchKind = CATCH_KINDS[obj.catchKind ?? 0] ?? 'none';
		this.catchIdx = obj.catchIdx ?? -1;
		this.pullTime = obj.pullTime ?? 0;
	}

	protected override createModel() {
		// Two flat arms forming a V, spinning around the vertical axis
		const group = new THREE.Group();
		for (const sign of [1, -1]) {
			const arm = new THREE.Mesh(unitBox(), solid("#f59e0b", 0.3));
			arm.scale.set(BOOMERANG_RADIUS * 2.2, 9, 5);
			arm.position.set(BOOMERANG_RADIUS * 0.7, sign * BOOMERANG_RADIUS * 0.5, 0);
			arm.rotation.z = sign * 0.6;
			arm.castShadow = true;
			group.add(arm);
		}
		return group;
	}

	protected override updateModel(model: THREE.Object3D, view: ViewContext) {
		place(model, this.x, this.y, this.z);
		model.rotation.z = view.clock * 18;
	}
}

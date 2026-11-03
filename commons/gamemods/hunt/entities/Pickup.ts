import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { ITEM_COLORS, ITEM_NONE, PICKUP_LIFE, PICKUP_RADIUS } from "../constants";
import { PositionedEntity, ViewContext } from "./Entity";
import { ownedTransparent, place, solid, unitOctahedron, unitRing } from "./models";

/** An item lying on the ground, waiting to be picked up. */
export class Pickup extends PositionedEntity {
	item = ITEM_NONE;
	life = PICKUP_LIFE;

	static create(x: number, y: number, z: number, item: number) {
		const p = new Pickup();
		p.x = x;
		p.y = y;
		p.z = z;
		p.item = item;
		return p;
	}

	override save(): Fields {
		return { ...super.save(), item: this.item, life: this.life };
	}

	override load(obj: Fields) {
		super.load(obj);
		this.item = obj.item ?? ITEM_NONE;
		this.life = obj.life ?? 0;
	}

	protected override createModel() {
		const group = new THREE.Group();
		const gem = new THREE.Mesh(unitOctahedron(), solid(ITEM_COLORS[this.item] ?? "#ffffff", 0.35));
		gem.name = 'gem';
		gem.scale.set(PICKUP_RADIUS * 0.6, PICKUP_RADIUS * 0.6, PICKUP_RADIUS * 0.8);
		gem.castShadow = true;
		group.add(gem);

		const halo = new THREE.Mesh(unitRing(), ownedTransparent("#ffffff", 0.35));
		halo.scale.setScalar(PICKUP_RADIUS);
		halo.position.z = -22;
		group.add(halo);
		return group;
	}

	protected override updateModel(model: THREE.Object3D, view: ViewContext) {
		const bob = Math.sin(view.clock * 3 + this.x * 0.01) * 6;
		place(model, this.x, this.y, this.z + 26);
		// Instances are reused by loads: the item may have changed
		const gem = model.getObjectByName('gem') as THREE.Mesh;
		gem.material = solid(ITEM_COLORS[this.item] ?? "#ffffff", 0.35);
		gem.position.z = bob;
		gem.rotation.z = view.clock * 2;
		// Blink when about to disappear
		model.visible = !(this.life < 5 && Math.floor(view.clock * 6) % 2 === 0);
	}
}

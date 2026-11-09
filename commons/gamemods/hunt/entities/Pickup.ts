import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { ITEM_COLORS, ITEM_NONE, PICKUP_LIFE, PICKUP_RADIUS, WEAPONS } from "../constants";
import { PositionedEntity, ViewContext } from "./Entity";
import { ownedTransparent, place, solid, unitBox, unitOctahedron, unitRing } from "./models";

/** An item or some ammo lying on the ground, waiting to be picked up. */
export class Pickup extends PositionedEntity {
	item = ITEM_NONE;
	life = PICKUP_LIFE;
	/** Weapon of an ammo pickup, -1 for an item. */
	ammoWeapon = -1;
	ammoAmount = 0;

	static create(x: number, y: number, z: number, item: number) {
		const p = new Pickup();
		p.x = x;
		p.y = y;
		p.z = z;
		p.item = item;
		return p;
	}

	static createAmmo(x: number, y: number, z: number, weapon: number) {
		const p = new Pickup();
		p.x = x;
		p.y = y;
		p.z = z;
		p.ammoWeapon = weapon;
		p.ammoAmount = WEAPONS[weapon].pickupAmmo;
		return p;
	}

	isAmmo() {
		return this.ammoWeapon >= 0;
	}

	private color() {
		return this.isAmmo() ? WEAPONS[this.ammoWeapon]?.color ?? "#ffffff" : ITEM_COLORS[this.item] ?? "#ffffff";
	}

	override save(): Fields {
		return {
			...super.save(), item: this.item, life: this.life,
			ammoWeapon: this.ammoWeapon, ammoAmount: this.ammoAmount,
		};
	}

	override load(obj: Fields) {
		super.load(obj);
		this.item = obj.item ?? ITEM_NONE;
		this.life = obj.life ?? 0;
		this.ammoWeapon = obj.ammoWeapon ?? -1;
		this.ammoAmount = obj.ammoAmount ?? 0;
	}

	protected override createModel() {
		const group = new THREE.Group();
		const gem = new THREE.Mesh(unitOctahedron(), solid(this.color(), 0.35));
		gem.name = 'gem';
		gem.scale.set(PICKUP_RADIUS * 0.6, PICKUP_RADIUS * 0.6, PICKUP_RADIUS * 0.8);
		gem.castShadow = true;
		group.add(gem);

		// Ammo: a small crate instead of the gem
		const crate = new THREE.Mesh(unitBox(), solid(this.color(), 0.2));
		crate.name = 'crate';
		crate.scale.set(PICKUP_RADIUS * 0.8, PICKUP_RADIUS * 0.5, PICKUP_RADIUS * 0.5);
		crate.castShadow = true;
		group.add(crate);

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
		const crate = model.getObjectByName('crate') as THREE.Mesh;
		const shown = this.isAmmo() ? crate : gem;
		gem.visible = !this.isAmmo();
		crate.visible = this.isAmmo();
		shown.material = solid(this.color(), this.isAmmo() ? 0.2 : 0.35);
		shown.position.z = bob;
		shown.rotation.z = view.clock * 2;
		// Blink when about to disappear
		model.visible = !(this.life < 5 && Math.floor(view.clock * 6) % 2 === 0);
	}
}

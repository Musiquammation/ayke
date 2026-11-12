import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { ICE_ZONE_DURATION, ICE_ZONE_RADIUS } from "../constants";
import { PositionedEntity, ViewContext } from "./Entity";
import { ownedTransparent, place, solid, unitOctahedron, unitRing } from "./models";

/** Ice crystals standing in the zone (angle, distance ratio, size). */
const CRYSTALS = Array.from({ length: 9 }, (_, i) => ({
	a: i * 2.399963,
	r: Math.sqrt((i + 0.5) / 9) * 0.85,
	s: 9 + (i * 7) % 8,
}));

/** Disc of ice left by an ice bomb: players standing in it are slowed. */
export class IceZone extends PositionedEntity {
	remaining = ICE_ZONE_DURATION;

	static create(x: number, y: number, z: number) {
		const zone = new IceZone();
		zone.x = x;
		zone.y = y;
		zone.z = z;
		return zone;
	}

	override save(): Fields {
		return { ...super.save(), remaining: this.remaining };
	}

	override load(obj: Fields) {
		super.load(obj);
		this.remaining = obj.remaining ?? 0;
	}

	protected override createModel() {
		const group = new THREE.Group();

		const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), ownedTransparent("#bae6fd", 0.4));
		disc.geometry.userData.owned = true;
		disc.name = 'disc';
		disc.scale.setScalar(ICE_ZONE_RADIUS);
		group.add(disc);

		const rim = new THREE.Mesh(unitRing(), ownedTransparent("#e0f2fe", 0.8));
		rim.name = 'rim';
		rim.scale.setScalar(ICE_ZONE_RADIUS);
		rim.position.z = 0.5;
		group.add(rim);

		const crystals = new THREE.Group();
		crystals.name = 'crystals';
		for (const c of CRYSTALS) {
			const crystal = new THREE.Mesh(unitOctahedron(), solid("#e0f2fe", 0.5));
			crystal.scale.set(c.s * 0.6, c.s * 0.6, c.s * 1.4);
			crystal.position.set(Math.cos(c.a) * c.r * ICE_ZONE_RADIUS, Math.sin(c.a) * c.r * ICE_ZONE_RADIUS, c.s * 0.7);
			crystals.add(crystal);
		}
		group.add(crystals);
		return group;
	}

	protected override updateModel(model: THREE.Object3D, view: ViewContext) {
		place(model, this.x, this.y, this.z + 1);

		// Spreads quickly when created, fades out at the end
		const age = ICE_ZONE_DURATION - this.remaining;
		const grow = Math.min(1, 0.35 + age * 4);
		const fade = Math.min(1, this.remaining / 0.8);
		model.scale.set(grow, grow, 1);

		const disc = model.getObjectByName('disc') as THREE.Mesh;
		(disc.material as THREE.MeshBasicMaterial).opacity = (0.32 + Math.sin(view.clock * 3) * 0.06) * fade;
		const rim = model.getObjectByName('rim') as THREE.Mesh;
		(rim.material as THREE.MeshBasicMaterial).opacity = 0.8 * fade;
		const crystals = model.getObjectByName('crystals')!;
		crystals.visible = fade > 0.3;
	}
}

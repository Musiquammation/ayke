import * as THREE from 'three';
import {
	BOMB_RADIUS,
	ICE_ZONE_RADIUS,
	ITEM_BOMB,
	ITEM_ICE_BOMB,
	ITEM_JUMP,
	ITEM_NONE,
	ITEM_SHELLS,
	PLAYER_RADIUS,
	SHELL_RADIUS,
	WEAPONS,
} from "./constants";
import type { ClientData } from "./client";
import { Entity, Player, Vec3 } from "./entities";
import { HuntPhysics } from "./physics";
import { HuntState } from "./simulation";
import { explosionZone, shotSector, traceBomb, traceLeap, traceShells, traceShot } from "./trajectories";

/* -------------------------------------------------------------------------- */
/* Translucent preview of the selected item (item mode) or of the weapon      */
/* (attack mode), computed with the same functions as the simulation (so      */
/* walls cut it exactly like the real thing). Four shapes:                    */
/* - a jump path (an arc, followed by a landing zone),                        */
/* - a straight / curved path on the ground, cut by the first obstacle,       */
/* - a zone (polygon whose rays are stopped by the walls),                    */
/* - an angular sector (scattered shot, rays stopped by the walls).           */
/* -------------------------------------------------------------------------- */

/** Height added to ground shapes so they do not fight with the ground. */
const LIFT = 1.5;
/** Number of segments of a circle. */
const CIRCLE_SEGMENTS = 40;
/** Super jump preview: radius of the tube following the path in 3D. */
const JUMP_TUBE_RADIUS = 5;
const JUMP_TUBE_RADIAL_SEGMENTS = 8;

export class ItemPreview {
	readonly group = new THREE.Group();

	private readonly fill = new THREE.MeshBasicMaterial({
		color: "#ffffff", transparent: true, opacity: 0.22,
		depthWrite: false, depthTest: false, side: THREE.DoubleSide,
	});
	private readonly strong = new THREE.MeshBasicMaterial({
		color: "#ffffff", transparent: true, opacity: 0.45,
		depthWrite: false, depthTest: false, side: THREE.DoubleSide,
	});
	private readonly edge = new THREE.LineBasicMaterial({
		color: "#ffffff", transparent: true, opacity: 0.75, depthTest: false,
	});
	// Weapon previews take the color of the weapon
	private readonly shotFill = new THREE.MeshBasicMaterial({
		color: "#ffffff", transparent: true, opacity: 0.18,
		depthWrite: false, depthTest: false, side: THREE.DoubleSide,
	});
	private readonly shotEdge = new THREE.LineBasicMaterial({
		color: "#ffffff", transparent: true, opacity: 0.6, depthTest: false,
	});

	constructor() {
		this.group.renderOrder = 10;
	}

	/** Rebuild the preview of the selected item (item mode) or of the weapon (attack mode). */
	update(state: HuntState, data: ClientData, physics: HuntPhysics | null) {
		this.clear();

		const self = state.players[data.playerIdx];
		if (!physics || !self || !self.canAttack())
			return;

		if (!data.itemMode) {
			this.weapon(state, data, physics, self);
			return;
		}

		const item = self.items[self.selectedItem];
		if (item === ITEM_NONE)
			return;

		const aim = data.aimPoint(state);
		switch (item) {
			case ITEM_BOMB: {
				const { points, end } = traceBomb(physics, self, aim);
				this.ribbon(points, BOMB_RADIUS * 1.6, this.fill);
				this.zone(explosionZone(physics, end.x, end.y, end.z), end);
				break;
			}

			case ITEM_ICE_BOMB: {
				const { points, end } = traceBomb(physics, self, aim);
				this.ribbon(points, BOMB_RADIUS * 1.6, this.fill);
				this.disc({ x: end.x, y: end.y, z: end.z + LIFT }, ICE_ZONE_RADIUS, this.fill);
				break;
			}

			case ITEM_SHELLS: {
				const lift = (v: Vec3) => ({ x: v.x, y: v.y, z: v.z + LIFT });
				for (const { points, hit } of traceShells(physics, self, aim)) {
					this.ribbon(points.map(lift), SHELL_RADIUS * 2, this.fill);
					if (hit)
						this.disc(lift(points[points.length - 1]), SHELL_RADIUS * 1.6, this.strong);
				}
				break;
			}

			case ITEM_JUMP: {
				const points = traceLeap(physics, self, aim);
				this.leap(physics, self, points);
				const end = points[points.length - 1];
				this.disc({ x: end.x, y: end.y, z: end.z + LIFT }, PLAYER_RADIUS, this.strong);
				break;
			}
		}
	}

	/**
	 * Attack mode: a straight line cut by the first obstacle / opponent (sniper, burst),
	 * or the angular sector of the pellets (shotgun).
	 */
	private weapon(state: HuntState, data: ClientData, physics: HuntPhysics, self: Player) {
		const def = WEAPONS[self.weapon];
		this.shotFill.color.set(def.color);
		this.shotEdge.color.set(def.color);

		const aim = data.aimPoint(state);
		if (def.count > 1) {
			const { center, points } = shotSector(physics, self, aim);
			this.sector(points, { x: center.x, y: center.y, z: center.z + LIFT });
			return;
		}

		// Drawn on the ground under the bullet path, so it reads well from the top-down camera
		const { from, to, hit } = traceShot(physics, self, aim);
		const z = self.z + LIFT;
		const start = { x: from.x, y: from.y, z };
		const end = { x: to.x, y: to.y, z };
		this.ribbon([start, end], def.radius * 2, this.shotFill);
		if (hit)
			this.disc(end, def.radius * 2.5, this.shotFill, this.shotEdge);
	}

	/** A filled angular sector from `center` to the arc of `arc` points, with its outline. */
	private sector(arc: { x: number; y: number }[], center: Vec3) {
		const z = center.z;
		const pos: number[] = [center.x, -center.y, z];
		const index: number[] = [];
		for (const [i, p] of arc.entries()) {
			pos.push(p.x, -p.y, z);
			if (i > 0)
				index.push(0, i, i + 1);
		}

		const fillGeometry = new THREE.BufferGeometry();
		fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		fillGeometry.setIndex(index);
		this.add(new THREE.Mesh(fillGeometry, this.shotFill));

		const lineGeometry = new THREE.BufferGeometry();
		lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		this.add(new THREE.LineLoop(lineGeometry, this.shotEdge));
	}

	/**
	 * Super jump path: a tube really following the arc in 3D (the perspective camera
	 * makes it grow and drift outward as it rises), plus its shadow on the ground.
	 */
	private leap(physics: HuntPhysics, self: Entity, points: Vec3[]) {
		const shadow = points.map(p => ({ x: p.x, y: p.y, z: physics.groundHeight(p.x, p.y, p.z, self) + LIFT }));
		this.ribbon(shadow, 10, this.fill);

		if (points.length < 2)
			return;
		const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, -p.y, p.z + LIFT)));
		const geometry = new THREE.TubeGeometry(curve, points.length * 2, JUMP_TUBE_RADIUS, JUMP_TUBE_RADIAL_SEGMENTS, false);
		this.add(new THREE.Mesh(geometry, this.strong));
	}

	/** Remove (and free) the previous frame's shapes. */
	private clear() {
		for (const child of [...this.group.children]) {
			this.group.remove(child);
			(child as THREE.Mesh).geometry.dispose();
		}
	}

	private add(obj: THREE.Mesh | THREE.Line) {
		obj.renderOrder = 10;
		this.group.add(obj);
	}

	/**
	 * A flat band of the given width following a 3D path
	 * (the band stays horizontal, so it reads well from the top-down camera).
	 */
	private ribbon(points: Vec3[], width: number, material: THREE.Material) {
		if (points.length < 2)
			return;

		const pos: number[] = [];
		const index: number[] = [];
		const half = width / 2;
		for (let i = 0; i < points.length; i++) {
			const a = points[Math.max(0, i - 1)];
			const b = points[Math.min(points.length - 1, i + 1)];
			let dx = b.x - a.x;
			let dy = b.y - a.y;
			const len = Math.hypot(dx, dy);
			if (len < 1e-6) {
				dx = 1;
				dy = 0;
			} else {
				dx /= len;
				dy /= len;
			}
			// Perpendicular on the ground plane, then game -> three.js coordinates (y flipped)
			const p = points[i];
			pos.push(p.x - dy * half, -(p.y + dx * half), p.z);
			pos.push(p.x + dy * half, -(p.y - dx * half), p.z);
			if (i > 0) {
				const k = i * 2;
				index.push(k - 2, k - 1, k, k - 1, k + 1, k);
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		geometry.setIndex(index);
		this.add(new THREE.Mesh(geometry, material));
	}

	/** A filled polygon around `center` (triangle fan), with its outline. */
	private zone(polygon: { x: number; y: number }[], center: Vec3) {
		const z = center.z + LIFT;
		const pos: number[] = [center.x, -center.y, z];
		const index: number[] = [];
		const outline: number[] = [];
		for (const [i, p] of polygon.entries()) {
			pos.push(p.x, -p.y, z);
			outline.push(p.x, -p.y, z);
			index.push(0, 1 + i, 1 + (i + 1) % polygon.length);
		}

		const fillGeometry = new THREE.BufferGeometry();
		fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		fillGeometry.setIndex(index);
		this.add(new THREE.Mesh(fillGeometry, this.fill));

		const lineGeometry = new THREE.BufferGeometry();
		lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));
		this.add(new THREE.LineLoop(lineGeometry, this.edge));
	}

	/** A flat disc (landing spot, end of a path). */
	private disc(center: Vec3, radius: number, material: THREE.Material, edge: THREE.Material = this.edge) {
		const polygon = Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
			const a = i / CIRCLE_SEGMENTS * Math.PI * 2;
			return { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius };
		});
		const geometry = new THREE.CircleGeometry(radius, CIRCLE_SEGMENTS);
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(center.x, -center.y, center.z);
		this.add(mesh);

		const lineGeometry = new THREE.BufferGeometry();
		lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
			polygon.flatMap(p => [p.x, -p.y, center.z]), 3));
		this.add(new THREE.LineLoop(lineGeometry, edge));
	}
}

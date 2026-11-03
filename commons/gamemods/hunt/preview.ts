import * as THREE from 'three';
import {
	BOMB_RADIUS,
	BOOMERANG_RADIUS,
	ITEM_BOMB,
	ITEM_BOOMERANG,
	ITEM_DASH,
	ITEM_JUMP,
	ITEM_NONE,
	PLAYER_RADIUS,
} from "./constants";
import type { ClientData } from "./client";
import { Vec3 } from "./entities";
import { HuntPhysics } from "./physics";
import { HuntState } from "./simulation";
import { explosionZone, traceBomb, traceBoomerang, traceDash, traceLeap } from "./trajectories";

/* -------------------------------------------------------------------------- */
/* Translucent preview of the selected item, computed with the same motion    */
/* functions as the simulation (so walls cut it exactly like the real thing). */
/* Three shapes:                                                              */
/* - a jump path (an arc, followed by a landing zone),                        */
/* - a straight / curved path on the ground, cut by the first obstacle,       */
/* - a zone (polygon whose rays are stopped by the walls).                    */
/* -------------------------------------------------------------------------- */

/** Height added to ground shapes so they do not fight with the ground. */
const LIFT = 1.5;
/** Number of segments of a circle. */
const CIRCLE_SEGMENTS = 40;

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

	constructor() {
		this.group.renderOrder = 10;
	}

	/** Rebuild the preview of the item selected by the local player. */
	update(state: HuntState, data: ClientData, physics: HuntPhysics | null) {
		this.clear();

		const self = state.players[data.playerIdx];
		if (!physics || !self || !self.canAttack())
			return;

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

			case ITEM_BOOMERANG: {
				const { points, hit } = traceBoomerang(physics, self, aim);
				this.ribbon(points, BOOMERANG_RADIUS * 2, this.fill);
				if (hit)
					this.disc(points[points.length - 1], BOOMERANG_RADIUS * 1.6, this.strong);
				break;
			}

			case ITEM_DASH: {
				const { from, to } = traceDash(physics, self, aim);
				const lift = (v: Vec3) => ({ x: v.x, y: v.y, z: v.z + LIFT });
				this.ribbon([lift(from), lift(to)], PLAYER_RADIUS * 2, this.fill);
				this.disc(lift(to), PLAYER_RADIUS, this.strong);
				break;
			}

			case ITEM_JUMP: {
				const points = traceLeap(physics, self, aim);
				this.ribbon(points, 14, this.fill);
				const end = points[points.length - 1];
				this.disc({ x: end.x, y: end.y, z: end.z + LIFT }, PLAYER_RADIUS, this.strong);
				break;
			}
		}
	}

	/** Remove (and free) the previous frame's shapes. */
	private clear() {
		for (const child of [...this.group.children]) {
			this.group.remove(child);
			(child as THREE.Mesh).geometry.dispose();
		}
	}

	private add(obj: THREE.Mesh | THREE.LineLoop) {
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
	private disc(center: Vec3, radius: number, material: THREE.Material) {
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
		this.add(new THREE.LineLoop(lineGeometry, this.edge));
	}
}

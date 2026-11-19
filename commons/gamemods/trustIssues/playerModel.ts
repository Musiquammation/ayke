import * as THREE from 'three';
import { PLAYER_FEET, PLAYER_HALF_HEIGHT, PLAYER_RADIUS, PLAYER_SPEED } from "./constants";
import { forwardOf, rightOf, Player } from "./simulation";

/* -------------------------------------------------------------------------- */
/* Player model: a glossy paint bean with big eyes, a paint tank on its back, */
/* hands and feet. Client-only animation (nothing here is shared):           */
/*                                                                            */
/*  - walk: feet and hands swing, the body bobs, faster with the speed        */
/*  - lean: the body tilts toward where it moves                              */
/*  - air:  stretched while going up, squashed while falling                  */
/*  - land: a short squash when touching the ground again                     */
/*  - idle: slow breathing and blinking eyes                                  */
/*                                                                            */
/* Local axes: the model looks toward -z (rotated by the yaw), y is up, and   */
/* the origin is the center of the capsule (like the physics body).           */
/* -------------------------------------------------------------------------- */

const WALK_CYCLE = 1.9;      // radians of walk phase per meter walked
const STEP_LENGTH = 0.2;     // how far the feet swing forward / backward
const LEAN_PER_SPEED = 0.035;
const LAND_SQUASH = 0.28;
const BLINK_PERIOD = 3.7;

/** Lighter or darker version of a color (t > 0: toward white, t < 0: toward black). */
function shade(color: THREE.Color, t: number) {
	return color.clone().lerp(new THREE.Color(t > 0 ? "#ffffff" : "#000000"), Math.abs(t));
}

export class PlayerModel {
	readonly root = new THREE.Group();
	/** Everything but the name; its origin is at the feet, so squashing keeps the feet on the ground. */
	private readonly pivot = new THREE.Group();
	private readonly body = new THREE.Group();
	private readonly eyes: THREE.Group[] = [];
	private readonly feet: THREE.Mesh[] = [];
	private readonly hands: THREE.Mesh[] = [];

	// Animation state
	private phase = 0;
	private walk = 0;
	private squash = 0;
	private wasGrounded = true;
	private time = Math.random() * 10;

	constructor(colorHex: string, label: THREE.Object3D | null) {
		const color = new THREE.Color(colorHex);
		this.pivot.position.y = -PLAYER_FEET;
		this.body.position.y = PLAYER_FEET;
		this.pivot.add(this.body);
		this.root.add(this.pivot);

		this.buildBody(color);
		this.buildFace();
		this.buildTank(color);
		this.buildLimbs(color);

		if (label) {
			label.position.y = PLAYER_FEET + 0.55;
			this.root.add(label);
		}
	}

	/* ---------- Construction ---------- */

	/** Glossy capsule, with a lighter belly. */
	private buildBody(color: THREE.Color) {
		const skin = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
		const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HALF_HEIGHT * 2, 8, 20), skin);

		const belly = new THREE.Mesh(
			new THREE.SphereGeometry(1, 20, 14),
			new THREE.MeshStandardMaterial({ color: shade(color, 0.55), roughness: 0.6 }),
		);
		belly.scale.set(0.27, 0.36, 0.14);
		belly.position.set(0, -0.2, -PLAYER_RADIUS + 0.08);

		this.body.add(capsule, belly);
	}

	/** Two big eyes (white, dark pupils with a light dot). */
	private buildFace() {
		const white = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.25 });
		const black = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.2 });
		const shine = new THREE.MeshBasicMaterial({ color: "#ffffff" });

		for (const side of [-1, 1]) {
			const eye = new THREE.Group();
			const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), white);
			ball.scale.z = 0.7;
			const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), black);
			pupil.position.z = -0.075;
			const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), shine);
			dot.position.set(0.02, 0.025, -0.125);
			eye.add(ball, pupil, dot);
			eye.position.set(side * 0.14, 0.33, -PLAYER_RADIUS + 0.06);
			this.eyes.push(eye);
			this.body.add(eye);
		}
	}

	/** The paint tank on the back: a capsule of the paint color with a white cap and straps. */
	private buildTank(color: THREE.Color) {
		const tank = new THREE.Mesh(
			new THREE.CapsuleGeometry(0.15, 0.32, 6, 12),
			new THREE.MeshPhysicalMaterial({
				color: shade(color, -0.15), roughness: 0.15, clearcoat: 1,
				emissive: color, emissiveIntensity: 0.25,
			}),
		);
		tank.position.set(0, 0.05, PLAYER_RADIUS + 0.1);

		const metal = new THREE.MeshStandardMaterial({ color: "#e5e7eb", roughness: 0.3, metalness: 0.6 });
		const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 12), metal);
		cap.position.set(0, 0.33, PLAYER_RADIUS + 0.1);

		const strap = new THREE.Mesh(new THREE.TorusGeometry(PLAYER_RADIUS + 0.01, 0.025, 6, 28), metal);
		strap.rotation.x = Math.PI / 2;
		strap.position.y = 0.05;

		this.body.add(tank, cap, strap);
	}

	/** Small hands on the sides, flat feet under the body. */
	private buildLimbs(color: THREE.Color) {
		const handMat = new THREE.MeshStandardMaterial({ color: shade(color, 0.25), roughness: 0.5 });
		const footMat = new THREE.MeshStandardMaterial({ color: "#374151", roughness: 0.7 });

		for (const side of [-1, 1]) {
			const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), handMat);
			hand.position.set(side * (PLAYER_RADIUS + 0.06), 0.85, 0);
			this.hands.push(hand);
			this.pivot.add(hand);

			const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), footMat);
			foot.scale.set(0.12, 0.07, 0.18);
			foot.position.set(side * 0.16, 0.06, 0);
			this.feet.push(foot);
			this.pivot.add(foot);
		}
	}

	/* ---------- Animation ---------- */

	/** Place the model for this frame at `pos` (drawn position). `yaw` is the view direction to show. */
	update(p: Player, pos: { x: number, y: number, z: number }, yaw: number, dt: number) {
		this.time += dt;
		this.root.position.set(pos.x, pos.y, pos.z);
		this.root.rotation.y = yaw;

		const speed = Math.hypot(p.vx, p.vz);
		const grounded = p.grounded;

		// Walk cycle (only on the ground), eased in and out
		const walking = grounded ? Math.min(1, speed / PLAYER_SPEED) : 0;
		this.walk += (walking - this.walk) * Math.min(1, dt * 10);
		this.phase += speed * dt * WALK_CYCLE * (grounded ? 1 : 0.3);

		// Landing squash
		if (grounded && !this.wasGrounded)
			this.squash = LAND_SQUASH;
		this.wasGrounded = grounded;
		this.squash = Math.max(0, this.squash - dt * 2.2);

		this.updateLimbs(grounded);
		this.updateLean(p, yaw);
		this.updateStretch(p, grounded);
		this.updateBlink();
	}

	/** Feet and hands swing in opposite directions while walking; in the air they spread. */
	private updateLimbs(grounded: boolean) {
		const swing = Math.sin(this.phase) * this.walk;
		for (const [i, foot] of this.feet.entries()) {
			const s = i === 0 ? swing : -swing;
			foot.position.z = -s * STEP_LENGTH;
			foot.position.y = 0.06 + Math.max(0, s) * 0.1;
		}
		for (const [i, hand] of this.hands.entries()) {
			const s = i === 0 ? -swing : swing;
			hand.position.z = -s * 0.16;
			hand.position.y = grounded ? 0.85 + Math.abs(s) * 0.04 : 1.25;
		}
		this.body.position.y = PLAYER_FEET + Math.abs(Math.sin(this.phase)) * 0.06 * this.walk;
	}

	/** Tilt toward the motion (forward lean, sideways roll). */
	private updateLean(p: Player, yaw: number) {
		const f = forwardOf(yaw);
		const r = rightOf(yaw);
		const forward = p.vx * f.x + p.vz * f.z;
		const side = p.vx * r.x + p.vz * r.z;
		this.pivot.rotation.x = -forward * LEAN_PER_SPEED;
		this.pivot.rotation.z = -side * LEAN_PER_SPEED;
	}

	/** Stretch going up, squash falling or landing, slow breathing when idle. */
	private updateStretch(p: Player, grounded: boolean) {
		let stretch = grounded ? 0 : Math.max(-0.12, Math.min(0.18, p.vy * 0.02));
		stretch -= this.squash;
		stretch += Math.sin(this.time * 2.4) * 0.015 * (1 - this.walk);
		const sy = 1 + stretch;
		const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
		this.pivot.scale.set(sxz, sy, sxz);
	}

	/** Quick blink now and then. */
	private updateBlink() {
		const t = this.time % BLINK_PERIOD;
		const open = t < 0.12 ? Math.abs(t - 0.06) / 0.06 : 1;
		for (const eye of this.eyes)
			eye.scale.y = Math.max(0.1, open);
	}
}

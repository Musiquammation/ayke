import * as THREE from 'three';
import { EXPLOSION_FX_TIME, PAINT_RADIUS, PLAYER_FEET } from "./constants";
import { createRng } from "./level";
import { Splat } from "./simulation";

/* -------------------------------------------------------------------------- */
/* Explosion visual effect.                                                   */
/*                                                                            */
/* Everything is a pure function of the age of the splat (seeded by its id), */
/* so the effect stays consistent when the state is reloaded.                 */
/*                                                                            */
/*  - flash: a small white-hot ball, gone in a fraction of a second           */
/*  - shell: a glowing sphere (bright rim, clear center) growing quickly to   */
/*           the paint radius, then fading                                    */
/*  - ring:  a shockwave on the floor, under the player                       */
/*  - drops: paint drops thrown in every direction, falling with gravity      */
/*  - smoke: soft tinted puffs drifting away slowly                           */
/* -------------------------------------------------------------------------- */

const FLASH_TIME = 0.16;
const SHELL_TIME = 0.5;
const RING_TIME = 0.6;
const DROP_COUNT = 46;
const DROP_GRAVITY = 22;
const SMOKE_COUNT = 9;

/** Ease out: fast at the start, slow at the end. */
function easeOut(k: number) {
	return 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
}

/** Glowing shell: the edges (seen from the side) are bright, the center is almost clear. */
function shellMaterial(color: THREE.Color) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: color },
			uOpacity: { value: 1 },
		},
		vertexShader: `
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				vNormal = normalize(normalMatrix * normal);
				vView = normalize(-mv.xyz);
				gl_Position = projectionMatrix * mv;
			}
		`,
		fragmentShader: `
			uniform vec3 uColor;
			uniform float uOpacity;
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
				vec3 c = mix(uColor, vec3(1.0), rim * 0.35);
				gl_FragColor = vec4(c, uOpacity * (0.08 + rim * 0.95));
			}
		`,
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		blending: THREE.AdditiveBlending,
	});
}

/** Soft round texture (radial gradient), shared by the smoke puffs. */
let smokeTexture: THREE.Texture | null = null;
function getSmokeTexture() {
	if (smokeTexture)
		return smokeTexture;
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 64;
	const ctx = canvas.getContext("2d")!;
	const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	g.addColorStop(0, "rgba(255,255,255,1)");
	g.addColorStop(0.5, "rgba(255,255,255,0.5)");
	g.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 64, 64);
	smokeTexture = new THREE.CanvasTexture(canvas);
	return smokeTexture;
}

interface Drop {
	vx: number;
	vy: number;
	vz: number;
	size: number;
}

interface Puff {
	dx: number;
	dy: number;
	dz: number;
	size: number;
}


export class ExplosionFx {
	readonly group = new THREE.Group();

	private readonly flash: THREE.Mesh;
	private readonly shell: THREE.Mesh;
	private readonly ring: THREE.Mesh;
	private readonly drops: THREE.InstancedMesh;
	private readonly dropData: Drop[] = [];
	private readonly smoke: THREE.Sprite[] = [];
	private readonly puffData: Puff[] = [];
	private readonly dummy = new THREE.Object3D();

	constructor(splat: Splat, colorHex: string) {
		const color = new THREE.Color(colorHex);
		const rng = createRng(splat.id * 2654435761);
		this.group.position.set(splat.x, splat.y, splat.z);

		this.flash = new THREE.Mesh(
			new THREE.SphereGeometry(1, 20, 14),
			new THREE.MeshBasicMaterial({
				color: color.clone().lerp(new THREE.Color("#ffffff"), 0.75),
				transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
			}),
		);

		this.shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), shellMaterial(color));

		this.ring = new THREE.Mesh(
			new THREE.RingGeometry(0.8, 1, 48),
			new THREE.MeshBasicMaterial({
				color, transparent: true, depthWrite: false, side: THREE.DoubleSide,
				blending: THREE.AdditiveBlending,
			}),
		);
		this.ring.rotation.x = -Math.PI / 2;
		this.ring.position.y = -PLAYER_FEET + 0.05;

		// Paint drops: mostly outward and upward
		this.drops = new THREE.InstancedMesh(
			new THREE.SphereGeometry(1, 8, 6),
			new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.25 }),
			DROP_COUNT,
		);
		for (let i = 0; i < DROP_COUNT; i++) {
			const a = rng() * Math.PI * 2;
			const up = rng() * 1.2 - 0.25;
			const speed = 6 + rng() * 9;
			const h = Math.cos(Math.atan(up));
			this.dropData.push({
				vx: Math.cos(a) * speed * h,
				vy: Math.sin(Math.atan(up)) * speed + 2,
				vz: Math.sin(a) * speed * h,
				size: 0.08 + rng() * 0.16,
			});
		}

		// Smoke puffs, tinted with the paint color
		const smokeColor = color.clone().lerp(new THREE.Color("#ffffff"), 0.55);
		for (let i = 0; i < SMOKE_COUNT; i++) {
			const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
				map: getSmokeTexture(), color: smokeColor, transparent: true, depthWrite: false,
			}));
			const a = rng() * Math.PI * 2;
			const d = 1 + rng() * 2;
			this.puffData.push({ dx: Math.cos(a) * d, dy: rng() * 1.5, dz: Math.sin(a) * d, size: 2 + rng() * 2 });
			this.smoke.push(sprite);
		}

		this.group.add(this.flash, this.shell, this.ring, this.drops, ...this.smoke);
	}

	/** Place every part for the given age (seconds since the explosion). */
	update(age: number) {
		this.updateFlash(age);
		this.updateShell(age);
		this.updateRing(age);
		this.updateDrops(age);
		this.updateSmoke(age);
	}

	private updateFlash(age: number) {
		const k = age / FLASH_TIME;
		this.flash.visible = k < 1;
		this.flash.scale.setScalar(0.4 + 2.2 * easeOut(k));
		(this.flash.material as THREE.MeshBasicMaterial).opacity = 1 - k;
	}

	private updateShell(age: number) {
		const k = age / SHELL_TIME;
		this.shell.visible = k < 1;
		this.shell.scale.setScalar(0.5 + (PAINT_RADIUS - 0.5) * easeOut(k * 1.6));
		const material = this.shell.material as THREE.ShaderMaterial;
		material.uniforms.uOpacity.value = Math.pow(1 - Math.min(1, k), 1.5);
	}

	private updateRing(age: number) {
		const k = age / RING_TIME;
		this.ring.visible = k < 1;
		this.ring.scale.setScalar(0.5 + PAINT_RADIUS * 1.25 * easeOut(k));
		(this.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
	}

	private updateDrops(age: number) {
		const life = EXPLOSION_FX_TIME;
		for (const [i, d] of this.dropData.entries()) {
			const shrink = Math.max(0, 1 - age / life);
			this.dummy.position.set(d.vx * age, d.vy * age - 0.5 * DROP_GRAVITY * age * age, d.vz * age);
			this.dummy.scale.setScalar(d.size * shrink);
			this.dummy.updateMatrix();
			this.drops.setMatrixAt(i, this.dummy.matrix);
		}
		this.drops.instanceMatrix.needsUpdate = true;
	}

	private updateSmoke(age: number) {
		const k = Math.min(1, age / EXPLOSION_FX_TIME);
		for (const [i, sprite] of this.smoke.entries()) {
			const p = this.puffData[i];
			const t = easeOut(k);
			sprite.position.set(p.dx * (0.5 + t * 1.5), p.dy + t * 1.2, p.dz * (0.5 + t * 1.5));
			sprite.scale.setScalar(p.size * (0.6 + t * 1.4));
			(sprite.material as THREE.SpriteMaterial).opacity = 0.55 * Math.min(1, age * 10) * (1 - k);
		}
	}

	/** Free the GPU resources (the smoke texture is shared and kept). */
	dispose() {
		this.group.traverse(o => {
			const mesh = o as THREE.Mesh;
			if (!(o as THREE.Sprite).isSprite) // sprites share one geometry for the whole app
				mesh.geometry?.dispose();
			const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
			if (Array.isArray(m))
				m.forEach(x => x.dispose());
			else
				m?.dispose();
		});
	}
}

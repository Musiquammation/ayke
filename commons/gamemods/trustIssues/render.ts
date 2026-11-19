import * as THREE from 'three';
import {
	CAMERA_DISTANCE,
	CAMERA_FOV,
	DEAD_CAMERA_DISTANCE,
	EXPLOSION_FX_TIME,
	HEIGHT,
	MATCH_DURATION,
	PAINT_DELAY,
	PAINT_RADIUS,
	PLAYER_FEET,
	WIDTH,
	ZONE_COLORS,
	ZONE_NAMES,
} from "./constants";
import { ClientData } from "./client";
import { ExplosionFx } from "./fx";
import { PlayerModel } from "./playerModel";
import { createRng, isAbove, Level, Platform } from "./level";
import { forwardOf, Player, Splat, TrustState } from "./simulation";

/* -------------------------------------------------------------------------- */
/* Drawing.                                                                   */
/*                                                                            */
/* The world is rendered by three.js into its own WebGL canvas, which is then */
/* copied onto the game canvas (like Hunt). Third person camera behind the    */
/* player, oriented with the mouse.                                           */
/*                                                                            */
/* Hidden platforms have a transparent canvas texture: nothing is drawn       */
/* until an explosion paints them. Every splat draws a paint blob (color of   */
/* the player who exploded) where the paint sphere cuts the platform.         */
/* -------------------------------------------------------------------------- */

const SKY_COLOR = "#9fd3ff";
/** Resolution of the paint textures. */
const PIXELS_PER_METER = 24;
/** Radius of the blob shadow under the players. */
const PLAYER_SHADOW_RADIUS = 0.5;
/** Height of the light beams above the zones. */
const BEAM_HEIGHT = 80;


/**
 * A platform that can be painted: its mesh and the canvas holding its paint.
 * Hidden platforms have no base color (transparent until painted); the spawn
 * and the zones are filled with their color, and get painted over.
 */
class PaintedPlatform {
	readonly mesh: THREE.Mesh;
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private readonly texture: THREE.CanvasTexture;

	constructor(readonly platform: Platform, private readonly base: string | null = null) {
		const p = platform;
		this.canvas = document.createElement("canvas");
		this.canvas.width = Math.max(8, Math.ceil(p.w * PIXELS_PER_METER));
		this.canvas.height = Math.max(8, Math.ceil(p.d * PIXELS_PER_METER));
		this.ctx = this.canvas.getContext("2d")!;

		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;

		const geometry = new THREE.BoxGeometry(p.w, p.h, p.d);
		mapUvsFromTop(geometry, p.w, p.d);
		const material = new THREE.MeshStandardMaterial({
			map: this.texture,
			alphaTest: base ? 0 : 0.5,
			roughness: 0.65,
		});
		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.position.set(p.x, p.top - p.h / 2, p.z);
		this.clear();
	}

	/** Remove all the paint (back to the base color, or to fully transparent). */
	clear() {
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		if (this.base) {
			this.ctx.fillStyle = this.base;
			this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		}
		this.texture.needsUpdate = true;
		// A hidden platform without paint is not drawn at all (most of them, early in the game)
		this.mesh.visible = this.base !== null;
	}

	/**
	 * Draw the blob of a splat: a disc whose radius is the radius of the paint
	 * sphere at the platform's altitude, with irregular edges and droplets.
	 */
	paint(s: Splat, color: string) {
		const p = this.platform;
		const below = p.top - p.h;
		const dy = s.y > p.top ? s.y - p.top : s.y < below ? below - s.y : 0;
		if (dy >= PAINT_RADIUS)
			return;

		const r = Math.sqrt(PAINT_RADIUS * PAINT_RADIUS - dy * dy) * PIXELS_PER_METER;
		const cx = (s.x - (p.x - p.w / 2)) / p.w * this.canvas.width;
		const cy = (s.z - (p.z - p.d / 2)) / p.d * this.canvas.height;
		const rng = createRng(s.id * 7919 + p.id * 104729);
		const ctx = this.ctx;

		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
		ctx.fill();

		// Bumps on the edge, and a few droplets farther
		for (let i = 0; i < 14; i++) {
			const a = rng() * Math.PI * 2;
			const far = i < 10 ? 0.7 + rng() * 0.25 : 0.95 + rng() * 0.15;
			const size = r * (i < 10 ? 0.12 + rng() * 0.16 : 0.04 + rng() * 0.05);
			ctx.beginPath();
			ctx.arc(cx + Math.cos(a) * r * far, cy + Math.sin(a) * r * far, size, 0, Math.PI * 2);
			ctx.fill();
		}

		// Slightly darker speckles, so overlapping splats stay readable
		ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
		for (let i = 0; i < 6; i++) {
			const a = rng() * Math.PI * 2;
			const d = rng() * r * 0.7;
			ctx.beginPath();
			ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.06, 0, Math.PI * 2);
			ctx.fill();
		}

		this.texture.needsUpdate = true;
		this.mesh.visible = true;
	}
}

/**
 * Every face of the box samples the paint of the top face: the top and bottom
 * faces map it directly, the sides take the paint of the matching top edge
 * (so paint seems to drip over the edges).
 */
function mapUvsFromTop(geometry: THREE.BoxGeometry, w: number, d: number) {
	const pos = geometry.getAttribute('position');
	const normal = geometry.getAttribute('normal');
	const uv = geometry.getAttribute('uv');
	const EDGE = 0.004;

	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const z = pos.getZ(i);
		let u = (x + w / 2) / w;
		let v = 1 - (z + d / 2) / d;
		if (Math.abs(normal.getX(i)) > 0.5)
			u = normal.getX(i) > 0 ? 1 - EDGE : EDGE;
		if (Math.abs(normal.getZ(i)) > 0.5)
			v = normal.getZ(i) > 0 ? EDGE : 1 - EDGE;
		uv.setXY(i, u, v);
	}
	uv.needsUpdate = true;
}


/** A sprite showing a text (names, zone letters). `height` is its height in meters. */
function textSprite(text: string, color: string, height: number) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d")!;
	const font = "bold 64px sans-serif";
	ctx.font = font;
	canvas.width = Math.ceil(ctx.measureText(text).width) + 24;
	canvas.height = 84;
	ctx.font = font;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.lineWidth = 10;
	ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
	ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
	ctx.fillStyle = color;
	ctx.fillText(text, canvas.width / 2, canvas.height / 2);

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
	sprite.scale.set(height * canvas.width / canvas.height, height, 1);
	return sprite;
}


export class TrustRenderer {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, WIDTH / HEIGHT, 0.1, 400);

	/** Every platform (hidden ones, spawn and zones): all of them get painted. */
	private readonly paintable: PaintedPlatform[] = [];
	private readonly beams: THREE.Mesh[] = [];
	private readonly players: PlayerModel[] = [];
	/** Blob shadow of each player, on the visible platform under it (helps judging landings). */
	private readonly shadows: THREE.Mesh[] = [];
	/** Where each player is drawn this frame (interpolated, smoothed: see GMTrustIssues.drawnPositions). */
	private positions: { x: number, y: number, z: number }[] = [];
	/** Current camera distance (it backs away while the local player waits to respawn). */
	private cameraDistance = CAMERA_DISTANCE;
	private lastFrame = performance.now();
	private readonly explosions = new Map<number, ExplosionFx>();

	/** Ids of the splats already painted, in order (to detect loads that changed the list). */
	private painted: number[] = [];

	constructor(private readonly data: ClientData, level: Level, playerCount: number) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		this.renderer.setPixelRatio(1);
		this.renderer.setSize(WIDTH, HEIGHT, false);

		this.scene.background = new THREE.Color(SKY_COLOR);
		this.scene.fog = new THREE.Fog(SKY_COLOR, 50, 170);

		this.scene.add(new THREE.HemisphereLight("#ffffff", "#7a8fa6", 1.7));
		const sun = new THREE.DirectionalLight("#fff4e0", 2.2);
		sun.position.set(30, 60, 20);
		this.scene.add(sun);

		this.buildLevel(level);
		this.buildClouds(level);

		for (let i = 0; i < playerCount; i++) {
			const label = i === data.playerIdx ? null : textSprite(data.name(i), data.color(i), 0.42);
			const model = new PlayerModel(data.color(i), label);
			this.players.push(model);
			this.scene.add(model.root);

			const shadow = new THREE.Mesh(
				new THREE.CircleGeometry(PLAYER_SHADOW_RADIUS, 24),
				new THREE.MeshBasicMaterial({
					color: "#000000", transparent: true, depthWrite: false,
					polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
				}),
			);
			shadow.rotation.x = -Math.PI / 2;
			this.shadows.push(shadow);
			this.scene.add(shadow);
		}
	}

	/* ---------- Scene ---------- */

	private buildLevel(level: Level) {
		for (const p of level.platforms) {
			if (p.kind === 'hidden') {
				this.scene.add(this.paintablePlatform(p, null));
			} else if (p.kind === 'spawn') {
				this.scene.add(this.solidPlatform(p, "#e7e5e4", "#78716c"));
			} else {
				this.buildZone(p);
			}
		}
	}

	/** A paintable platform (registered so the splats paint it). */
	private paintablePlatform(p: Platform, base: string | null) {
		const painted = new PaintedPlatform(p, base);
		this.paintable.push(painted);
		return painted.mesh;
	}

	/** A visible (and paintable) platform with outlined edges. */
	private solidPlatform(p: Platform, color: string, edges: string) {
		const mesh = this.paintablePlatform(p, color);
		const lines = new THREE.LineSegments(
			new THREE.EdgesGeometry(mesh.geometry),
			new THREE.LineBasicMaterial({ color: edges }),
		);
		mesh.add(lines);
		return mesh;
	}

	/** A zone: a colored platform, a light beam seen from far away and its letter. */
	private buildZone(p: Platform) {
		const color = ZONE_COLORS[p.zone];
		const mesh = this.solidPlatform(p, color, "#ffffff");
		// The glow follows the texture, so paint over the zone stays readable
		const material = mesh.material as THREE.MeshStandardMaterial;
		material.emissive = new THREE.Color("#ffffff");
		material.emissiveMap = material.map;
		material.emissiveIntensity = 0.3;
		this.scene.add(mesh);

		const beam = new THREE.Mesh(
			new THREE.CylinderGeometry(1.2, 2.6, BEAM_HEIGHT, 20, 1, true),
			new THREE.MeshBasicMaterial({
				color, transparent: true, opacity: 0.28,
				depthWrite: false, side: THREE.DoubleSide, fog: false,
			}),
		);
		beam.position.set(p.x, p.top + BEAM_HEIGHT / 2, p.z);
		this.beams[p.zone] = beam;
		this.scene.add(beam);

		const letter = textSprite(ZONE_NAMES[p.zone], color, 3);
		(letter.material as THREE.SpriteMaterial).fog = false;
		letter.position.set(p.x, p.top + 5, p.z);
		this.scene.add(letter);
	}

	/** A sea of clouds far below, so the void reads as height. */
	private buildClouds(level: Level) {
		// Far under the kill altitude, flat and faded by the fog: it must never look like a platform
		const y = level.killY - 30;
		const sea = new THREE.Mesh(
			new THREE.PlaneGeometry(1200, 1200),
			new THREE.MeshBasicMaterial({ color: "#f8fbff" }),
		);
		sea.rotation.x = -Math.PI / 2;
		sea.position.y = y;
		this.scene.add(sea);

		const rng = createRng(level.seed ^ 0x5bd1e995);
		const material = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false });
		const sphere = new THREE.SphereGeometry(1, 12, 8);
		for (let i = 0; i < 50; i++) {
			const puff = new THREE.Mesh(sphere, material);
			const a = rng() * Math.PI * 2;
			const d = 30 + rng() * 170;
			const s = 10 + rng() * 14;
			puff.position.set(Math.cos(a) * d, y + 1 + rng() * 2, Math.sin(a) * d);
			puff.scale.set(s * 1.6, s * 0.15, s);
			this.scene.add(puff);
		}
	}

	/* ---------- Per frame ---------- */

	/**
	 * Paint the new splats (once the blast reached the platforms). When a load
	 * changed the list, everything is repainted.
	 */
	private updatePaint(splats: Splat[], clock: number) {
		const valid = this.painted.length <= splats.length && this.painted.every((id, i) => splats[i].id === id);
		if (!valid) {
			for (const h of this.paintable)
				h.clear();
			this.painted = [];
		}

		for (let i = this.painted.length; i < splats.length; i++) {
			const s = splats[i];
			if (clock - s.time < PAINT_DELAY)
				break; // splats are in time order: the next ones are younger
			const color = this.data.color(s.player);
			for (const h of this.paintable) {
				if (s.touches(h.platform))
					h.paint(s, color);
			}
			this.painted.push(s.id);
		}
	}

	/** Explosion effects of the recent splats. */
	private updateExplosions(splats: Splat[], clock: number) {
		const alive = new Set<number>();
		for (const s of splats) {
			const age = clock - s.time;
			if (age < 0 || age > EXPLOSION_FX_TIME)
				continue;
			alive.add(s.id);

			let fx = this.explosions.get(s.id);
			if (!fx) {
				fx = new ExplosionFx(s, this.data.color(s.player));
				this.explosions.set(s.id, fx);
				this.scene.add(fx.group);
			}
			fx.update(age);
		}

		for (const [id, fx] of this.explosions) {
			if (alive.has(id))
				continue;
			this.scene.remove(fx.group);
			fx.dispose();
			this.explosions.delete(id);
		}
	}

	/**
	 * Player models (hidden while waiting to respawn); the local player uses its
	 * local view direction (no input lag).
	 */
	private updatePlayers(state: TrustState, dt: number) {
		for (const [i, model] of this.players.entries()) {
			const p = state.players[i];
			model.root.visible = !!p && !p.isDead() && (p.connected || i === this.data.playerIdx);
			if (!p) {
				this.shadows[i].visible = false;
				continue;
			}
			const pos = this.displayed(i, p);
			model.update(p, pos, i === this.data.playerIdx ? this.data.yaw : p.yaw, dt);
			this.updateShadow(this.shadows[i], model.root.visible ? p : null, pos);
		}
	}

	/** Where a player is drawn this frame (its simulated position when none was given). */
	private displayed(i: number, p: Player) {
		return this.positions[i] ?? { x: p.x, y: p.y, z: p.z };
	}

	/**
	 * Place a player's shadow on the highest visible platform under its feet
	 * (spawn, zones, painted platforms: it never reveals anything new). It fades
	 * and shrinks with the height.
	 */
	private updateShadow(shadow: THREE.Mesh, p: Player | null, pos: { x: number, y: number, z: number }) {
		shadow.visible = false;
		if (!p)
			return;

		const feet = pos.y - PLAYER_FEET;
		let top = -Infinity;
		for (const h of this.paintable) {
			const q = h.platform;
			if (h.mesh.visible && q.top <= feet + 0.05 && q.top > top && isAbove(q, pos.x, pos.z))
				top = q.top;
		}
		if (top === -Infinity)
			return;

		const height = feet - top;
		shadow.visible = true;
		shadow.position.set(pos.x, top + 0.01, pos.z);
		shadow.scale.setScalar(1 - Math.min(0.55, height / 14));
		(shadow.material as THREE.MeshBasicMaterial).opacity = 0.42 * Math.max(0.2, 1 - height / 9);
	}

	/** Zones already reached by the local player are dimmed. */
	private updateBeams(state: TrustState, clock: number) {
		const self = state.players[this.data.playerIdx];
		for (const [z, beam] of this.beams.entries()) {
			const done = self?.hasZone(z) ?? false;
			const material = beam.material as THREE.MeshBasicMaterial;
			material.opacity = done ? 0.08 : 0.24 + 0.08 * Math.sin(clock * 3 + z);
		}
	}

	/** Third person camera: behind the player, along the view direction. */
	private updateCamera(state: TrustState, dt: number) {
		const self = state.players[this.data.playerIdx];
		if (!self)
			return;

		// After exploding, the camera backs away from the blast to show what got painted
		const wanted = self.isDead() ? DEAD_CAMERA_DISTANCE : CAMERA_DISTANCE;
		if (!self.isDead() && this.cameraDistance > wanted)
			this.cameraDistance = wanted; // respawned: snap back behind the player
		this.cameraDistance += (wanted - this.cameraDistance) * Math.min(1, dt * 5);

		const f = forwardOf(this.data.yaw);
		const cp = Math.cos(this.data.pitch);
		const dir = new THREE.Vector3(f.x * cp, Math.sin(this.data.pitch), f.z * cp);
		const pos = this.displayed(this.data.playerIdx, self);
		const target = new THREE.Vector3(pos.x, pos.y + 0.7, pos.z);
		this.camera.position.copy(target).addScaledVector(dir, -this.cameraDistance);
		this.camera.position.y += 1; // a bit above: the player does not hide the center of the view
		this.camera.lookAt(target.clone().addScaledVector(dir, 4));

		// Shake right after the local player exploded (or saw an explosion very close)
		const shake = this.data.shakeAmount();
		if (shake > 0) {
			const t = performance.now() / 1000;
			this.camera.rotateX(Math.sin(t * 61) * 0.025 * shake);
			this.camera.rotateY(Math.sin(t * 47 + 1.3) * 0.025 * shake);
			this.camera.rotateZ(Math.sin(t * 53 + 2.1) * 0.02 * shake);
		}
	}

	/** Render the world, then copy it onto the game canvas. */
	render(ctx: CanvasRenderingContext2D, state: TrustState, positions: { x: number, y: number, z: number }[]) {
		this.positions = positions;
		const clock = MATCH_DURATION - state.time;
		const now = performance.now();
		const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
		this.lastFrame = now;

		this.updatePaint(state.splats, clock);
		this.updateExplosions(state.splats, clock);
		this.updatePlayers(state, dt);
		this.updateBeams(state, clock);
		this.updateCamera(state, dt);

		this.renderer.render(this.scene, this.camera);
		ctx.drawImage(this.renderer.domElement, 0, 0, WIDTH, HEIGHT);
	}
}

import * as THREE from 'three';
import { ImageLoaderFolder } from "../../util/ImageLoader";
import {
	BOX_HEIGHT,
	CAMERA_HEIGHT,
	CAMERA_SCALE,
	CURSOR_COLOR,
	LOCK_COLOR,
	HEIGHT,
	PLAYER_HEIGHT,
	WIDTH,
} from "./constants";
import { ClientData, project } from "./client";
import { Block, Entity, Player, ViewContext } from "./entities";
import { disposeOwned } from "./entities/models";
import { LEVEL } from "./level";
import { HuntPhysics } from "./physics";
import { ItemPreview } from "./preview";
import { HuntState } from "./simulation";

/* -------------------------------------------------------------------------- */
/* Drawing.                                                                   */
/*                                                                            */
/* The world is rendered by three.js (each entity owns its model) with a      */
/* perspective camera looking straight down, into its own WebGL canvas, which */
/* is then copied onto the game canvas. The HUD drawn above the world (bars,  */
/* names, cursor, lock) uses the same projection (see `project`).             */
/* -------------------------------------------------------------------------- */

/** Vertical field of view giving CAMERA_SCALE pixels per unit at altitude 0. */
const FOV = 2 * Math.atan((HEIGHT / 2) / (CAMERA_SCALE * CAMERA_HEIGHT)) * 180 / Math.PI;
/** Direction the sun comes from (three.js coordinates), and shadow area half size. */
const SUN_OFFSET = new THREE.Vector3(-500, 650, 1400);
const SHADOW_HALF = 1700;

export class HuntRenderer implements ViewContext {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(FOV, WIDTH / HEIGHT, 50, CAMERA_HEIGHT + 400);
	private readonly sun = new THREE.DirectionalLight("#fff4e0", 2.4);
	/** Models of the entities, rebuilt (mark and sweep) every frame. */
	private readonly world = new THREE.Group();
	private readonly preview = new ItemPreview();
	private readonly ground: THREE.Mesh;
	private groundTextured = false;
	private readonly textures = new Map<string, THREE.Texture>();

	clock = 0;
	readonly selfIdx: number;

	constructor(private readonly data: ClientData, private readonly loader: ImageLoaderFolder) {
		this.selfIdx = data.playerIdx;

		this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		this.renderer.setPixelRatio(1);
		this.renderer.setSize(WIDTH, HEIGHT, false);
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		this.scene.background = new THREE.Color("#1b1b22");
		this.camera.up.set(0, 1, 0);

		this.scene.add(new THREE.HemisphereLight("#dfe8ff", "#3a4a35", 1.6));
		this.sun.castShadow = true;
		this.sun.shadow.mapSize.set(2048, 2048);
		const sc = this.sun.shadow.camera;
		sc.left = -SHADOW_HALF;
		sc.right = SHADOW_HALF;
		sc.top = SHADOW_HALF;
		sc.bottom = -SHADOW_HALF;
		sc.near = 10;
		sc.far = 4000;
		this.sun.shadow.bias = -0.0005;
		this.scene.add(this.sun, this.sun.target);

		this.ground = this.createGround();
		this.scene.add(this.ground, this.world, this.preview.group);
	}

	/* ---------- ViewContext ---------- */

	get selfFacing() {
		return this.data.facing;
	}

	color(idx: number) {
		return this.data.color(idx);
	}

	texture(label: string) {
		const cached = this.textures.get(label);
		if (cached)
			return cached;

		const image = this.loader.get(label);
		if (image === this.loader.get(null))
			return null; // missing (or not loaded yet)

		const tex = new THREE.Texture(image);
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
		tex.needsUpdate = true;
		this.textures.set(label, tex);
		return tex;
	}

	/* ---------- Scene ---------- */

	private createGround() {
		const w = LEVEL.maxX - LEVEL.minX;
		const h = LEVEL.maxY - LEVEL.minY;
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(w, h),
			new THREE.MeshStandardMaterial({ color: "#3a5a40", roughness: 1 }),
		);
		ground.position.set((LEVEL.minX + LEVEL.maxX) / 2, -(LEVEL.minY + LEVEL.maxY) / 2, 0);
		ground.receiveShadow = true;

		// Grid, so movement is readable even without texture
		const grid = new THREE.GridHelper(Math.max(w, h), Math.max(w, h) / 100, "#5b7b60", "#4a6a4f");
		grid.rotation.x = Math.PI / 2;
		grid.position.z = 0.5;
		(grid.material as THREE.Material).transparent = true;
		(grid.material as THREE.Material).opacity = 0.35;
		ground.add(grid);
		return ground;
	}

	/** Use the ground texture as soon as it is available. */
	private updateGroundTexture() {
		if (this.groundTextured)
			return;
		const tex = this.texture('ground');
		if (!tex)
			return;

		const t = tex.clone();
		t.repeat.set((LEVEL.maxX - LEVEL.minX) / 256, (LEVEL.maxY - LEVEL.minY) / 256);
		t.needsUpdate = true;
		const material = this.ground.material as THREE.MeshStandardMaterial;
		material.map = t;
		material.color.set("#ffffff");
		material.needsUpdate = true;
		this.groundTextured = true;
	}

	/** Put the model of every visible entity in the scene and drop the others. */
	private syncModels(entities: Iterable<Entity>) {
		const seen = new Set<THREE.Object3D>();
		for (const e of entities) {
			if (!e.isVisible())
				continue;
			const model = e.getModel(this);
			if (model.parent !== this.world)
				this.world.add(model);
			seen.add(model);
		}

		for (const child of [...this.world.children]) {
			if (seen.has(child))
				continue;
			this.world.remove(child);
			disposeOwned(child);
		}
	}

	/** Render the world, then copy it onto the game canvas. */
	render(ctx: CanvasRenderingContext2D, state: HuntState, blocks: Block[], physics: HuntPhysics | null, clock: number) {
		this.clock = clock;
		this.updateGroundTexture();

		const cam = this.data.camera;
		this.camera.position.set(cam.x, -cam.y, CAMERA_HEIGHT);
		this.camera.lookAt(cam.x, -cam.y, 0);

		this.sun.target.position.set(cam.x, -cam.y, 0);
		this.sun.position.copy(this.sun.target.position).add(SUN_OFFSET);

		this.syncModels(allEntities(state, blocks));
		this.preview.update(state, this.data, physics);

		this.renderer.render(this.scene, this.camera);
		ctx.drawImage(this.renderer.domElement, 0, 0, WIDTH, HEIGHT);
	}
}

/** Every entity of the map, in drawing order (it does not matter with a depth buffer). */
function* allEntities(state: HuntState, blocks: Block[]): Generator<Entity> {
	yield* blocks;
	yield* state.boxes;
	yield* state.iceZones;
	yield* state.pickups;
	yield* state.players;
	yield* state.projectiles;
	yield* state.bombs;
	yield* state.shells;
	yield* state.explosions;
}


/* -------------------------------------------------------------------------- */
/* 2D overlays                                                                */
/* -------------------------------------------------------------------------- */

interface OverlayContext {
	ctx: CanvasRenderingContext2D;
	state: HuntState;
	data: ClientData;
	clock: number;
}

/** Draw the whole frame: the 3D world, then the overlays. */
export function drawFrame(
	ctx: CanvasRenderingContext2D,
	state: HuntState,
	blocks: Block[],
	data: ClientData,
	loader: ImageLoaderFolder,
	physics: HuntPhysics | null,
	clock: number,
) {
	data.renderer ??= new HuntRenderer(data, loader);
	data.renderer.render(ctx, state, blocks, physics, clock);

	const oc: OverlayContext = { ctx, state, data, clock };
	const cam = data.camera;

	ctx.save();
	ctx.translate(WIDTH / 2, HEIGHT / 2);
	ctx.scale(CAMERA_SCALE, CAMERA_SCALE);
	ctx.translate(-cam.x, -cam.y);

	drawBoxBars(oc);
	for (const [i, p] of state.players.entries()) {
		if (p.isAlive())
			drawPlayerInfo(oc, p, i);
	}
	drawCursor(oc);

	ctx.restore();

	drawSelfArrow(oc);
}

/** Project a 3D point with the current camera. */
function P(oc: OverlayContext, x: number, y: number, z: number) {
	return project(oc.data.camera.x, oc.data.camera.y, x, y, z);
}

/** Life bars of the damaged boxes. */
function drawBoxBars(oc: OverlayContext) {
	for (const box of oc.state.boxes) {
		if (!box.isStanding() || box.hp >= box.maxHp)
			continue;
		const top = P(oc, box.x, box.y, box.z + BOX_HEIGHT);
		drawBar(oc.ctx, top.x, top.y - 50, 70, 9, box.hp / box.maxHp, "#f4a261");
	}
}

/** Life bar and name above a player. */
function drawPlayerInfo(oc: OverlayContext, p: Player, idx: number) {
	const { ctx, data } = oc;
	const isSelf = idx === data.playerIdx;
	const head = P(oc, p.x, p.y, p.z + PLAYER_HEIGHT);
	const r = p.hitRadius() * head.s;

	const barY = head.y - r - 22;
	drawBar(ctx, head.x, barY, 80, 10, p.hp / p.maxHp, isSelf ? "#4ade80" : "#ef4444");

	ctx.fillStyle = "#fff";
	ctx.font = "bold 20px sans-serif";
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	ctx.fillText(data.name(idx), head.x, barY - 8);
}

/** A horizontal bar centered on (x, y). */
function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, color: string) {
	ctx.fillStyle = "rgba(0,0,0,0.6)";
	ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, h + 4);
	ctx.fillStyle = color;
	ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, ratio)), h);
}

/* ---------------------------- Cursor & lock ---------------------------- */

/** Four triangles pointing to the center, rotating around it (blue, orange while locked). */
function drawCursor(oc: OverlayContext) {
	const { ctx, data } = oc;
	const c = data.cursor;
	const tri = 13;
	ctx.fillStyle = data.lock ? LOCK_COLOR : CURSOR_COLOR;
	ctx.strokeStyle = "rgba(255,255,255,0.8)";
	ctx.lineWidth = 2;

	for (let i = 0; i < 4; i++) {
		const a = c.angle + i * Math.PI / 2;
		const cos = Math.cos(a);
		const sin = Math.sin(a);
		// Tip near the center, base farther away
		const tipX = c.x + cos * c.size;
		const tipY = c.y + sin * c.size;
		const baseX = c.x + cos * (c.size + tri * 1.6);
		const baseY = c.y + sin * (c.size + tri * 1.6);

		ctx.beginPath();
		ctx.moveTo(tipX, tipY);
		ctx.lineTo(baseX - sin * tri, baseY + cos * tri);
		ctx.lineTo(baseX + sin * tri, baseY - cos * tri);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}
}

/** While the camera follows a locked target, show where the local player is when off screen. */
function drawSelfArrow(oc: OverlayContext) {
	const { ctx, data, state } = oc;
	const self = state.players[data.playerIdx];
	if (!data.lock || !self || !self.isAlive())
		return;

	const cam = data.camera;
	const p = project(cam.x, cam.y, self.x, self.y, self.z + PLAYER_HEIGHT);
	const sx = WIDTH / 2 + (p.x - cam.x) * CAMERA_SCALE;
	const sy = HEIGHT / 2 + (p.y - cam.y) * CAMERA_SCALE;
	const margin = 50;
	if (sx > margin && sx < WIDTH - margin && sy > margin && sy < HEIGHT - margin)
		return;

	const ex = Math.max(margin, Math.min(WIDTH - margin, sx));
	const ey = Math.max(margin, Math.min(HEIGHT - margin, sy));
	const a = Math.atan2(sy - HEIGHT / 2, sx - WIDTH / 2);

	ctx.save();
	ctx.translate(ex, ey);
	ctx.rotate(a);
	ctx.fillStyle = CURSOR_COLOR;
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(22, 0);
	ctx.lineTo(-14, -16);
	ctx.lineTo(-14, 16);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

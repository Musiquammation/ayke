/**
 * Client-only visual layer of the Rally game mode: scenery, decorations,
 * particles and HUD widgets. Nothing in this file affects the simulation and
 * nothing here is saved; it only reads game state and draws it.
 *
 * Canvas / DOM objects are created lazily, so importing this module on the
 * server is harmless.
 */

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Deterministic pseudo-random value in [0, 1) for an integer seed. */
export function hash01(n: number): number {
	let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
	x ^= x >>> 13;
	x = Math.imul(x, 0xc2b2ae35);
	x ^= x >>> 16;
	return (x >>> 0) / 4294967296;
}

function clamp01(v: number) {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.ceil(width));
	canvas.height = Math.max(1, Math.ceil(height));
	return canvas;
}

/** True when the image loader returned its 2x2 "missing texture" placeholder. */
export function isMissingTexture(texture: CanvasImageSource | null | undefined): boolean {
	if (!texture) return true;
	const w = (texture as HTMLImageElement).naturalWidth || (texture as HTMLCanvasElement).width || 0;
	return w <= 2;
}

/* -------------------------------------------------------------------------- */
/* Themes                                                                     */
/* -------------------------------------------------------------------------- */

export interface RallyTheme {
	skyTop: string;
	skyMid: string;
	skyBottom: string;
	sun: string;
	sunGlow: string;
	sunX: number; // fraction of the screen width
	sunY: number; // fraction of the screen height
	cloud: string;
	cloudShade: string;
	mountainFar: [string, string];
	mountainNear: [string, string];
	snow: string;
	hills: [string, string];
	trees: string;
	haze: string;
	abyss: string;
	vignette: string;
}

const THEMES: RallyTheme[] = [
	// Sunny afternoon over green hills.
	{
		skyTop: '#2f7fd8', skyMid: '#73b9f0', skyBottom: '#d3efff',
		sun: '#fffbe0', sunGlow: '#fff3b0', sunX: 0.78, sunY: 0.17,
		cloud: '#ffffff', cloudShade: '#cfe3f5',
		mountainFar: ['#8fb4dc', '#b5d1ee'],
		mountainNear: ['#6f97c4', '#9ebfe0'],
		snow: '#f4fbff',
		hills: ['#4f9f58', '#2f7a43'],
		trees: '#2a6338',
		haze: '#d9f1ff',
		abyss: '#0d1c2b',
		vignette: 'rgba(5, 18, 40, 0.42)',
	},
	// Alpine golden hour.
	{
		skyTop: '#3b3f8f', skyMid: '#d87a7a', skyBottom: '#ffcf8a',
		sun: '#fff1c4', sunGlow: '#ffb65c', sunX: 0.24, sunY: 0.3,
		cloud: '#ffd9c0', cloudShade: '#d99a9a',
		mountainFar: ['#8a6fa8', '#c78fa3'],
		mountainNear: ['#5d4f86', '#9a6f96'],
		snow: '#ffe9e0',
		hills: ['#56804f', '#2f5640'],
		trees: '#24402f',
		haze: '#ffd8b0',
		abyss: '#1b1030',
		vignette: 'rgba(30, 10, 40, 0.45)',
	},
];

export function getTheme(levelIndex: number): RallyTheme {
	return THEMES[((levelIndex % THEMES.length) + THEMES.length) % THEMES.length];
}

/* -------------------------------------------------------------------------- */
/* Background (screen space, parallax)                                        */
/* -------------------------------------------------------------------------- */

const LAYER_W = 2400;

/* ----------------------------- Shared sky ----------------------------- */

/** cloudStep wraps at this value (seconds); large enough that the wrap is never noticed. */
export const CLOUD_CYCLE = 10000;
const SKY_W = 2400;
const SKY_H = 1350;
const SKY_SPAN = SKY_W + 900;
const CLOUD_COUNT = 7;
const SUN_RADIUS = 70;

interface CloudPlacement { x: number; y: number; w: number; h: number; alpha: number; sprite: number }

function cloudSeed(themeIndex: number, sprite: number) {
	return themeIndex * 1000 + 17 + 900 + sprite * 13;
}

/**
 * Cloud rectangles in sky space (camera-independent). They only depend on the
 * shared cloudStep, so every client sees the same clouds cross the sun.
 */
function cloudLayout(themeIndex: number, cloudStep: number): CloudPlacement[] {
	const theme = THEMES[themeIndex];
	const sunY = SKY_H * theme.sunY;
	return Array.from({ length: CLOUD_COUNT }, (_, i) => {
		const sprite = i % 6;
		const baseW = 360 + hash01(cloudSeed(themeIndex, sprite)) * 260;
		const scale = 0.35 + hash01(i + 120) * 0.45;
		const w = baseW * scale;
		const h = baseW * 0.42 * scale;
		const speed = 18 + hash01(i + 70) * 30;
		const raw = hash01(i + 40) * SKY_SPAN + cloudStep * speed;
		const x = ((raw % SKY_SPAN) + SKY_SPAN) % SKY_SPAN - 600;
		// Clouds drift in a band around the sun's height, so they regularly hide it.
		const y = Math.max(10, sunY + (hash01(i + 90) - 0.6) * 440 - h / 2);
		return { x, y, w, h, alpha: 0.55 + hash01(i + 150) * 0.35, sprite };
	});
}

/** How much the sun is hidden by clouds, 0 (clear) to 1 (fully covered). Deterministic from cloudStep. */
export function sunOcclusion(levelIndex: number, cloudStep: number): number {
	const themeIndex = ((levelIndex % THEMES.length) + THEMES.length) % THEMES.length;
	const theme = THEMES[themeIndex];
	const sx = SKY_W * theme.sunX;
	const sy = SKY_H * theme.sunY;
	let clear = 1;
	for (const c of cloudLayout(themeIndex, cloudStep)) {
		const rx = c.w * 0.4 + SUN_RADIUS * 0.6;
		const ry = c.h * 0.33 + SUN_RADIUS * 0.6;
		const dx = (sx - (c.x + c.w / 2)) / rx;
		const dy = (sy - (c.y + c.h * 0.55)) / ry;
		const d = Math.sqrt(dx * dx + dy * dy);
		const t = clamp01((1 - d) / 0.55); // 0 at the edge, 1 well inside
		const cover = t * t * (3 - 2 * t) * Math.min(1, c.alpha * 1.2);
		clear *= 1 - cover;
	}
	return 1 - clear;
}

interface ParallaxLayer {
	canvas: HTMLCanvasElement;
	factor: number;   // horizontal parallax factor
	vFactor: number;  // vertical parallax factor
	baseY: number;    // top of the layer, in screen units, when the camera is at refY
}

/**
 * Pre-renders tiling strips once per theme, then draws them every frame
 * with a parallax offset. Strips are LAYER_W wide and wrap horizontally.
 */
export class RallyBackdrop {
	private themeIndex = -1;
	private layers: ParallaxLayer[] = [];
	private clouds: HTMLCanvasElement[] = [];
	private theme: RallyTheme = THEMES[0];

	private ensure(levelIndex: number) {
		const index = ((levelIndex % THEMES.length) + THEMES.length) % THEMES.length;
		if (index === this.themeIndex) return;
		this.themeIndex = index;
		this.theme = THEMES[index];
		const seed = index * 1000 + 17;
		this.layers = [
			{ canvas: this.renderMountains(seed, 520, 0.85, this.theme.mountainFar, 9), factor: 0.06, vFactor: 0.03, baseY: 250 },
			{ canvas: this.renderMountains(seed + 300, 460, 0.7, this.theme.mountainNear, 6), factor: 0.14, vFactor: 0.07, baseY: 400 },
			{ canvas: this.renderHills(seed + 600, 420), factor: 0.28, vFactor: 0.14, baseY: 560 },
		];
		this.clouds = Array.from({ length: 6 }, (_, i) => this.renderCloud(cloudSeed(index, i)));
	}

	/** Jagged mountain range with snow caps. */
	private renderMountains(seed: number, height: number, peakScale: number, colors: [string, string], count: number) {
		const canvas = createCanvas(LAYER_W, height);
		const ctx = canvas.getContext('2d')!;
		const theme = this.theme;
		const peaks = Array.from({ length: count }, (_, i) => ({
			x: (i + hash01(seed + i) * 0.7) * (LAYER_W / count),
			h: height * (0.45 + hash01(seed + 50 + i) * 0.5) * peakScale,
			w: LAYER_W / count * (1.1 + hash01(seed + 90 + i) * 0.9),
		}));

		const gradient = ctx.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, colors[0]);
		gradient.addColorStop(1, colors[1]);

		for (const offset of [-LAYER_W, 0, LAYER_W]) {
			for (const [i, p] of peaks.entries()) {
				const cx = p.x + offset;
				const top = height - p.h;
				const half = p.w / 2;
				// Body with a slightly jagged outline.
				ctx.beginPath();
				ctx.moveTo(cx - half, height);
				const steps = 7;
				for (let s = 1; s < steps; s++) {
					const t = s / steps;
					const jitter = (hash01(seed + i * 31 + s) - 0.5) * p.h * 0.08;
					ctx.lineTo(cx - half + half * t, height - p.h * t + jitter);
				}
				ctx.lineTo(cx, top);
				for (let s = steps - 1; s >= 1; s--) {
					const t = s / steps;
					const jitter = (hash01(seed + i * 37 + s + 100) - 0.5) * p.h * 0.08;
					ctx.lineTo(cx + half - half * t, height - p.h * t + jitter);
				}
				ctx.lineTo(cx + half, height);
				ctx.closePath();
				ctx.fillStyle = gradient;
				ctx.fill();

				// Shaded right flank for volume.
				ctx.save();
				ctx.clip();
				ctx.fillStyle = 'rgba(20, 20, 60, 0.16)';
				ctx.beginPath();
				ctx.moveTo(cx, top);
				ctx.lineTo(cx + half, height);
				ctx.lineTo(cx + p.w * 0.05, height);
				ctx.closePath();
				ctx.fill();

				// Snow cap: the top ~22% of tall peaks.
				if (p.h > height * 0.45 * peakScale) {
					const capH = p.h * 0.24;
					ctx.fillStyle = theme.snow;
					ctx.beginPath();
					ctx.moveTo(cx, top - 2);
					ctx.lineTo(cx + half * 0.26, top + capH);
					for (let s = 0; s <= 6; s++) {
						const x = cx + half * 0.26 - (half * 0.52) * (s / 6);
						const y = top + capH * (s % 2 === 0 ? 1 : 0.62) + (hash01(seed + i * 7 + s) - 0.5) * 10;
						ctx.lineTo(x, y);
					}
					ctx.closePath();
					ctx.fill();
				}
				ctx.restore();
			}
		}
		return canvas;
	}

	/** Rolling hills topped by a line of pine trees. */
	private renderHills(seed: number, height: number) {
		const canvas = createCanvas(LAYER_W, height);
		const ctx = canvas.getContext('2d')!;
		const theme = this.theme;
		const waves = [1, 2, 3, 5].map((k, i) => ({
			k, a: [46, 26, 14, 7][i], phase: hash01(seed + i) * Math.PI * 2,
		}));
		const ridge = (x: number) => 150 + waves.reduce((sum, w) => sum + w.a * Math.sin((x / LAYER_W) * Math.PI * 2 * w.k + w.phase), 0);

		// Trees first (behind the hill crest), every ~28 px with random gaps.
		ctx.fillStyle = theme.trees;
		for (let x = 0; x < LAYER_W; x += 26) {
			const r = hash01(seed + 400 + x);
			if (r < 0.28) continue;
			const h = 50 + r * 70;
			const w = h * 0.42;
			for (const offset of [-LAYER_W, 0, LAYER_W]) {
				const cx = x + offset + (hash01(seed + x) - 0.5) * 16;
				if (cx < -w || cx > LAYER_W + w) continue;
				const base = ridge(((cx % LAYER_W) + LAYER_W) % LAYER_W) + 14;
				ctx.beginPath();
				ctx.moveTo(cx, base - h);
				ctx.lineTo(cx + w / 2, base);
				ctx.lineTo(cx - w / 2, base);
				ctx.closePath();
				ctx.fill();
			}
		}

		const gradient = ctx.createLinearGradient(0, 80, 0, height);
		gradient.addColorStop(0, theme.hills[0]);
		gradient.addColorStop(1, theme.hills[1]);
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.moveTo(0, height);
		for (let x = 0; x <= LAYER_W; x += 8) ctx.lineTo(x, ridge(x));
		ctx.lineTo(LAYER_W, height);
		ctx.closePath();
		ctx.fill();

		// Light rim on the crest.
		ctx.strokeStyle = 'rgba(255, 255, 220, 0.18)';
		ctx.lineWidth = 3;
		ctx.beginPath();
		for (let x = 0; x <= LAYER_W; x += 8) {
			if (x === 0) ctx.moveTo(x, ridge(x) + 2); else ctx.lineTo(x, ridge(x) + 2);
		}
		ctx.stroke();
		return canvas;
	}

	private renderCloud(seed: number) {
		const w = 360 + hash01(seed) * 260;
		const h = w * 0.42;
		const canvas = createCanvas(w, h);
		const ctx = canvas.getContext('2d')!;
		const puffs = 6 + Math.floor(hash01(seed + 1) * 4);
		const theme = this.theme;
		const draw = (color: string, dy: number) => {
			ctx.fillStyle = color;
			for (let i = 0; i < puffs; i++) {
				const t = (i + 0.5) / puffs;
				const r = h * (0.22 + 0.2 * Math.sin(t * Math.PI)) * (0.8 + hash01(seed + 10 + i) * 0.4);
				const x = w * 0.12 + t * w * 0.76;
				const y = h * 0.62 - r * 0.45 + dy;
				ctx.beginPath();
				ctx.arc(x, y, r, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.beginPath();
			ctx.roundRect(w * 0.1, h * 0.5 + dy, w * 0.8, h * 0.28, h * 0.14);
			ctx.fill();
		};
		draw(theme.cloudShade, 6);
		draw(theme.cloud, 0);
		return canvas;
	}

	/**
	 * Draws the whole screen-space background.
	 * camX / camY are the world camera coordinates, refY the level ground height,
	 * cloudStep the shared sky clock.
	 */
	draw(ctx: CanvasRenderingContext2D, width: number, height: number, levelIndex: number, camX: number, camY: number, refY: number, cloudStep: number) {
		this.ensure(levelIndex);
		const theme = this.theme;
		const dy = camY - refY;
		const occlusion = sunOcclusion(levelIndex, cloudStep);

		// Sky.
		const sky = ctx.createLinearGradient(0, 0, 0, height);
		sky.addColorStop(0, theme.skyTop);
		sky.addColorStop(0.55, theme.skyMid);
		sky.addColorStop(1, theme.skyBottom);
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, width, height);

		// Sun and its halo (barely moves: it is "infinitely" far).
		const sunX = width * theme.sunX - camX * 0.01;
		const sunY = height * theme.sunY - dy * 0.01;
		ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		ctx.globalAlpha = 1 - occlusion * 0.85;
		const glow = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 520);
		glow.addColorStop(0, theme.sunGlow + 'aa');
		glow.addColorStop(0.3, theme.sunGlow + '33');
		glow.addColorStop(1, theme.sunGlow + '00');
		ctx.fillStyle = glow;
		ctx.fillRect(sunX - 520, sunY - 520, 1040, 1040);
		ctx.restore();
		ctx.fillStyle = theme.sun;
		ctx.beginPath();
		ctx.arc(sunX, sunY, 70, 0, Math.PI * 2);
		ctx.fill();

		// Drifting clouds, in front of the sun and behind the mountains. They share
		// the sun's tiny parallax, so what covers the sun is the same for everyone.
		for (const c of cloudLayout(this.themeIndex, cloudStep)) {
			ctx.globalAlpha = c.alpha;
			ctx.drawImage(this.clouds[c.sprite], c.x - camX * 0.01, c.y - dy * 0.01, c.w, c.h);
		}
		ctx.globalAlpha = 1;

		// Parallax strips. Each strip is followed by a solid fill so tall
		// screens never show the sky below the hills.
		for (const [i, layer] of this.layers.entries()) {
			const y = layer.baseY - dy * layer.vFactor;
			const offset = -(((camX * layer.factor) % LAYER_W) + LAYER_W) % LAYER_W;
			for (let x = offset; x < width; x += LAYER_W) {
				ctx.drawImage(layer.canvas, x, y);
			}
			const bottom = y + layer.canvas.height;
			if (bottom < height) {
				ctx.fillStyle = i === this.layers.length - 1 ? theme.hills[1] : (i === 0 ? theme.mountainFar[1] : theme.mountainNear[1]);
				ctx.fillRect(0, bottom - 1, width, height - bottom + 1);
			}
			// Atmospheric haze between depth layers.
			if (i < this.layers.length - 1) {
				const haze = ctx.createLinearGradient(0, y + layer.canvas.height * 0.4, 0, y + layer.canvas.height + 200);
				haze.addColorStop(0, theme.haze + '00');
				haze.addColorStop(1, theme.haze + '66');
				ctx.fillStyle = haze;
				ctx.fillRect(0, y + layer.canvas.height * 0.4, width, layer.canvas.height * 0.6 + 200);
			}
		}
	}

	/** Darkens the void under the level so falling looks deadly. World space. */
	drawAbyss(ctx: CanvasRenderingContext2D, levelIndex: number, left: number, right: number, deathY: number) {
		this.ensure(levelIndex);
		const top = deathY - 520;
		const gradient = ctx.createLinearGradient(0, top, 0, deathY + 200);
		gradient.addColorStop(0, this.theme.abyss + '00');
		gradient.addColorStop(0.6, this.theme.abyss + 'aa');
		gradient.addColorStop(1, this.theme.abyss + 'f0');
		ctx.fillStyle = gradient;
		ctx.fillRect(left, top, right - left, deathY + 200 - top);
		ctx.fillStyle = this.theme.abyss + 'f0';
		ctx.fillRect(left, deathY + 199, right - left, 4000);
	}

	/** Screen-space shade over the world while a cloud hides the sun (0..1). */
	drawCloudShade(ctx: CanvasRenderingContext2D, width: number, height: number, occlusion: number) {
		if (occlusion <= 0.01) return;
		ctx.fillStyle = `rgba(18, 26, 46, ${(occlusion * 0.32).toFixed(3)})`;
		ctx.fillRect(0, 0, width, height);
	}

	/** Screen-space vignette, drawn over the world but under the HUD. */
	drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
		const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.45, width / 2, height / 2, width * 0.66);
		vignette.addColorStop(0, 'rgba(0,0,0,0)');
		vignette.addColorStop(1, this.theme.vignette);
		ctx.fillStyle = vignette;
		ctx.fillRect(0, 0, width, height);
	}
}

/* -------------------------------------------------------------------------- */
/* Terrain decorations (world space)                                          */
/* -------------------------------------------------------------------------- */

export interface Rect { left: number; top: number; width: number; height: number }

/** Darkens deep ground rows (ambient occlusion). Boxes and other skins keep their texture as-is. */
export function drawPlatformShading(ctx: CanvasRenderingContext2D, r: Rect, grid: number, skin: string) {
	if (skin !== 'grass' || r.height <= grid * 1.5) return;
	// Full darkness after ~7 rows, then constant.
	const gradient = ctx.createLinearGradient(0, r.top + grid * 0.6, 0, r.top + Math.min(r.height, grid * 7));
	gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
	gradient.addColorStop(1, r.height > grid * 7 ? 'rgba(10, 5, 20, 0.6)' : 'rgba(10, 5, 20, 0.5)');
	ctx.fillStyle = gradient;
	ctx.fillRect(r.left, r.top + grid * 0.6, r.width, r.height - grid * 0.6);
}

const GRASS_COLORS = ['#58b33a', '#6fcf45', '#3f9a32', '#8be05a'];
const FLOWER_COLORS = ['#ffe25c', '#ff7aa8', '#ffffff', '#b38cff', '#ff8c42'];

/** Swaying grass blades and small flowers along the top edge of a grass platform. */
export function drawGrassDecor(ctx: CanvasRenderingContext2D, r: Rect, time: number, viewLeft: number, viewRight: number) {
	const start = Math.max(r.left, Math.floor(viewLeft / 9) * 9);
	const end = Math.min(r.left + r.width, viewRight);
	if (end <= start) return;
	const y = r.top + 3;
	ctx.lineCap = 'round';
	ctx.lineWidth = 3;
	for (let x = start; x < end; x += 9) {
		const id = Math.round(x);
		const h = 7 + hash01(id) * 13;
		const sway = Math.sin(time * 2.2 + x * 0.045) * 3.5 + Math.sin(time * 3.7 + x * 0.11) * 1.2;
		ctx.strokeStyle = GRASS_COLORS[Math.floor(hash01(id + 7) * GRASS_COLORS.length)];
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.quadraticCurveTo(x + sway * 0.4, y - h * 0.6, x + sway, y - h);
		ctx.stroke();

		// Sparse flowers.
		const f = hash01(id + 31);
		if (f > 0.93) {
			const fx = x + sway;
			const fy = y - h - 2;
			ctx.fillStyle = FLOWER_COLORS[Math.floor(hash01(id + 99) * FLOWER_COLORS.length)];
			for (let k = 0; k < 5; k++) {
				const a = (k / 5) * Math.PI * 2 + time * 0.3;
				ctx.beginPath();
				ctx.arc(fx + Math.cos(a) * 4, fy + Math.sin(a) * 4, 3.2, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.fillStyle = '#ffcf33';
			ctx.beginPath();
			ctx.arc(fx, fy, 2.6, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}

/** Glossy surface and bubbles popping on mud. */
export function drawMudDecor(ctx: CanvasRenderingContext2D, r: Rect, time: number, seed: number) {
	// Wet sheen moving along the surface.
	ctx.save();
	ctx.beginPath();
	ctx.rect(r.left, r.top - 30, r.width, r.height + 30);
	ctx.clip();
	ctx.strokeStyle = 'rgba(255, 230, 200, 0.25)';
	ctx.lineWidth = 3;
	ctx.beginPath();
	for (let x = r.left; x <= r.left + r.width; x += 8) {
		const y = r.top + 6 + Math.sin(x * 0.05 + time * 2) * 2;
		if (x === r.left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.stroke();

	const slots = Math.max(1, Math.floor(r.width / 46));
	for (let i = 0; i < slots; i++) {
		const period = 1.6 + hash01(seed + i) * 1.8;
		const t = ((time + hash01(seed + i + 50) * period) % period) / period;
		const x = r.left + (i + 0.3 + hash01(seed + i + 80) * 0.4) * (r.width / slots);
		if (t < 0.8) {
			const radius = 3 + (t / 0.8) * 9 * (0.6 + hash01(seed + i + 9) * 0.6);
			ctx.fillStyle = '#6b4226';
			ctx.beginPath();
			ctx.arc(x, r.top + 4, radius, Math.PI, 0);
			ctx.fill();
			ctx.fillStyle = 'rgba(255, 220, 180, 0.55)';
			ctx.beginPath();
			ctx.arc(x - radius * 0.35, r.top + 4 - radius * 0.45, radius * 0.25, 0, Math.PI * 2);
			ctx.fill();
		} else {
			// Pop: a small expanding ring.
			const q = (t - 0.8) / 0.2;
			ctx.strokeStyle = `rgba(110, 70, 40, ${1 - q})`;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.ellipse(x, r.top + 4, 6 + q * 12, 2 + q * 3, 0, 0, Math.PI * 2);
			ctx.stroke();
		}
	}
	ctx.restore();
}

/** Procedural spring pad, used when no trampoline texture exists. */
export function drawTrampoline(ctx: CanvasRenderingContext2D, r: Rect, horizontal: boolean, time: number) {
	ctx.save();
	ctx.translate(r.left + r.width / 2, r.top + r.height / 2);
	if (horizontal) ctx.rotate(Math.PI / 2);
	const w = horizontal ? r.height : r.width;
	const h = horizontal ? r.width : r.height;
	const squash = Math.sin(time * 8) * 2;
	ctx.fillStyle = '#39404d';
	ctx.fillRect(-w / 2, h / 2 - 14, w, 14);
	ctx.strokeStyle = '#b8c2cc';
	ctx.lineWidth = 4;
	ctx.beginPath();
	const springs = Math.max(2, Math.floor(w / 40));
	for (let i = 0; i < springs; i++) {
		const sx = -w / 2 + (i + 0.5) * (w / springs);
		for (let k = 0; k <= 6; k++) {
			const y = h / 2 - 14 - (k / 6) * (h - 30 + squash);
			const x = sx + (k % 2 === 0 ? -8 : 8);
			if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
		}
	}
	ctx.stroke();
	const pad = ctx.createLinearGradient(0, -h / 2, 0, -h / 2 + 18);
	pad.addColorStop(0, '#ff6b6b');
	pad.addColorStop(1, '#c62828');
	ctx.fillStyle = pad;
	ctx.beginPath();
	ctx.roundRect(-w / 2, -h / 2 + 4 - squash, w, 16, 8);
	ctx.fill();
	ctx.restore();
}

/** Checkered finish pole with a waving flag on top and a glowing line on the ground. */
export function drawFinishLine(ctx: CanvasRenderingContext2D, x: number, groundY: number, height: number, time: number) {
	const cell = 32;
	const poleW = 64;
	const top = groundY - height;

	// Ground glow.
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	const glow = ctx.createRadialGradient(x, groundY, 10, x, groundY, 260);
	glow.addColorStop(0, 'rgba(255, 255, 210, 0.45)');
	glow.addColorStop(1, 'rgba(255, 255, 210, 0)');
	ctx.fillStyle = glow;
	ctx.fillRect(x - 260, groundY - 260, 520, 520);
	ctx.restore();

	// Checkered column.
	for (let row = 0; row * cell < height; row++) {
		for (let col = 0; col < 2; col++) {
			ctx.fillStyle = (row + col) % 2 === 0 ? '#f7f7f7' : '#1d1d24';
			ctx.fillRect(x - poleW / 2 + col * cell, top + row * cell, cell, Math.min(cell, height - row * cell));
		}
	}
	// Cylindrical shading.
	const shade = ctx.createLinearGradient(x - poleW / 2, 0, x + poleW / 2, 0);
	shade.addColorStop(0, 'rgba(0,0,0,0.35)');
	shade.addColorStop(0.35, 'rgba(255,255,255,0.12)');
	shade.addColorStop(1, 'rgba(0,0,0,0.4)');
	ctx.fillStyle = shade;
	ctx.fillRect(x - poleW / 2, top, poleW, height);

	// Mast and waving flag.
	const mastTop = top - 220;
	ctx.fillStyle = '#c9ccd6';
	ctx.fillRect(x - 5, mastTop, 10, 222);
	ctx.fillStyle = '#ffd54f';
	ctx.beginPath();
	ctx.arc(x, mastTop, 11, 0, Math.PI * 2);
	ctx.fill();

	const flagW = 220;
	const flagH = 130;
	const cols = 8;
	const rows = 5;
	const cw = flagW / cols;
	const ch = flagH / rows;
	const wave = (u: number) => Math.sin(time * 5 - u * 4.5) * 12 * u;
	for (let c = 0; c < cols; c++) {
		for (let r = 0; r < rows; r++) {
			const u0 = c / cols;
			const u1 = (c + 1) / cols;
			const x0 = x + 5 + c * cw;
			const x1 = x0 + cw;
			const y0 = mastTop + 10 + r * ch;
			const light = 0.85 + 0.15 * Math.cos(time * 5 - (u0 + u1) * 2.25);
			const base = (c + r) % 2 === 0 ? 245 : 30;
			const v = Math.round(base * light);
			ctx.fillStyle = `rgb(${v},${v},${v + (base > 100 ? 0 : 8)})`;
			ctx.beginPath();
			ctx.moveTo(x0, y0 + wave(u0));
			ctx.lineTo(x1 + 0.6, y0 + wave(u1));
			ctx.lineTo(x1 + 0.6, y0 + ch + 0.6 + wave(u1));
			ctx.lineTo(x0, y0 + ch + 0.6 + wave(u0));
			ctx.closePath();
			ctx.fill();
		}
	}
}

/** Halo drawn under each item box. */
export function drawItemBoxHalo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number) {
	const radius = size * (0.95 + Math.sin(phase) * 0.08);
	const hue = (phase * 40) % 360;
	const glow = ctx.createRadialGradient(x, y, size * 0.2, x, y, radius);
	glow.addColorStop(0, `hsla(${hue}, 100%, 75%, 0.55)`);
	glow.addColorStop(1, `hsla(${hue}, 100%, 70%, 0)`);
	ctx.fillStyle = glow;
	ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** Procedural bomb sprite (no texture ships for it). */
export function drawBomb(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, rotation: number, time: number) {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(rotation);
	const r = size * 0.38;
	const body = ctx.createRadialGradient(-r * 0.35, -r * 0.2, r * 0.1, 0, r * 0.1, r * 1.1);
	body.addColorStop(0, '#6a6f80');
	body.addColorStop(0.4, '#2a2d38');
	body.addColorStop(1, '#0b0c10');
	ctx.fillStyle = body;
	ctx.beginPath();
	ctx.arc(0, r * 0.12, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = '#000';
	ctx.lineWidth = Math.max(2, size * 0.05);
	ctx.stroke();
	// Cap.
	ctx.fillStyle = '#3d4150';
	ctx.fillRect(-r * 0.32, -r * 0.98, r * 0.64, r * 0.32);
	// Fuse.
	ctx.strokeStyle = '#c8a46a';
	ctx.lineWidth = Math.max(2, size * 0.06);
	ctx.beginPath();
	ctx.moveTo(0, -r * 0.98);
	ctx.quadraticCurveTo(r * 0.3, -r * 1.5, r * 0.62, -r * 1.35);
	ctx.stroke();
	// Spark.
	const flicker = 0.75 + 0.25 * Math.sin(time * 40);
	ctx.globalCompositeOperation = 'lighter';
	const spark = ctx.createRadialGradient(r * 0.62, -r * 1.35, 0, r * 0.62, -r * 1.35, size * 0.28 * flicker);
	spark.addColorStop(0, 'rgba(255, 255, 220, 1)');
	spark.addColorStop(0.35, 'rgba(255, 190, 60, 0.9)');
	spark.addColorStop(1, 'rgba(255, 80, 0, 0)');
	ctx.fillStyle = spark;
	ctx.beginPath();
	ctx.arc(r * 0.62, -r * 1.35, size * 0.28 * flicker, 0, Math.PI * 2);
	ctx.fill();
	ctx.globalCompositeOperation = 'source-over';
	// Highlight.
	ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
	ctx.beginPath();
	ctx.ellipse(-r * 0.4, -r * 0.2, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

/* -------------------------------------------------------------------------- */
/* Players                                                                    */
/* -------------------------------------------------------------------------- */

/** Ground contact shadow; fades and shrinks with the height above the floor. */
export function drawGroundShadow(ctx: CanvasRenderingContext2D, x: number, floorY: number, distance: number, width: number) {
	const t = clamp01(1 - distance / 420);
	if (t <= 0) return;
	ctx.fillStyle = `rgba(0, 0, 0, ${0.32 * t})`;
	ctx.beginPath();
	ctx.ellipse(x, floorY, width * (0.35 + 0.25 * t), 7 * (0.5 + 0.5 * t), 0, 0, Math.PI * 2);
	ctx.fill();
}

/** Rainbow aura of the star power. */
export function drawStarAura(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	const hue = (time * 360) % 360;
	const radius = 70 + Math.sin(time * 14) * 6;
	const aura = ctx.createRadialGradient(x, y, 10, x, y, radius);
	aura.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.55)`);
	aura.addColorStop(0.6, `hsla(${(hue + 60) % 360}, 100%, 60%, 0.25)`);
	aura.addColorStop(1, `hsla(${(hue + 120) % 360}, 100%, 60%, 0)`);
	ctx.fillStyle = aura;
	ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
	ctx.restore();
}

/** Boost glow behind a player using a mushroom. */
export function drawBoostGlow(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, time: number) {
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	const cx = x - facing * 24;
	const radius = 58 + Math.sin(time * 30) * 5;
	const glow = ctx.createRadialGradient(cx, y, 4, cx, y, radius);
	glow.addColorStop(0, 'rgba(255, 220, 120, 0.6)');
	glow.addColorStop(1, 'rgba(255, 120, 20, 0)');
	ctx.fillStyle = glow;
	ctx.fillRect(cx - radius, y - radius, radius * 2, radius * 2);
	ctx.restore();
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, rotation: number) {
	ctx.beginPath();
	for (let i = 0; i < 10; i++) {
		const a = rotation + (i / 10) * Math.PI * 2 - Math.PI / 2;
		const r = i % 2 === 0 ? outer : inner;
		const px = x + Math.cos(a) * r;
		const py = y + Math.sin(a) * r;
		if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
	}
	ctx.closePath();
}

/** Little stars orbiting the head of a stunned player. */
export function drawDizzyStars(ctx: CanvasRenderingContext2D, x: number, headY: number, time: number) {
	ctx.save();
	for (let i = 0; i < 3; i++) {
		const a = time * 6 + (i / 3) * Math.PI * 2;
		const px = x + Math.cos(a) * 30;
		const py = headY - 10 + Math.sin(a) * 9;
		const front = Math.sin(a) > 0;
		ctx.globalAlpha = front ? 1 : 0.55;
		ctx.fillStyle = '#ffe14d';
		ctx.strokeStyle = '#8a5a00';
		ctx.lineWidth = 2;
		starPath(ctx, px, py, front ? 10 : 8, front ? 4.5 : 3.5, time * 4);
		ctx.fill();
		ctx.stroke();
	}
	ctx.restore();
}

/** Name tag above an opponent, or a bobbing arrow above the local player. */
export function drawNameTag(ctx: CanvasRenderingContext2D, x: number, headY: number, name: string, local: boolean, time: number) {
	ctx.save();
	if (local) {
		const bob = Math.sin(time * 5) * 4;
		const y = headY - 18 + bob;
		ctx.fillStyle = '#ffffff';
		ctx.strokeStyle = '#0d3b66';
		ctx.lineWidth = 4;
		ctx.lineJoin = 'round';
		ctx.beginPath();
		ctx.moveTo(x - 13, y - 16);
		ctx.lineTo(x + 13, y - 16);
		ctx.lineTo(x, y);
		ctx.closePath();
		ctx.stroke();
		ctx.fill();
		ctx.restore();
		return;
	}
	ctx.font = "bold 22px 'Arial Black', Arial, sans-serif";
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	let shown = name;
	while (shown.length > 3 && ctx.measureText(shown).width > 170) shown = shown.slice(0, -1);
	if (shown !== name) shown = shown.slice(0, -1) + '…';
	const w = ctx.measureText(shown).width + 20;
	const y = headY - 22;
	ctx.fillStyle = 'rgba(25, 10, 20, 0.62)';
	ctx.beginPath();
	ctx.roundRect(x - w / 2, y - 15, w, 30, 15);
	ctx.fill();
	ctx.fillStyle = '#d94b4b';
	ctx.beginPath();
	ctx.moveTo(x - 7, y + 15);
	ctx.lineTo(x + 7, y + 15);
	ctx.lineTo(x, y + 23);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = '#ffd6d6';
	ctx.fillText(shown, x, y + 1);
	ctx.restore();
}

/* -------------------------------------------------------------------------- */
/* Particles                                                                  */
/* -------------------------------------------------------------------------- */

export type ParticleKind = 'streak' | 'dust' | 'spark' | 'smoke' | 'star' | 'ring';

export interface Particle {
	kind: ParticleKind;
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	maxLife: number;
	size: number;
	color: string;
	gravity: number;
	drag: number;
	rotation: number;
	spin: number;
}

export class ParticleSystem {
	private particles: Particle[] = [];
	private static readonly MAX = 900;

	add(p: Partial<Particle> & { x: number; y: number; life: number; color: string; kind: ParticleKind }) {
		if (this.particles.length >= ParticleSystem.MAX) this.particles.shift();
		this.particles.push({
			vx: 0, vy: 0, size: 6, gravity: 0, drag: 0, rotation: 0, spin: 0,
			maxLife: p.life,
			...p,
		});
	}

	update(dt: number) {
		if (dt <= 0) return;
		for (const p of this.particles) {
			p.life -= dt;
			const damp = Math.max(0, 1 - p.drag * dt);
			p.vx *= damp;
			p.vy = p.vy * damp + p.gravity * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.rotation += p.spin * dt;
		}
		this.particles = this.particles.filter(p => p.life > 0);
	}

	/** Puff of dust at the feet of a player. */
	dust(x: number, y: number, count: number, spread: number, color = '#e9dcc0', dir = 0) {
		for (let i = 0; i < count; i++) {
			const life = 0.35 + Math.random() * 0.3;
			this.add({
				kind: 'dust', x: x + (Math.random() - 0.5) * spread, y: y - Math.random() * 6,
				vx: (Math.random() - 0.5) * 160 + dir * (60 + Math.random() * 120),
				vy: -30 - Math.random() * 90,
				life, size: 6 + Math.random() * 8, color, gravity: 120, drag: 3,
			});
		}
	}

	/** Bright sparks flying out of a point (hits, explosions, item pickups). */
	burst(x: number, y: number, count: number, speed: number, colors: string[], kind: ParticleKind = 'spark') {
		for (let i = 0; i < count; i++) {
			const a = Math.random() * Math.PI * 2;
			const v = speed * (0.35 + Math.random() * 0.65);
			const life = 0.35 + Math.random() * 0.45;
			this.add({
				kind, x, y,
				vx: Math.cos(a) * v, vy: Math.sin(a) * v,
				life, size: kind === 'star' ? 7 + Math.random() * 6 : 3 + Math.random() * 4,
				color: colors[Math.floor(Math.random() * colors.length)],
				gravity: kind === 'star' ? 40 : 700, drag: kind === 'star' ? 3.2 : 2.2,
				rotation: Math.random() * 6, spin: (Math.random() - 0.5) * 10,
			});
		}
	}

	smoke(x: number, y: number, count: number, radius: number) {
		for (let i = 0; i < count; i++) {
			const a = Math.random() * Math.PI * 2;
			const d = Math.random() * radius * 0.5;
			const life = 0.7 + Math.random() * 0.6;
			this.add({
				kind: 'smoke', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
				vx: Math.cos(a) * (40 + Math.random() * 80), vy: -40 - Math.random() * 80,
				life, size: 26 + Math.random() * 26, color: '#4a4550', drag: 1.5, gravity: -30,
			});
		}
	}

	ring(x: number, y: number, size: number, color: string, life = 0.45) {
		this.add({ kind: 'ring', x, y, life, size, color });
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.save();
		// Opaque particles first, additive ones last.
		for (const p of this.particles) {
			const t = clamp01(p.life / p.maxLife);
			if (p.kind === 'dust') {
				ctx.globalAlpha = t * 0.75;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size * (1.4 - t * 0.6), 0, Math.PI * 2);
				ctx.fill();
			} else if (p.kind === 'smoke') {
				ctx.globalAlpha = t * 0.5;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size * (1.8 - t), 0, Math.PI * 2);
				ctx.fill();
			} else if (p.kind === 'ring') {
				ctx.globalAlpha = t;
				ctx.strokeStyle = p.color;
				ctx.lineWidth = 3 + 5 * t;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size * (1.15 - t * 0.85), 0, Math.PI * 2);
				ctx.stroke();
			}
		}
		ctx.globalCompositeOperation = 'lighter';
		for (const p of this.particles) {
			const t = clamp01(p.life / p.maxLife);
			if (p.kind === 'streak') {
				ctx.globalAlpha = t;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.ellipse(p.x, p.y, p.size * 1.8, p.size * 0.65, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
				ctx.fill();
			} else if (p.kind === 'spark') {
				ctx.globalAlpha = t;
				ctx.strokeStyle = p.color;
				ctx.lineWidth = p.size;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo(p.x, p.y);
				ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
				ctx.stroke();
			} else if (p.kind === 'star') {
				ctx.globalAlpha = t;
				ctx.fillStyle = p.color;
				starPath(ctx, p.x, p.y, p.size, p.size * 0.45, p.rotation);
				ctx.fill();
			}
		}
		ctx.restore();
	}
}

/* -------------------------------------------------------------------------- */
/* HUD                                                                        */
/* -------------------------------------------------------------------------- */

function formatTime(seconds: number) {
	const s = Math.max(0, seconds);
	const minutes = Math.floor(s / 60);
	const rest = s - minutes * 60;
	return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/** Glassy rounded panel used by HUD widgets. */
export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 18) {
	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
	ctx.shadowBlur = 16;
	ctx.shadowOffsetY = 6;
	const bg = ctx.createLinearGradient(0, y, 0, y + h);
	bg.addColorStop(0, 'rgba(22, 34, 62, 0.82)');
	bg.addColorStop(1, 'rgba(10, 16, 32, 0.82)');
	ctx.fillStyle = bg;
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, radius);
	ctx.fill();
	ctx.restore();
	ctx.save();
	ctx.strokeStyle = 'rgba(160, 200, 255, 0.35)';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.roundRect(x + 1, y + 1, w - 2, h - 2, radius - 1);
	ctx.stroke();
	ctx.restore();
}

/** Lap counter and race timer (top-left). */
export function drawLapPanel(ctx: CanvasRenderingContext2D, lap: number, lapCount: number, finished: boolean, raceTime: number, pulse: number) {
	const x = 24;
	const y = 22;
	const w = 300;
	const h = 140;
	drawPanel(ctx, x, y, w, h);
	ctx.save();
	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'left';
	ctx.fillStyle = '#9fc3ff';
	ctx.font = "bold 26px 'Arial Black', Arial, sans-serif";
	ctx.fillText(finished ? 'RACE' : 'LAP', x + 24, y + 42);

	const scale = 1 + pulse * 0.25;
	ctx.save();
	ctx.translate(x + 24, y + 104);
	ctx.scale(scale, scale);
	ctx.font = "900 64px 'Arial Black', Impact, sans-serif";
	ctx.lineWidth = 8;
	ctx.lineJoin = 'round';
	ctx.strokeStyle = '#06101f';
	const big = finished ? 'DONE' : `${lap}`;
	ctx.strokeText(big, 0, 0);
	const grad = ctx.createLinearGradient(0, -56, 0, 0);
	grad.addColorStop(0, '#ffffff');
	grad.addColorStop(1, lap === lapCount && !finished ? '#ffcf4d' : '#9fd0ff');
	ctx.fillStyle = grad;
	ctx.fillText(big, 0, 0);
	if (!finished) {
		const bw = ctx.measureText(big).width;
		ctx.font = "bold 34px 'Arial Black', Arial, sans-serif";
		ctx.lineWidth = 6;
		ctx.strokeText(`/${lapCount}`, bw + 6, 0);
		ctx.fillStyle = '#c9dcff';
		ctx.fillText(`/${lapCount}`, bw + 6, 0);
	}
	ctx.restore();

	// Lap pips.
	for (let i = 0; i < lapCount; i++) {
		const px = x + w - 30 - (lapCount - 1 - i) * 26;
		const py = y + 32;
		const done = finished || i < lap - 1;
		const current = !finished && i === lap - 1;
		ctx.beginPath();
		ctx.arc(px, py, 9, 0, Math.PI * 2);
		ctx.fillStyle = done ? '#4caf50' : current ? '#ffcf4d' : 'rgba(255,255,255,0.18)';
		ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.5)';
		ctx.lineWidth = 2;
		ctx.stroke();
	}

	// Timer.
	ctx.textAlign = 'right';
	ctx.font = "bold 28px 'Courier New', monospace";
	ctx.fillStyle = '#e6f0ff';
	ctx.fillText(formatTime(raceTime), x + w - 20, y + 104);
	ctx.restore();
}

export interface ProgressEntry { progress: number; local: boolean; finished: boolean }

/** Whole-race progress bar (top-center) with one marker per player. */
export function drawProgressBar(ctx: CanvasRenderingContext2D, screenWidth: number, laps: number, entries: ProgressEntry[], time: number) {
	const w = 980;
	const h = 18;
	const x = (screenWidth - w) / 2;
	const y = 46;
	drawPanel(ctx, x - 26, y - 22, w + 52, h + 44, 22);

	ctx.save();
	ctx.fillStyle = 'rgba(255,255,255,0.12)';
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, h / 2);
	ctx.fill();

	const local = entries.find(e => e.local);
	if (local) {
		const fill = ctx.createLinearGradient(x, 0, x + w, 0);
		fill.addColorStop(0, '#2b8cff');
		fill.addColorStop(1, '#5ef0ff');
		ctx.fillStyle = fill;
		ctx.beginPath();
		ctx.roundRect(x, y, Math.max(h, w * clamp01(local.progress)), h, h / 2);
		ctx.fill();
	}

	// Lap separators.
	ctx.fillStyle = 'rgba(255,255,255,0.55)';
	for (let i = 1; i < laps; i++) ctx.fillRect(x + (w * i) / laps - 1.5, y - 5, 3, h + 10);

	// Chequered finish block.
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 2; c++) {
			ctx.fillStyle = (r + c) % 2 === 0 ? '#fff' : '#111';
			ctx.fillRect(x + w + 4 + c * 8, y - 3 + r * 8, 8, 8);
		}
	}

	// Opponents first, local player on top.
	const sorted = [...entries].sort((a, b) => Number(a.local) - Number(b.local));
	for (const e of sorted) {
		const px = x + w * clamp01(e.progress);
		const py = y + h / 2;
		if (e.local) {
			const r = 15 + Math.sin(time * 6) * 1.5;
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = '#0d3b66';
			ctx.lineWidth = 4;
			ctx.beginPath();
			ctx.arc(px, py, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = '#2b8cff';
			ctx.beginPath();
			ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
			ctx.fill();
		} else {
			ctx.fillStyle = e.finished ? '#ffd54f' : '#e04848';
			ctx.strokeStyle = '#2a0a0a';
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(px, py, 10, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
	}
	ctx.restore();
}

/** Large centered announcement ("LAP 2", "FINAL LAP!", "FINISH!"). */
export function drawBanner(ctx: CanvasRenderingContext2D, width: number, height: number, text: string, sub: string | null, age: number, duration: number, colors: [string, string]) {
	if (age < 0 || age > duration) return;
	const t = age / duration;
	const appear = clamp01(age / 0.18);
	const fade = clamp01((duration - age) / 0.35);
	const scale = appear < 1 ? 0.4 + 0.75 * (1 - Math.pow(1 - appear, 3)) : 1.15 - Math.min(0.15, (age - 0.18) * 0.6);
	const slide = (1 - fade) * -80;
	ctx.save();
	ctx.globalAlpha = Math.min(appear, fade);
	ctx.translate(width / 2, height * 0.36 + slide);
	ctx.scale(scale, scale);
	ctx.rotate(-0.04 + 0.02 * Math.sin(t * Math.PI));
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = "900 150px 'Arial Black', Impact, sans-serif";
	ctx.lineJoin = 'round';
	ctx.shadowColor = 'rgba(0,0,0,0.6)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 10;
	ctx.lineWidth = 22;
	ctx.strokeStyle = '#120a1e';
	ctx.strokeText(text, 0, 0);
	ctx.shadowColor = 'transparent';
	const grad = ctx.createLinearGradient(0, -70, 0, 70);
	grad.addColorStop(0, colors[0]);
	grad.addColorStop(1, colors[1]);
	ctx.fillStyle = grad;
	ctx.fillText(text, 0, 0);
	ctx.fillStyle = 'rgba(255,255,255,0.35)';
	ctx.save();
	ctx.beginPath();
	ctx.rect(-1200, -75, 2400, 55);
	ctx.clip();
	ctx.fillText(text, 0, 0);
	ctx.restore();
	if (sub) {
		ctx.font = "bold 54px 'Arial Black', Arial, sans-serif";
		ctx.lineWidth = 10;
		ctx.strokeText(sub, 0, 115);
		ctx.fillStyle = '#ffffff';
		ctx.fillText(sub, 0, 115);
	}
	ctx.restore();
}

/** Speed lines along the screen edges while boosting. */
export function drawSpeedLines(ctx: CanvasRenderingContext2D, width: number, height: number, strength: number, facing: number, time: number) {
	if (strength <= 0) return;
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	ctx.lineCap = 'round';
	for (let i = 0; i < 26; i++) {
		const seed = i * 13 + Math.floor(time * 18) * 101;
		const y = hash01(seed) * height;
		const centerDist = Math.abs(y - height / 2) / (height / 2);
		if (centerDist < 0.35) continue;
		const len = 180 + hash01(seed + 1) * 360;
		const x = hash01(seed + 2) * width;
		ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 * strength * centerDist})`;
		ctx.lineWidth = 3 + hash01(seed + 3) * 4;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x - facing * len, y);
		ctx.stroke();
	}
	ctx.restore();
}

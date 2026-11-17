import { BOX_HEIGHT, BOX_SIZE } from "./constants";

/* -------------------------------------------------------------------------- */
/* The (unique) Hunt map. Predefined, so it is never sent over the network.   */
/* -------------------------------------------------------------------------- */

export type ObstacleKind = 'wall' | 'pillar' | 'platform' | 'crate' | 'cover';

/**
 * A static obstacle: an axis-aligned rectangle on the ground plane,
 * extruded vertically from `base` to `top`.
 * Players can stand on it (if they manage to get above `top`) and bullets
 * flying between `base` and `top` hit it.
 */
export interface ObstacleDef {
	kind: ObstacleKind;
	cx: number;
	cy: number;
	w: number;
	h: number;
	base: number;
	top: number;
}

/** A slot where a breakable box (re)spawns. */
export interface BoxSlotDef {
	cx: number;
	cy: number;
	base: number;
}

export interface SpawnDef {
	x: number;
	y: number;
}

export interface LevelDef {
	name: string;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	obstacles: ObstacleDef[];
	boxes: BoxSlotDef[];
	spawns: SpawnDef[];
}

/* ---------------------------- Helpers ---------------------------- */

const BORDER = 80;
const BORDER_TOP = 260;
const HALF_W = 1800;
const HALF_H = 1200;

/** Build an obstacle from its center and size. */
function rect(kind: ObstacleKind, cx: number, cy: number, w: number, h: number, top: number, base = 0): ObstacleDef {
	return { kind, cx, cy, w, h, base, top };
}

/** Mirror a list of obstacles on both axes (the map is symmetric). */
function mirror4(make: (sx: number, sy: number) => ObstacleDef): ObstacleDef[] {
	return [make(1, 1), make(-1, 1), make(1, -1), make(-1, -1)];
}

/** Mirror a list of obstacles on the X axis only. */
function mirrorX(make: (sx: number) => ObstacleDef): ObstacleDef[] {
	return [make(1), make(-1)];
}

/** Mirror a list of obstacles on the Y axis only. */
function mirrorY(make: (sy: number) => ObstacleDef): ObstacleDef[] {
	return [make(1), make(-1)];
}

/* ---------------------------- The map ---------------------------- */

export const LEVEL: LevelDef = {
	name: "Canyon",
	minX: -HALF_W,
	maxX: HALF_W,
	minY: -HALF_H,
	maxY: HALF_H,

	obstacles: [
		// Borders (too high to jump over)
		rect('wall', 0, -HALF_H + BORDER / 2, HALF_W * 2, BORDER, BORDER_TOP),
		rect('wall', 0, HALF_H - BORDER / 2, HALF_W * 2, BORDER, BORDER_TOP),
		rect('wall', -HALF_W + BORDER / 2, 0, BORDER, HALF_H * 2 - BORDER * 2, BORDER_TOP),
		rect('wall', HALF_W - BORDER / 2, 0, BORDER, HALF_H * 2 - BORDER * 2, BORDER_TOP),

		// Central raised platform, reachable with a crate used as a step
		rect('platform', 0, 0, 500, 500, 110),
		...mirrorX(sx => rect('crate', sx * 290, -60, 80, 80, 55)),
		...mirrorY(sy => rect('crate', 60, sy * 290, 80, 80, 55)),

		// Tall pillars around the center
		...mirror4((sx, sy) => rect('pillar', sx * 700, sy * 500, 120, 120, 300)),

		// Low covers (bullets fired from the ground hit them, you can jump on them)
		...mirrorX(sx => rect('cover', sx * 1100, 0, 40, 320, 60)),
		...mirrorY(sy => rect('cover', 0, sy * 800, 320, 40, 60)),
		...mirror4((sx, sy) => rect('cover', sx * 1300, sy * 800, 220, 40, 60)),
		...mirror4((sx, sy) => rect('cover', sx * 1410, sy * 690, 40, 180, 60)),

		// Scattered crates
		...mirror4((sx, sy) => rect('crate', sx * 450, sy * 900, 90, 90, 55)),
		...mirror4((sx, sy) => rect('crate', sx * 1400, sy * 250, 90, 90, 55)),

		// Raised ledges along the top and bottom borders, with a crate step on each side
		...mirrorY(sy => rect('platform', 0, sy * 1035, 600, 170, 100)),
		...mirror4((sx, sy) => rect('crate', sx * 345, sy * 1060, 90, 90, 50)),
	],

	boxes: [
		{ cx: 0, cy: 0, base: 110 }, // on top of the central platform
		{ cx: 600, cy: 0, base: 0 },
		{ cx: -600, cy: 0, base: 0 },
		{ cx: 0, cy: 550, base: 0 },
		{ cx: 0, cy: -550, base: 0 },
		{ cx: 1000, cy: 700, base: 0 },
		{ cx: -1000, cy: 700, base: 0 },
		{ cx: 1000, cy: -700, base: 0 },
		{ cx: -1000, cy: -700, base: 0 },
		{ cx: 1500, cy: 1000, base: 0 },
		{ cx: -1500, cy: 1000, base: 0 },
		{ cx: 1500, cy: -1000, base: 0 },
		{ cx: -1500, cy: -1000, base: 0 },
		{ cx: 0, cy: 1035, base: 100 }, // on the ledges
		{ cx: 0, cy: -1035, base: 100 },
	],

	spawns: [
		{ x: 1600, y: 600 },
		{ x: -1600, y: -600 },
		{ x: -1600, y: 600 },
		{ x: 1600, y: -600 },
		{ x: 800, y: 1000 },
		{ x: -800, y: -1000 },
		{ x: -800, y: 1000 },
		{ x: 800, y: -1000 },
	],
};

/** Obstacle-like description of a box slot (used for physics and drawing). */
export function boxObstacle(slot: BoxSlotDef): ObstacleDef {
	return {
		kind: 'crate',
		cx: slot.cx,
		cy: slot.cy,
		w: BOX_SIZE,
		h: BOX_SIZE,
		base: slot.base,
		top: slot.base + BOX_HEIGHT,
	};
}

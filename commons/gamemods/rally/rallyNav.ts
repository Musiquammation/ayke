/* Navigation helpers shared by the Rally bot and the headless level checker. */

const GRID = 64;
const CELL = 32;
const GRAVITY = 1800;
const JUMP_HEIGHT = 820 * 820 / (2 * GRAVITY);

export interface NavPlatform {
	x: number; // center, world px
	y: number;
	w: number;
	h: number;
	skin?: string;
	trampoline?: number;
	mud?: number;
	move?: { ax: number; ay: number; period: number; phase: number };
}

export interface NavLevel {
	finishX: number;
	deathY: number;
	platforms: NavPlatform[];
	checkpoints: { x: number; y: number; w?: number; h?: number }[];
}

/**
 * Gravity-aware geodesic distance (in world pixels) from any point of the level
 * to a checkpoint rectangle. Moving left/right/down is always allowed; moving up
 * only where a jump, a wall jump, a wall-jump shaft, a trampoline or a moving
 * platform can lift the player. Used by the Rally bot and the level checker.
 */
export function distanceField(level: NavLevel, target: { x: number; y: number; w?: number; h?: number }): (x: number, y: number) => number {
	const tw = target.w ?? GRID, th = target.h ?? GRID;
	const minX = -4 * GRID, maxX = level.finishX + 4 * GRID;
	const tops = level.platforms.map((p) => p.y - p.h / 2);
	const minY = Math.min(...tops, ...level.checkpoints.map((c) => c.y)) - 12 * GRID, maxY = level.deathY;
	const W = Math.ceil((maxX - minX) / CELL), H = Math.ceil((maxY - minY) / CELL);
	const solid = new Uint8Array(W * H);
	for (const p of level.platforms) {
		if (p.move) continue;
		const l = Math.floor((p.x - p.w / 2 - minX) / CELL), r = Math.ceil((p.x + p.w / 2 - minX) / CELL);
		const t = Math.floor((p.y - p.h / 2 - minY) / CELL), b = Math.ceil((p.y + p.h / 2 - minY) / CELL);
		for (let x = Math.max(0, l); x < Math.min(W, r); x++)
			for (let y = Math.max(0, t); y < Math.min(H, b); y++) solid[y * W + x] = 1;
	}
	const isSolid = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || solid[y * W + x] === 1;
	// Height (in cells) above the nearest floor, and whether a wall-jump shaft surrounds the cell.
	const JUMP_CELLS = 6, WALLJUMP_CELLS = 5, SHAFT_CELLS = 15;
	const canRise = new Uint8Array(W * H);
	for (let x = 0; x < W; x++) {
		let floorY = -1;
		let wallSupportY = -1; // highest wall contact still within a jump from the floor
		for (let y = H - 1; y >= 0; y--) {
			if (isSolid(x, y)) { floorY = y; wallSupportY = -1; continue; }
			const h = floorY >= 0 ? floorY - y : 1e9;
			let up = h <= JUMP_CELLS;
			// Running jump off a nearby ledge.
			for (const dx of [-1, 1]) for (let k = 1; k <= JUMP_CELLS && !up; k++) if (isSolid(x + dx, y + k) && !isSolid(x + dx, y + k - 1)) up = true;
			// One wall jump off a wall reached by a normal jump.
			if (h <= JUMP_CELLS && (isSolid(x - 1, y) || isSolid(x + 1, y))) wallSupportY = y;
			if (!up && wallSupportY >= 0 && wallSupportY - y <= WALLJUMP_CELLS) up = true;
			if (!up) {
				let l = x, r = x;
				while (!isSolid(l - 1, y) && x - l < SHAFT_CELLS) l--;
				while (!isSolid(r + 1, y) && r - x < SHAFT_CELLS) r++;
				up = isSolid(l - 1, y) && isSolid(r + 1, y) && r - l + 1 <= SHAFT_CELLS;
			}
			canRise[y * W + x] = up ? 1 : 0;
		}
	}
	// Trampolines and moving platforms lift the player above their reach.
	for (const p of level.platforms) {
		const vertical = (p.trampoline ?? -1) >= 0 && p.skin !== 'horizontal-trampoline';
		if (!vertical && !p.move) continue;
		const lift = vertical ? (p.trampoline! ** 2) / (2 * GRAVITY) : Math.abs(p.move!.ay) * 2 + JUMP_HEIGHT;
		const ax = p.move ? Math.abs(p.move.ax) : 0, ay = p.move ? Math.abs(p.move.ay) : 0;
		const l = Math.floor((p.x - p.w / 2 - ax - GRID - minX) / CELL), r = Math.ceil((p.x + p.w / 2 + ax + GRID - minX) / CELL);
		const b = Math.ceil((p.y - p.h / 2 + ay - minY) / CELL), t = Math.floor((p.y - p.h / 2 - ay - lift - minY) / CELL);
		for (let x = Math.max(0, l); x < Math.min(W, r); x++)
			for (let y = Math.max(0, t); y < Math.min(H, b); y++) canRise[y * W + x] = 1;
	}
	const dist = new Float64Array(W * H).fill(1e9);
	const queue: number[] = [];
	for (let x = Math.floor((target.x - minX) / CELL); x < Math.ceil((target.x + tw - minX) / CELL); x++)
		for (let y = Math.floor((target.y - minY) / CELL); y < Math.ceil((target.y + th - minY) / CELL); y++)
			if (x >= 0 && y >= 0 && x < W && y < H && !solid[y * W + x]) { dist[y * W + x] = 0; queue.push(y * W + x); }
	// Reverse BFS: n -> c is a legal move unless it goes up from a cell where rising is impossible.
	for (let q = 0; q < queue.length; q++) {
		const c = queue[q], x = c % W, y = (c - x) / W;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + dx, ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
			const n = ny * W + nx;
			if (solid[n] || dist[n] <= dist[c] + 1) continue;
			if (dy === 1 && !canRise[n]) continue; // c is above n
			dist[n] = dist[c] + 1;
			queue.push(n);
		}
	}
	return (px: number, py: number) => {
		const x = Math.floor((px - minX) / CELL), y = Math.floor((py - minY) / CELL);
		if (x < 0 || y < 0 || x >= W || y >= H) return 1e6;
		// The player's center may sit in a cell the field marks solid by rounding: look around.
		let best = dist[y * W + x];
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + dx, ny = y + dy;
			if (nx >= 0 && ny >= 0 && nx < W && ny < H) best = Math.min(best, dist[ny * W + nx] + 1);
		}
		return best * CELL;
	};
}

const cache = new WeakMap<object, ((x: number, y: number) => number)[]>();

/** One distance field per checkpoint, built once per level definition. */
export function checkpointFields(level: NavLevel): ((x: number, y: number) => number)[] {
	let fields = cache.get(level);
	if (!fields) {
		fields = level.checkpoints.map(cp => distanceField(level, cp));
		cache.set(level, fields);
	}
	return fields;
}

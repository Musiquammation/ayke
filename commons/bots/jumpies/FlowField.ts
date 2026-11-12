import { PLAYER_SIZE } from "../../gamemods/jumpies/constants";
import { BlockDef, LevelDef, RoomDef } from "../../gamemods/jumpies/defs";

/*
 * Global navigation of the Jumpies bots.
 *
 * Jumpies has no platform: the only solid things are the borders of the rooms
 * that lead nowhere, and they kill. The level is therefore a free space (the
 * union of the rooms) crossed by hazards. This file discretizes this space in
 * a grid and runs a Dijkstra from a goal (the finish block, or the heal blocks),
 * which gives, for every point of the level, an estimate of the "effort" left
 * to reach the goal.
 *
 * The effort is not a plain distance:
 * - going up costs more than going sideways, which costs more than falling,
 *   because climbing burns jumps while gravity is free;
 * - static lava is a wall, static damaging blocks are expensive but crossable
 *   (some levels force the player to take a hit);
 * - the cells touching a deadly border are a bit more expensive, so that the
 *   path stays away from the borders when it can.
 *
 * Moving blocks are ignored here: the local planner simulates them.
 * The field only depends on the level, so it is computed once and shared by
 * every bot of every game playing this level.
 */

const CELL = 40;

// Cost multipliers of a move, depending on its vertical direction.
const SIDE_COST = 1;
const UP_COST = 1.8;
const DOWN_COST = 0.75;

// Extra cost of entering a cell, by kind of danger.
const HP_COST = 1500; // effort equivalent of one hit point
const CROSS_SPEED = 900; // assumed speed when crossing a damaging area, to turn a damage rate into a damage
const BORDER_COSTS = [120, 50]; // first and second cell from a deadly border

// Margin added around hazards, in addition to the half size of the player.
const HAZARD_MARGIN = 6;

// Value given to points out of the grid or unable to reach the goal.
export const UNREACHABLE = 1e5;

/** Tells whether a block is a goal of a field, from its id and definition. */
type GoalFilter = (id: number, def: BlockDef) => boolean;

/** Movements of the blocks: a block having one of them is not static. */
const MOVING_MODULES = ['speed', 'acceleration', 'chase', 'loop', 'rotation', 'positionLimiter'] as const;

/** Neighbors used by the Dijkstra (8-connectivity). */
const NEIGHBORS = [
	[1, 0], [-1, 0], [0, 1], [0, -1],
	[1, 1], [1, -1], [-1, 1], [-1, -1]
] as const;


/** A minimal binary heap of cell indices, ordered by a priority array. */
class CellHeap {
	private readonly items: number[] = [];

	constructor(private readonly priorities: Float64Array) {}

	get size() {
		return this.items.length;
	}

	push(cell: number) {
		const items = this.items;
		items.push(cell);
		let i = items.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (this.priorities[items[parent]] <= this.priorities[items[i]])
				break;

			[items[parent], items[i]] = [items[i], items[parent]];
			i = parent;
		}
	}

	pop(): number {
		const items = this.items;
		const top = items[0];
		const last = items.pop()!;
		if (items.length === 0)
			return top;

		items[0] = last;
		let i = 0;
		for (;;) {
			const left = i * 2 + 1;
			const right = left + 1;
			let smallest = i;
			if (left < items.length && this.priorities[items[left]] < this.priorities[items[smallest]])
				smallest = left;
			if (right < items.length && this.priorities[items[right]] < this.priorities[items[smallest]])
				smallest = right;
			if (smallest === i)
				break;

			[items[smallest], items[i]] = [items[i], items[smallest]];
			i = smallest;
		}

		return top;
	}
}


/** Tells whether a block never moves, so that the static field can take it into account. */
function isStatic(def: BlockDef) {
	return MOVING_MODULES.every(name => def.modules[name] === undefined) && (def.active ?? true);
}


export class FlowField {
	readonly minX: number;
	readonly minY: number;
	readonly cols: number;
	readonly rows: number;

	/** 1 when the center of the cell is inside a room. */
	private readonly inside: Uint8Array;
	/** Extra cost of entering the cell. Infinity for walls (lava, outside). */
	private readonly enterCost: Float64Array;
	/** Effort left to reach the finish block from the cell. */
	private readonly distance: Float64Array;
	/** Free height below the cell before leaving the rooms (and dying). */
	private readonly freeBelow: Float64Array;

	constructor(level: LevelDef, private readonly isGoal: GoalFilter) {
		const rooms = level.rooms;
		this.minX = Math.min(...rooms.map(r => r.x));
		this.minY = Math.min(...rooms.map(r => r.y));
		const maxX = Math.max(...rooms.map(r => r.x + r.w));
		const maxY = Math.max(...rooms.map(r => r.y + r.h));
		this.cols = Math.ceil((maxX - this.minX) / CELL);
		this.rows = Math.ceil((maxY - this.minY) / CELL);

		const size = this.cols * this.rows;
		this.inside = new Uint8Array(size);
		this.enterCost = new Float64Array(size);
		this.distance = new Float64Array(size).fill(Infinity);
		this.freeBelow = new Float64Array(size);

		this.markRooms(rooms);
		this.markBorders();
		this.markHazards(rooms);
		this.computeFreeBelow();
		this.runDijkstra(rooms);
	}

	/* ------------------------------ Grid helpers ------------------------------ */

	private index(col: number, row: number) {
		return row * this.cols + col;
	}

	private isValid(col: number, row: number) {
		return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
	}

	private centerY(row: number) {
		return this.minY + (row + 0.5) * CELL;
	}

	/** Calls a callback on every cell whose center is in a rectangle given by its center. */
	private forCellsIn(x: number, y: number, w: number, h: number, callback: (cell: number) => void) {
		const col0 = Math.max(0, Math.ceil((x - w / 2 - this.minX) / CELL - 0.5));
		const col1 = Math.min(this.cols - 1, Math.floor((x + w / 2 - this.minX) / CELL - 0.5));
		const row0 = Math.max(0, Math.ceil((y - h / 2 - this.minY) / CELL - 0.5));
		const row1 = Math.min(this.rows - 1, Math.floor((y + h / 2 - this.minY) / CELL - 0.5));

		for (let row = row0; row <= row1; row++) {
			for (let col = col0; col <= col1; col++) {
				callback(this.index(col, row));
			}
		}
	}

	/* ------------------------------ Construction ------------------------------ */

	/** Marks the cells inside a room. The others are walls. */
	private markRooms(rooms: RoomDef[]) {
		this.enterCost.fill(Infinity);
		for (const room of rooms) {
			this.forCellsIn(room.x + room.w / 2, room.y + room.h / 2, room.w, room.h, cell => {
				this.inside[cell] = 1;
				this.enterCost[cell] = 0;
			});
		}
	}

	/** Makes the cells close to a deadly border more expensive. */
	private markBorders() {
		const extra = new Float64Array(this.enterCost.length);
		for (let row = 0; row < this.rows; row++) {
			for (let col = 0; col < this.cols; col++) {
				if (!this.inside[this.index(col, row)])
					continue;

				// Distance (in cells) to the nearest cell outside the rooms.
				for (const [ring, cost] of BORDER_COSTS.entries()) {
					if (this.hasOutsideAround(col, row, ring + 1)) {
						extra[this.index(col, row)] = cost;
						break;
					}
				}
			}
		}

		for (let i = 0; i < extra.length; i++) {
			this.enterCost[i] += extra[i];
		}
	}

	/** Tells whether a cell at a given distance (chebyshev) is outside the rooms. */
	private hasOutsideAround(col: number, row: number, radius: number) {
		for (let dy = -radius; dy <= radius; dy++) {
			for (let dx = -radius; dx <= radius; dx++) {
				const c = col + dx;
				const r = row + dy;
				if (!this.isValid(c, r) || !this.inside[this.index(c, r)])
					return true;
			}
		}

		return false;
	}

	/** Turns the static hazards into walls (lava) or into expensive areas (damages). */
	private markHazards(rooms: RoomDef[]) {
		const margin = PLAYER_SIZE + HAZARD_MARGIN * 2;
		for (const room of rooms) {
			for (const def of Object.values(room.blocks)) {
				if (!isStatic(def))
					continue;

				const cost = this.getHazardCost(def);
				if (cost === 0)
					continue;

				this.forCellsIn(def.x, def.y, def.w + margin, def.h + margin, cell => {
					this.enterCost[cell] += cost;
				});
			}
		}
	}

	/** Extra cost of a cell covered by a static block. */
	private getHazardCost(def: BlockDef) {
		const m = def.modules;
		if (m.lava)
			return Infinity;

		let cost = 0;
		if (m.repeatedAttack) {
			// One hit for the whole crossing: spread it over a few cells.
			cost += m.repeatedAttack.damages * HP_COST / 3;
		}

		if (m.continousAttack) {
			cost += m.continousAttack.damagesPerSecond * CELL / CROSS_SPEED * HP_COST;
		}

		return cost;
	}

	/** Measures, for every cell, the free height below it, down to the outside of the rooms. */
	private computeFreeBelow() {
		for (let col = 0; col < this.cols; col++) {
			let free = 0;
			for (let row = this.rows - 1; row >= 0; row--) {
				const cell = this.index(col, row);
				free = this.inside[cell] ? free + CELL : 0;
				this.freeBelow[cell] = free;
			}
		}
	}

	/** Cost of a move between two neighbor cells (dy < 0 goes up). */
	private moveCost(dx: number, dy: number) {
		const vertical = dy < 0 ? UP_COST : DOWN_COST;
		return CELL * Math.hypot(dx * SIDE_COST, dy * vertical);
	}

	/**
	 * Runs a Dijkstra backward from the cells of the goal blocks.
	 * The distance of a cell is the cost of the best path going from this cell
	 * to the end, so the edges are walked in reverse.
	 */
	private runDijkstra(rooms: RoomDef[]) {
		const heap = new CellHeap(this.distance);
		for (const room of rooms) {
			for (const [id, def] of Object.entries(room.blocks)) {
				if (!this.isGoal(Number(id), def))
					continue;

				this.forCellsIn(def.x, def.y, def.w + PLAYER_SIZE, def.h + PLAYER_SIZE, cell => {
					if (!this.inside[cell])
						return;
					this.distance[cell] = 0;
					heap.push(cell);
				});
			}
		}

		const done = new Uint8Array(this.distance.length);
		while (heap.size > 0) {
			const cell = heap.pop();
			if (done[cell])
				continue;
			done[cell] = 1;

			const col = cell % this.cols;
			const row = Math.floor(cell / this.cols);
			for (const [dx, dy] of NEIGHBORS) {
				this.relax(col, row, dx, dy, heap);
			}
		}
	}

	/**
	 * Tries to improve the neighbor (col + dx, row + dy) of a finished cell:
	 * the player would go from the neighbor to the cell.
	 */
	private relax(col: number, row: number, dx: number, dy: number, heap: CellHeap) {
		const fromCol = col + dx;
		const fromRow = row + dy;
		if (!this.isValid(fromCol, fromRow))
			return;

		const from = this.index(fromCol, fromRow);
		const to = this.index(col, row);
		if (this.enterCost[from] === Infinity)
			return;

		// A diagonal move must not cut the corner of a wall.
		if (dx !== 0 && dy !== 0) {
			const sideA = this.enterCost[this.index(fromCol, row)];
			const sideB = this.enterCost[this.index(col, fromRow)];
			if (sideA === Infinity || sideB === Infinity)
				return;
		}

		// The player moves by (-dx, -dy) to go from the neighbor to the cell.
		const candidate = this.distance[to] + this.moveCost(-dx, -dy) + this.enterCost[to];
		if (candidate < this.distance[from]) {
			this.distance[from] = candidate;
			heap.push(from);
		}
	}

	/* --------------------------------- Queries -------------------------------- */

	/** Value of a cell, or null if the end cannot be reached from it. */
	private cellDistance(col: number, row: number) {
		if (!this.isValid(col, row))
			return null;

		const value = this.distance[this.index(col, row)];
		return value === Infinity ? null : value;
	}

	/**
	 * Effort left to reach the end from a point. The values of the four nearest
	 * cells are interpolated, so that the planner sees progress inside a cell.
	 * Cells without value (walls) are replaced by the worst valid neighbor.
	 */
	distanceAt(x: number, y: number) {
		const fx = (x - this.minX) / CELL - 0.5;
		const fy = (y - this.minY) / CELL - 0.5;
		const col = Math.floor(fx);
		const row = Math.floor(fy);
		const tx = fx - col;
		const ty = fy - row;

		const values = [
			this.cellDistance(col, row),
			this.cellDistance(col + 1, row),
			this.cellDistance(col, row + 1),
			this.cellDistance(col + 1, row + 1)
		];

		const valid = values.filter((v): v is number => v !== null);
		if (valid.length === 0)
			return UNREACHABLE;

		const worst = Math.max(...valid) + CELL;
		const [a, b, c, d] = values.map(v => v ?? worst);
		const top = a + (b - a) * tx;
		const bottom = c + (d - c) * tx;
		return top + (bottom - top) * ty;
	}

	/** Free height below a point before leaving the rooms (0 outside). */
	freeBelowAt(x: number, y: number) {
		const col = Math.floor((x - this.minX) / CELL);
		const row = Math.floor((y - this.minY) / CELL);
		if (!this.isValid(col, row))
			return 0;

		// The cell itself counts from its center: remove the part above the point.
		const cell = this.index(col, row);
		const offset = y - this.centerY(row);
		return Math.max(0, this.freeBelow[cell] - CELL / 2 - offset);
	}

}


const finishFields = new WeakMap<LevelDef, FlowField>();
const healFields = new WeakMap<LevelDef, Map<string, FlowField>>();

/** Returns the field leading to the end of a level, computing it the first time. */
export function getFinishField(level: LevelDef) {
	let field = finishFields.get(level);
	if (!field) {
		field = new FlowField(level, (_, def) => def.modules.finishLevel !== undefined);
		finishFields.set(level, field);
	}

	return field;
}

/** Tells whether a heal block can be a goal: a moving heal is not a reliable destination. */
export function isHealGoal(def: BlockDef) {
	return def.modules.heal !== undefined && isStatic(def);
}

/**
 * Returns the field leading to some heal blocks of a level (the ones which
 * still have units). There are few heal blocks per level, so every useful
 * combination is computed once and kept.
 */
export function getHealField(level: LevelDef, blockIds: number[]) {
	let fields = healFields.get(level);
	if (!fields) {
		fields = new Map();
		healFields.set(level, fields);
	}

	const key = [...blockIds].sort((a, b) => a - b).join(',');
	let field = fields.get(key);
	if (!field) {
		const goals = new Set(blockIds);
		field = new FlowField(level, id => goals.has(id));
		fields.set(key, field);
	}

	return field;
}

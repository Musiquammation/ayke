import type { GMJumpies } from "../GMJumpies";
import { Block } from "./Block";
import { RoomDef } from "./defs";

const ADJACENCE_RECT_SIZE = 20;

export interface AdjacenceRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Segment {
	start: number;
	end: number;
}

interface Side {
	name: 'top' | 'bottom' | 'left' | 'right';
	start: number;
	end: number;
}

/**
 * A room of the level, owning its blocks. Its geometry never changes, so
 * nothing here is shared: only the blocks have data to send.
 * A block stays registered in the room of its definition, even if it moves.
 */
export class Room {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly blocks: Block[];

	adjacentRooms: Room[] = [];
	adjacenceRects: AdjacenceRect[] = [];

	constructor(readonly index: number, def: RoomDef) {
		this.x = def.x;
		this.y = def.y;
		this.w = def.w;
		this.h = def.h;
		this.blocks = Object.entries(def.blocks).map(
			([id, block]) => new Block(Number(id), block)
		);
	}

	/** Tells whether a point is in the room. */
	contains(x: number, y: number) {
		return (
			x >= this.x && x < this.x + this.w &&
			y >= this.y && y < this.y + this.h
		);
	}

	/** Tells whether at least one pixel of a centered box touches the room. */
	touchesBox(x: number, y: number, w: number, h: number) {
		return (
			this.x + this.w >= x - w / 2 &&
			this.x <= x + w / 2 &&
			this.y + this.h >= y - h / 2 &&
			this.y <= y + h / 2
		);
	}

	/** Runs the blocks for one simulation step. */
	frame(game: GMJumpies, dt: number) {
		for (const block of this.blocks) {
			block.frame(game, dt);
		}
	}

	/** Returns the part of a side of this room covered by a room, if it is a neighbor. */
	private getSharedSegment(side: Side, other: Room): Segment | null {
		const touching = {
			top: other.y + other.h === this.y,
			bottom: other.y === this.y + this.h,
			left: other.x + other.w === this.x,
			right: other.x === this.x + this.w
		}[side.name];

		if (!touching)
			return null;

		const horizontal = side.name === 'top' || side.name === 'bottom';
		const start = Math.max(side.start, horizontal ? other.x : other.y);
		const end = Math.min(side.end, horizontal ? other.x + other.w : other.y + other.h);
		return start < end ? { start, end } : null;
	}

	/** Lists the parts of a side leading to another room, merged and sorted. */
	private getOccupiedSegments(side: Side) {
		const segments: Segment[] = [];
		for (const room of this.adjacentRooms) {
			const segment = this.getSharedSegment(side, room);
			if (segment) {
				segments.push(segment);
			}
		}

		segments.sort((a, b) => a.start - b.start);

		const merged: Segment[] = [];
		for (const segment of segments) {
			const last = merged[merged.length - 1];
			if (!last || last.end < segment.start) {
				merged.push({ ...segment });
			} else {
				last.end = Math.max(last.end, segment.end);
			}
		}

		return merged;
	}

	/** Creates the bar of a free part of a side, drawn inside the room. */
	private createAdjacenceRect(side: Side, start: number, end: number): AdjacenceRect {
		const size = ADJACENCE_RECT_SIZE;
		const length = end - start;

		switch (side.name) {
			case 'top': return { x: start, y: this.y, w: length, h: size };
			case 'bottom': return { x: start, y: this.y + this.h - size, w: length, h: size };
			case 'left': return { x: this.x, y: start, w: size, h: length };
			case 'right': return { x: this.x + this.w - size, y: start, w: size, h: length };
		}
	}

	/** Places a bar on each part of the borders which does not lead to another room. */
	fillAdjacenceRects() {
		const sides: Side[] = [
			{ name: 'top', start: this.x, end: this.x + this.w },
			{ name: 'bottom', start: this.x, end: this.x + this.w },
			{ name: 'left', start: this.y, end: this.y + this.h },
			{ name: 'right', start: this.y, end: this.y + this.h }
		];

		this.adjacenceRects = [];
		for (const side of sides) {
			let position = side.start;
			for (const segment of this.getOccupiedSegments(side)) {
				if (position < segment.start) {
					this.adjacenceRects.push(this.createAdjacenceRect(side, position, segment.start));
				}
				position = segment.end;
			}

			if (position < side.end) {
				this.adjacenceRects.push(this.createAdjacenceRect(side, position, side.end));
			}
		}
	}
}

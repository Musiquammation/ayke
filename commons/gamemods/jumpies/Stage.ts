import type { Block } from "./Block";
import { LevelDef } from "./defs";
import { Room } from "./Room";

type RoomUpdate =
	{ code: 'same' } |
	{ code: 'new', room: number } |
	{ code: 'out' };

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Tells whether two rooms share a part of a border. */
function areAdjacent(a: Room, b: Room) {
	const horizontal =
		(a.x + a.w === b.x || b.x + b.w === a.x) &&
		a.y < b.y + b.h &&
		a.y + a.h > b.y;

	const vertical =
		(a.y + a.h === b.y || b.y + b.h === a.y) &&
		a.x < b.x + b.w &&
		a.x + a.w > b.x;

	return horizontal || vertical;
}

/** Tells whether a room is completely inside another one. */
function isInside(a: Room, b: Room) {
	return (
		a.x >= b.x && a.y >= b.y &&
		a.x + a.w <= b.x + b.w &&
		a.y + a.h <= b.y + b.h
	);
}

/** The real rooms of a game, created from the description of the level. */
export class Stage {
	readonly rooms: Room[];
	readonly blocks: Record<number, Block> = {};
	readonly spawnRoom: number;

	constructor(level: LevelDef, playerCount: number) {
		this.rooms = level.rooms.map((def, index) => new Room(index, def, playerCount));

		for (const room of this.rooms) {
			this.fillAdjacentRooms(room);
			room.fillAdjacenceRects();
			this.registerBlocks(room);
		}

		const spawn = level.spawns[0];
		const spawnRoom = this.findRoom(spawn.x, spawn.y);
		if (spawnRoom === null)
			throw new Error(`Missing spawn room in level '${level.name}'`);

		this.spawnRoom = spawnRoom.index;
	}

	/** Lists the neighbors of a room. */
	private fillAdjacentRooms(room: Room) {
		for (const other of this.rooms) {
			if (other === room)
				continue;

			if (isInside(room, other))
				throw new Error("A room touches another");

			if (areAdjacent(room, other)) {
				room.adjacentRooms.push(other);
			}
		}
	}

	/** Gives access to the blocks by id, for the switches and the network. */
	private registerBlocks(room: Room) {
		for (const block of room.blocks) {
			if (this.blocks[block.id])
				throw new Error(`Duplicated block id ${block.id}`);

			this.blocks[block.id] = block;
		}
	}

	/** Returns the room containing a point. */
	findRoom(x: number, y: number) {
		return this.rooms.find(room => room.contains(x, y)) ?? null;
	}

	/**
	 * Finds where a box stands, from the room it was in. The center decides of the
	 * room. A box whose center is in no room stays in the room it still touches,
	 * and it is only out when none of its pixels touches a room.
	 */
	update({ x, y, w, h }: Box, roomIndex: number): RoomUpdate {
		const current = this.rooms[roomIndex];
		if (current.contains(x, y))
			return { code: 'same' };

		const room = this.findRoom(x, y);
		if (room)
			return { code: 'new', room: room.index };

		if (current.touchesBox(x, y, w, h))
			return { code: 'same' };

		const touched = this.rooms.find(r => r.touchesBox(x, y, w, h));
		return touched ? { code: 'new', room: touched.index } : { code: 'out' };
	}
}

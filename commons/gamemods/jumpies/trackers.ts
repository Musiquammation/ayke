import { Fields } from "../../Fields";
import type { Block } from "./Block";
import { PICKUP_UNITS } from "./constants";

/**
 * A tracker owns the data of a block which can change during a game.
 * Only trackers are sent over the network: everything else comes from LEVELS.
 *
 * A block has at most one tracker of each type, shared by all its modules
 * (see Block.track). For example speed and acceleration use the same SpeedTracker.
 */
export interface Tracker {
	/** Name of the field of the BlockState protobuf message. */
	readonly key: string;

	/** Reads the current values, in the format of the protobuf message. */
	load(block: Block): Fields;

	/** Writes values received in the format of the protobuf message. */
	save(block: Block, data: Fields): void;
}

/** Tracks the position of a block able to move (the values live in the block). */
export class PositionTracker implements Tracker {
	readonly key = 'position';

	load(block: Block): Fields {
		return { x: block.x, y: block.y };
	}

	save(block: Block, data: Fields) {
		block.x = data.x;
		block.y = data.y;
	}
}

/** Tracks the speed of a block. */
export class SpeedTracker implements Tracker {
	readonly key = 'speed';
	vx = 0;
	vy = 0;

	load(_block: Block): Fields {
		return { vx: this.vx, vy: this.vy };
	}

	save(_block: Block, data: Fields) {
		this.vx = data.vx;
		this.vy = data.vy;
	}
}

/** Tracks which players are inside a block, to detect the ones who just entered. */
export class PlayersInsideTracker implements Tracker {
	readonly key = 'playersInside';
	ids: number[] = [];

	/** Stores the players of this frame and returns those absent at the previous frame. */
	update(ids: number[]) {
		const entered = ids.filter(id => !this.ids.includes(id));
		this.ids = ids;
		return entered;
	}

	load(_block: Block): Fields {
		return { ids: this.ids };
	}

	save(_block: Block, data: Fields) {
		this.ids = [...data.ids];
	}
}

/** Tracks whether a block driven by switches is active. */
export class ActiveTracker implements Tracker {
	readonly key = 'active';
	active = true;

	load(_block: Block): Fields {
		return { active: this.active };
	}

	save(_block: Block, data: Fields) {
		this.active = data.active;
	}
}

/** Tracks the units left in a pickup. Each kind of pickup has its own units. */
abstract class UnitsTracker implements Tracker {
	abstract readonly key: string;
	units = PICKUP_UNITS;

	/** Takes one unit if possible and tells whether it worked. */
	take() {
		if (this.units <= 0)
			return false;

		this.units--;
		return true;
	}

	/** Gives back one unit, up to the maximum. */
	regain() {
		this.units = Math.min(PICKUP_UNITS, this.units + 1);
	}

	load(_block: Block): Fields {
		return { units: this.units };
	}

	save(_block: Block, data: Fields) {
		this.units = data.units;
	}
}

export class HealUnitsTracker extends UnitsTracker {
	readonly key = 'healUnits';
}

export class RestoreJumpUnitsTracker extends UnitsTracker {
	readonly key = 'restoreJumpUnits';
}

/** Tracks the time left before each player can be hit again by a repeated attack. */
export class CooldownsTracker implements Tracker {
	readonly key = 'cooldowns';
	values = new Map<number, number>(); // player id -> remaining seconds

	/** Makes all cooldowns progress and forgets the finished ones. */
	tick(dt: number) {
		for (const [id, remaining] of this.values) {
			if (remaining <= dt) {
				this.values.delete(id);
			} else {
				this.values.set(id, remaining - dt);
			}
		}
	}

	load(_block: Block): Fields {
		return {
			entries: [...this.values].map(([player, remaining]) => ({ player, remaining }))
		};
	}

	save(_block: Block, data: Fields) {
		this.values.clear();
		for (const entry of data.entries) {
			this.values.set(entry.player, entry.remaining);
		}
	}
}

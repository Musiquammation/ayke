import type { Block } from "../Block";
import { AccelerationDef, PositionLimiterDef, SpeedDef } from "../defs";
import { PositionTracker, SpeedTracker } from "../trackers";
import { BlockModule } from "./BlockModule";

/** Moves the block according to its speed. */
export class SpeedModule implements BlockModule {
	private readonly speed: SpeedTracker;

	constructor(def: SpeedDef, block: Block) {
		block.track(PositionTracker);
		this.speed = block.track(SpeedTracker);
		this.speed.vx = def.vx;
		this.speed.vy = def.vy;
	}

	frame(block: Block, _game: unknown, dt: number) {
		block.x += this.speed.vx * dt;
		block.y += this.speed.vy * dt;
	}
}

/** Changes the speed of the block. It relies on a SpeedModule to really move it. */
export class AccelerationModule implements BlockModule {
	private readonly speed: SpeedTracker;

	constructor(private readonly def: AccelerationDef, block: Block) {
		this.speed = block.track(SpeedTracker);
	}

	frame(_block: Block, _game: unknown, dt: number) {
		this.speed.vx += this.def.ax * dt;
		this.speed.vy += this.def.ay * dt;
	}
}

/**
 * Keeps the block inside a rectangle. The speed pushing against a limit is
 * cancelled, otherwise an accelerated block would stay stuck for a long time
 * when something tries to send it back.
 */
export class PositionLimiterModule implements BlockModule {
	private readonly speed: SpeedTracker | null;

	constructor(private readonly def: PositionLimiterDef, block: Block) {
		block.track(PositionTracker);
		this.speed = block.peek(SpeedTracker);
	}

	frame(block: Block) {
		const { minX, maxX, minY, maxY } = this.def;
		const x = Math.max(minX, Math.min(maxX, block.x));
		const y = Math.max(minY, Math.min(maxY, block.y));

		if (this.speed) {
			if (x !== block.x) this.speed.vx = 0;
			if (y !== block.y) this.speed.vy = 0;
		}

		block.x = x;
		block.y = y;
	}
}

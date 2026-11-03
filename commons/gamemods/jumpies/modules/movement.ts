import type { Block } from "../Block";
import type { GMJumpies } from "../../GMJumpies";
import { AccelerationDef, ChaseDef, PositionLimiterDef, RotationDef, SpeedDef } from "../defs";
import { PositionTracker, RotationTracker, SpeedTracker } from "../trackers";
import { BlockModule } from "./BlockModule";

/** Moves the block according to its speed. */
export class SpeedModule implements BlockModule {
	private readonly speed: SpeedTracker;

	constructor(private readonly def: SpeedDef, block: Block) {
		block.track(PositionTracker);
		this.speed = block.track(SpeedTracker);
		this.reset();
	}

	frame(block: Block, _game: unknown, dt: number) {
		block.x += this.speed.vx * dt;
		block.y += this.speed.vy * dt;
	}

	reset() {
		this.speed.vx = this.def.vx;
		this.speed.vy = this.def.vy;
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

/** Turns the block at a constant speed. */
export class RotationModule implements BlockModule {
	private readonly rotation: RotationTracker;

	constructor(private readonly def: RotationDef, block: Block) {
		this.rotation = block.track(RotationTracker);
		this.reset();
	}

	frame(_block: Block, _game: unknown, dt: number) {
		const turn = Math.PI * 2;
		this.rotation.angle = (this.rotation.angle + this.def.speed * dt) % turn;
	}

	reset() {
		this.rotation.angle = this.def.start;
	}
}

/** Sends the block toward the nearest player in range. It relies on a SpeedModule to really move it. */
export class ChaseModule implements BlockModule {
	private readonly speed: SpeedTracker;

	constructor(private readonly def: ChaseDef, block: Block) {
		this.speed = block.track(SpeedTracker);
	}

	frame(block: Block, game: GMJumpies) {
		let target = null;
		let best = this.def.range;
		for (const player of game.players) {
			const distance = Math.hypot(player.x - block.x, player.y - block.y);
			if (player.isInGame() && distance <= best) {
				target = player;
				best = distance;
			}
		}

		if (!target || best === 0) {
			this.speed.vx = 0;
			this.speed.vy = 0;
			return;
		}

		this.speed.vx = (target.x - block.x) / best * this.def.speed;
		this.speed.vy = (target.y - block.y) / best * this.def.speed;
	}
}

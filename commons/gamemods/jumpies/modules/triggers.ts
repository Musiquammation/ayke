import type { GMJumpies } from "../../GMJumpies";
import type { Block } from "../Block";
import { BounceDef, LoopDef, SwitchDef } from "../defs";
import type { Player } from "../Player";
import { ActiveTracker, DespawnHpTracker, LoopTracker } from "../trackers";
import { BlockModule } from "./BlockModule";

/** Calls switch(code) on the target blocks when a player enters the block. */
export class SwitchModule implements BlockModule {
	constructor(private readonly def: SwitchDef) {}

	onEnter(_player: Player, _block: Block, game: GMJumpies) {
		for (const target of this.def.targets) {
			game.blocks[target].switch(this.def.code);
		}
	}
}

/** Ends the level for the players entering the block. */
export class FinishLevelModule implements BlockModule {
	onEnter(player: Player, _block: Block, game: GMJumpies) {
		game.finishPlayer(player);
	}
}

/** Sends back up the falling players who enter the block. */
export class BounceModule implements BlockModule {
	constructor(private readonly def: BounceDef) {}

	onEnter(player: Player) {
		player.bounce(this.def.factor, this.def.cost);
	}
}

/**
 * Each player entering the block takes one of its hit points, and the block is
 * deactivated when none is left. A death gives back one hit point, and brings
 * the block back if it had disappeared.
 */
export class TouchDespawnModule implements BlockModule {
	private readonly active: ActiveTracker;
	private readonly hp: DespawnHpTracker;

	constructor(block: Block) {
		this.active = block.track(ActiveTracker);
		this.hp = block.track(DespawnHpTracker);
		this.hp.init(block.playerCount);
	}

	onEnter() {
		this.hp.take();
		if (this.hp.units <= 0) {
			this.active.active = false;
		}
	}

	onPlayerDeath() {
		const despawned = this.hp.units <= 0;
		this.hp.regain();
		if (despawned) {
			this.active.active = true;
		}
	}

	reset() {
		this.hp.fill();
	}
}

/** Brings the block back to its initial state at a regular rhythm. */
export class LoopModule implements BlockModule {
	private readonly loop: LoopTracker;

	constructor(private readonly def: LoopDef, block: Block) {
		this.loop = block.track(LoopTracker);
	}

	frame(block: Block, _game: unknown, dt: number) {
		this.loop.time += dt;
		if (this.loop.time >= this.def.period) {
			this.loop.time -= this.def.period;
			block.reset();
		}
	}
}

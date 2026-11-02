import type { GMJumpies } from "../../GMJumpies";
import type { Block } from "../Block";
import { BounceDef, SwitchDef } from "../defs";
import type { Player } from "../Player";
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

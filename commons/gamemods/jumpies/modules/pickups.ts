import type { Block } from "../Block";
import { HealDef, RestoreJumpDef } from "../defs";
import type { Player } from "../Player";
import { HealUnitsTracker, RestoreJumpUnitsTracker } from "../trackers";
import { BlockModule } from "./BlockModule";

/** Heals players entering the block, as long as it has units left. */
export class HealModule implements BlockModule {
	private readonly units: HealUnitsTracker;

	constructor(private readonly def: HealDef, block: Block) {
		this.units = block.track(HealUnitsTracker);
		this.units.init(block.playerCount);
	}

	onEnter(player: Player) {
		if (this.units.take()) {
			player.heal(this.def.hp);
		}
	}

	onPlayerDeath() {
		this.units.regain();
	}
}

/** Gives jumps to players entering the block, as long as it has units left. */
export class RestoreJumpModule implements BlockModule {
	private readonly units: RestoreJumpUnitsTracker;

	constructor(private readonly def: RestoreJumpDef, block: Block) {
		this.units = block.track(RestoreJumpUnitsTracker);
		this.units.init(block.playerCount);
	}

	onEnter(player: Player) {
		if (this.units.take()) {
			player.restoreJumps(this.def.gain);
		}
	}

	onPlayerDeath() {
		this.units.regain();
	}
}

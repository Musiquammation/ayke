import type { Block } from "../Block";
import { ContinousAttackDef, RepeatedAttackDef } from "../defs";
import type { Player } from "../Player";
import { CooldownsTracker } from "../trackers";
import { BlockModule } from "./BlockModule";

/** Kills every player touching the block. */
export class LavaModule implements BlockModule {
	onTouch(player: Player) {
		player.kill();
	}
}

/** Hits touching players, each player having their own cooldown. */
export class RepeatedAttackModule implements BlockModule {
	private readonly cooldowns: CooldownsTracker;

	constructor(private readonly def: RepeatedAttackDef, block: Block) {
		this.cooldowns = block.track(CooldownsTracker);
	}

	frame(_block: Block, _game: unknown, dt: number) {
		this.cooldowns.tick(dt);
	}

	onTouch(player: Player) {
		if (this.cooldowns.values.has(player.id))
			return;

		this.cooldowns.values.set(player.id, this.def.duration);
		player.hit(this.def.damages);
	}
}

/** Hits touching players for as long as they stay on the block. */
export class ContinousAttackModule implements BlockModule {
	constructor(private readonly def: ContinousAttackDef) {}

	onTouch(player: Player, _block: Block, _game: unknown, dt: number) {
		player.hit(this.def.damagesPerSecond * dt);
	}
}

import type { GMJumpies } from "../../GMJumpies";
import type { Block } from "../Block";
import type { Player } from "../Player";

/**
 * Behavior of a block. Modules only read their definition: all the data which
 * can change is in the trackers of the block, so that it survives a load.
 * Each hook is optional, a module only declares what it needs.
 */
export interface BlockModule {
	/** Called at each step, before collisions are checked. */
	frame?(block: Block, game: GMJumpies, dt: number): void;

	/** Called once when a player starts touching the block. */
	onEnter?(player: Player, block: Block, game: GMJumpies): void;

	/** Called at each step while a player touches the block. */
	onTouch?(player: Player, block: Block, game: GMJumpies, dt: number): void;

	/** Called when any player of the game dies. */
	onPlayerDeath?(block: Block): void;
}

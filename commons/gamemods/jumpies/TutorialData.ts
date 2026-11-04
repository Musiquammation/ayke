import type { GMJumpies } from "../GMJumpies";
import { JUMP_COUNT } from "./constants";

const INTRO_TIME = 5;
const SECOND_TIP_TIME = 10;

/** Small texts guiding the player during a local game. */
export class TutorialData {
	private time = 0;

	constructor(private readonly game: GMJumpies) {}

	frame(dt: number, _clock: number) {
		this.time += dt;
		const player = this.game.players[0];

		if (this.time < INTRO_TIME)
			return "There are no platforms: jump from room to room and reach the blue block!";

		if (player.jumps < JUMP_COUNT / 2)
			return "Out of jumps, you lose hit points: find a yellow block or a bouncer";

		if (this.time < SECOND_TIP_TIME)
			return "Entering a new room gives your jumps back";

		return "";
	}
}

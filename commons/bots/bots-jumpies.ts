import { Fields } from "../Fields";
import { botActionNodeHelper, describeBot } from "../Bot";
import { GMJumpies } from "../gamemods/GMJumpies";
import type { Room } from "../gamemods/jumpies/Room";

const { all, runner } = botActionNodeHelper<GMJumpies, Data>();

const JUMP_DELAY = 0.45; // seconds between two jumps
const SAFE_MARGIN = 300; // the bot reacts when it falls this close to the bottom of its room
const FOLLOW_MARGIN = 60;

interface Data {
	lastJumpAt: number;
}

/** Finds the end of the level. */
function findFinish(game: GMJumpies) {
	return Object.values(game.blocks).find(block => block.def.modules.finishLevel) ?? null;
}

/** Finds the bounce block of a room closest to a horizontal position. */
function findNearestBounce(room: Room, x: number) {
	let nearest = null;
	for (const block of room.blocks) {
		if (!block.def.modules.bounce)
			continue;

		if (nearest === null || Math.abs(block.x - x) < Math.abs(nearest.x - x)) {
			nearest = block;
		}
	}

	return nearest;
}

/**
 * A simple bot: it goes towards the end of the level, goes back to a bounce
 * block when it gets low, and jumps if nothing can catch it or to climb.
 */
const method = runner((game, data, playerIdx) => {
	const player = game.players[playerIdx];
	const inputs: Fields[] = [];
	if (!player.isInGame())
		return [inputs, 'success'];

	const room = game.stage.rooms[player.room];
	const finish = findFinish(game);

	const falling = player.vy > 0;
	const tooLow = player.y > room.y + room.h - SAFE_MARGIN;
	const bounce = findNearestBounce(room, player.x);
	const target = (tooLow && bounce) ? bounce : finish;

	const dx = target ? target.x - player.x : 0;
	const move = Math.abs(dx) < FOLLOW_MARGIN ? 0 : Math.sign(dx);
	if (move !== player.dirX) {
		inputs.push({ action: 'move', move });
	}

	const now = performance.now() / 1000;
	const caught = bounce !== null && Math.abs(bounce.x - player.x) < bounce.w / 2;
	const mustClimb = finish !== null && finish.y < room.y && player.jumps >= 1;
	const needsJump = mustClimb || (tooLow && !caught);
	if (falling && needsJump && now - data.lastJumpAt >= JUMP_DELAY) {
		data.lastJumpAt = now;
		inputs.push({ action: 'jump', jump: {} });
	}

	return [inputs, 'success'];
});

const root = (function () {
	return all([method]);
})();

export default describeBot([{ root, data: (): Data => ({ lastJumpAt: 0 }) }]);

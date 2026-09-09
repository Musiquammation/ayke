import { Fields } from "../../commons/Fields";
import { GMTest } from "../../commons/gamemods/GMTest";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-test');
// logger.setLevel('debug');

const TYPES = GMTest.types;
type Player = typeof TYPES.Player;

interface Data {
	nearestOpponent: number;
}

function dataConstructor(): Data {
	return {
		nearestOpponent: -1,
	}	
}




const {all, first, loop, runner} = botActionNodeHelper<GMTest, Data>();

const getFollowOpponent = runner((game, data, playerIdx) => {
	const player = game.players[playerIdx];

	let nearestIdx = -1;
	let nearestDistance = Infinity;

	for (const [idx, opponent] of game.players.entries()) {
		if (idx === playerIdx)
			continue;

		const dx = opponent.x - player.x;
		const dy = opponent.y - player.y;
		const distance = dx * dx + dy * dy;

		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestIdx = idx;
		}
	}

	data.nearestOpponent = nearestIdx;
	return [[], 'success'];
});


const followNearestOpponent = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	let move: number;
	const target = game.players[data.nearestOpponent];
	if (target === undefined)
		move = 0;

	else if (target.y > game.players[playerIdx].y)
		move = 300;

	else if (target.y < game.players[playerIdx].y)
		move = -300;

	else
		move = 0;


	logger.debug(`move ${move} ty=${target.y} py=${game.players[playerIdx].y}`);

	if (game.players[playerIdx].move !== move) {
		inputs.push({move});
	}

	return [inputs, 'success'];
});


const root = (function() {
	return all([getFollowOpponent, followNearestOpponent]);
})();


export default describeBot(
	[{root, data: dataConstructor}]
);



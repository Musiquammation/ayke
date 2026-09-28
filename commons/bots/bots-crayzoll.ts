import { Fields } from "../../commons/Fields";
import { GMCrayzoll } from "../../commons/gamemods/GMCrayzoll";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-test');
// logger.setLevel('debug');

const TYPES = GMCrayzoll.types;
type Player = typeof TYPES.Player;

interface Data {
	isJumping: boolean;
}

function dataConstructor(): Data {
	return {
		isJumping: false
	};
}




const {all, first, loop, runner} = botActionNodeHelper<GMCrayzoll, Data>();

const frame = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];


	const player = game.players[playerIdx];
	if (player.y > GMCrayzoll.DATA.HEIGHT/4 && player.vy > 0) {
		inputs.push({action: 'jump', jump: {}})
	}

	return [inputs, 'success'];
});

const root = (function() {
	return all([frame]);
})();


export default describeBot(
	[{root, data: dataConstructor}]
);



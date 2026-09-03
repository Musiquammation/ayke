import { Fields } from "../../commons/Fields";
import { GMTurrets } from "../../commons/gamemods/GMTurrets";
import { getBestInArray } from "../../commons/util/getBestInArray";
import { appendBots, botActionNodeHelper } from "../Bot";
import { getLogger } from "../Logger";

const logger = getLogger('bots-turrets');
// logger.setLevel('debug');

const {all, first, loop, runner} = botActionNodeHelper<GMTurrets, Data>();

const TYPES = GMTurrets.types;

const INPUTS = {
	jump: {jump: {}, action: 'jump'},
	downOn: {downOn: {}, action: 'downOn'},
	downOff: {downOff: {}, action: 'downOff'},
	left: {left: {}, action: 'left'},
	right: {right: {}, action: 'right'},
	stop: {stop: {}, action: 'stop'},
};


class Data {	

}

function dataConstructor(): Data {
	return new Data();
}


// Refactored single bot loop combining all behaviors
const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	return [inputs, 'success'];
});


const root = (function() {
	return all([method]);
})();

appendBots('turrets', [
	{root, data: dataConstructor}
]);

logger.info("Bot loaded!");

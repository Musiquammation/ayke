import { Fields } from "../Fields";
import { GMLavaBall } from "../gamemods/GMLavaBall";
import { getBestInArray } from "../util/getBestInArray";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-example');
// logger.setLevel('debug');

const {all, first, loop, runner} = botActionNodeHelper<GMLavaBall, Data>();

const TYPES = GMLavaBall.types;

const INPUTS = {
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

export default describeBot(
	[{root, data: dataConstructor}]
);

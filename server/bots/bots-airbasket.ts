import { Fields } from "../../commons/Fields";
import { GMTest } from "../../commons/gamemods/GMTest";
import { appendBots, botActionNodeHelper } from "../Bot";
import { getLogger } from "../Logger";

const logger = getLogger('bots-airbasket');
// logger.setLevel('debug');

const TYPES = GMTest.types;
type Player = typeof TYPES.Player;

interface Data {
	
}

function dataConstructor(): Data {
	return {
		
	};
}




const {all, first, loop, runner} = botActionNodeHelper<GMTest, Data>();

const emptyRunner = runner((game, data, playerIdx) => {
	return [[], 'success'];
});



const testBot = (function() {
	return all([emptyRunner]);
})();

appendBots('airbasket', [
	{root: testBot, data: dataConstructor}
]);


logger.info("Bot loaded!");


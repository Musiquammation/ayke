import { GMTest } from "../../commons/gamemods/GMTest";
import { appendBots, botActionNodeHelper } from "../Bot";

interface Data {

}

function dataConstructor(): Data {
	return {}
}

const {all, first, loop, runner} = botActionNodeHelper<GMTest, Data>();

const testBot = (function() {
	return all([]);
})();

appendBots('test', [
	{root: testBot, data: dataConstructor}
]);
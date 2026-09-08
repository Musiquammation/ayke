Fill in Data and method.

Use helper methods (do not write one large function), and add verbose comments in English.

Replace GMExample by the actual GMFoo (and example by 'foo').

You already have foo.ts. send inputs (put everytime `{action: 'name', name{data}}`)

```ts
import { Fields } from "../../commons/Fields";
import { GMExample } from "../../commons/gamemods/GMExample";
import { getBestInArray } from "../../commons/util/getBestInArray";
import { appendBots, botActionNodeHelper } from "../Bot";
import { getLogger } from "../Logger";

const logger = getLogger('bots-example');
// logger.setLevel('debug');

const {all, first, loop, runner} = botActionNodeHelper<GMExample, Data>();

const TYPES = GMExample.types;

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

appendBots('example', [
	{root, data: dataConstructor}
]);

logger.info("Bot loaded!");


```

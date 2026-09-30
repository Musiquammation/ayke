import { Fields } from "../../commons/Fields";
import { botActionNodeHelper, describeBot } from "../Bot";
import { GMSoapBubble } from "../gamemods/GMSoapBubble";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-soapBubble');
// logger.setLevel('debug');

class Data {

}

function dataConstructor(): Data {
	return new Data();
}

const { all, runner } = botActionNodeHelper<GMSoapBubble, Data>();


// ---------------------------------------------------------------------------
// Bot Decision Loop
// ---------------------------------------------------------------------------

const method = runner((game, data, playerIdx) => {
    return [[], 'success'];
});

const root = (function() {
    return all([method]);
})();

export default describeBot(
    [{ root, data: dataConstructor }]
);

import { GMTest } from "../../commons/gamemods/GMTest";
import { appendBots, botActionNodeHelper } from "../Bot";


const {all, first, loop, runner} = botActionNodeHelper<GMTest>();

const testBot = (function() {
    return all([]);
})();

appendBots('test', [
    testBot
]);
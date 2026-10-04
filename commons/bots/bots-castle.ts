import { Fields } from "../../commons/Fields";
import { botActionNodeHelper, describeBot } from "../Bot";
import { GMCastle } from "../gamemods/GMCastle";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-castle');

const { all, runner } = botActionNodeHelper<GMCastle, Data>();


// Input templates following the standard protocol `{ action: 'name', name: data }`
const INPUTS = {
    left: { action: 'dir', dir: -1 },
    right: { action: 'dir', dir: 1 },
    stop: { action: 'dir', dir: 0 },
    jump: { action: 'jump', jump: {} },
    downOn: { action: 'downOn', downOn: {} },
    downOff: { action: 'downOff', downOff: {} },
    throwOff: { action: 'throwOff', throwOff: {} },
};

/**
 * State object stored per-bot instance across game frames.
 * Tracks previously sent commands to prevent unnecessary input spamming.
 */
class Data {
    /** Last horizontal direction sent (-1, 0, or 1). */
    lastDir: number = 0;
    /** Whether the push-down input is currently active. */
    isDown: boolean = false;
    /** Whether the bot is actively aiming a throw target. */
    isAiming: boolean = false;
    /** Last aiming coordinates sent to avoid redundant network messages. */
    lastTargetX: number = 0;
    lastTargetY: number = 0;
}

function dataConstructor(): Data {
    return new Data();
}

const method = runner((game, data, playerIdx) => {
    const inputs: Fields[] = [];
    return [inputs, 'success'];
});

const root = (function() {
    return all([method]);
})();

export default describeBot(
    [{ root, data: dataConstructor }]
);


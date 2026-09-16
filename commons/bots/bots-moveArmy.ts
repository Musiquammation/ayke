import { Fields } from "../../commons/Fields";
import { GMMoveArmy } from "../../commons/gamemods/GMMoveArmy";
import { getBestInArray } from "../../commons/util/getBestInArray";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-moveArmy');
// logger.setLevel('debug');

const { all, runner } = botActionNodeHelper<GMMoveArmy, Data>();

// Define the two main strategic states for our bot.
type BotState = 'GROUPING' | 'ATTACKING';

/**
 * The Data class holds the internal state of our bot across frames.
 * It tracks whether we are currently rallying our troops or pushing an attack.
 */
class Data {	
	// Start by rallying troops so they don't march to their deaths one by one.
	state: BotState = 'GROUPING';

	// Thresholds to implement a hysteresis loop. 
	// This prevents the bot from constantly flickering between attacking and grouping.
	readonly startAttackingThreshold = 10;
	readonly retreatThreshold = 3;
}

function dataConstructor(): Data {
	return new Data();
}

// --- Helper Methods ---

/**
 * Finds the best friendly tower to use as a rally point.
 * We want to rally at our strongest tower (highest HP) so the troops 
 * are protected by it while they wait for reinforcements.
 */
function getBestRallyTower(game: GMMoveArmy, team: 'red' | 'blue') {
	const myTowers = game.towers.filter(t => t.team === team && t.hp > 0);
	// getBestInArray maximizes the return value of the callback, so returning t.hp gives the max HP tower.
	return getBestInArray(myTowers, t => t.hp) || null;
}

/**
 * Finds the best enemy tower to attack.
 * We prioritize the tower with the lowest HP to destroy it quickly and reduce enemy map control.
 */
function getBestEnemyTower(game: GMMoveArmy, myTeam: 'red' | 'blue') {
	const enemyTeam = myTeam === 'red' ? 'blue' : 'red';
	const enemyTowers = game.towers.filter(t => t.team === enemyTeam && t.hp > 0);
	// We return -t.hp because getBestInArray looks for the maximum value. 
	// Maximizing a negative number means finding the lowest HP.
	return getBestInArray(enemyTowers, t => -t.hp) || null;
}

// --- Main Bot Logic ---

/**
 * Refactored single bot loop combining all grouping and attacking behaviors.
 * This runs every tick/frame.
 */
const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const me = game.players[playerIdx];
	const myTeam = me.team;

	// Fetch all troops belonging to our team that are currently alive.
	const myTroops = game.getFriendlyTroops(myTeam);

	// 1. STATE MACHINE TRANSITIONS
	// Check if we have gathered enough troops to launch a devastating attack.
	if (data.state === 'GROUPING' && myTroops.length >= data.startAttackingThreshold) {
		logger.info(`Swarm assembled with ${myTroops.length} troops! Switching to ATTACKING state.`);
		data.state = 'ATTACKING';
	} 
	// Check if our attack wave was wiped out, meaning we need to fall back and group again.
	else if (data.state === 'ATTACKING' && myTroops.length <= data.retreatThreshold) {
		logger.info(`Swarm defeated. Only ${myTroops.length} troops left. Falling back to GROUPING state.`);
		data.state = 'GROUPING';
	}

	// 2. STATE BEHAVIORS
	if (data.state === 'GROUPING') {
		const rallyTower = getBestRallyTower(game, myTeam);

		if (rallyTower) {
			// Command all troops to rally at the friendly tower.
			for (const troop of myTroops) {
				// Check if the troop is already properly targeted to save bandwidth/inputs.
				const isTargetingRally = troop.neighboor?.kind === 'tower' && troop.neighboor.id === rallyTower.index;

				if (!isTargetingRally) {
					// Format required by the Prompt: { action: 'name', name: { data } }
					inputs.push({
						action: 'changeNeighboor',
						changeNeighboor: {
							troopId: troop.id,
							target: {
								case: 'targetTowerId',
								targetTowerId: rallyTower.index
							}
						}
					});
				}
			}
		} else {
			// Fallback: If all our towers are destroyed, just let the troops walk forward naturally
			// by cancelling any target they might currently have.
			for (const troop of myTroops) {
				if (troop.neighboor !== null) {
					inputs.push({
						action: 'changeNeighboor',
						changeNeighboor: {
							troopId: troop.id,
							target: {
								case: 'cancel',
								cancel: {}
							}
						}
					});
				}
			}
		}

	} else if (data.state === 'ATTACKING') {
		const enemyTower = getBestEnemyTower(game, myTeam);

		if (enemyTower) {
			// Command the swarm to attack the weakest enemy tower!
			for (const troop of myTroops) {
				const isTargetingEnemy = troop.neighboor?.kind === 'tower' && troop.neighboor.id === enemyTower.index;

				if (!isTargetingEnemy) {
					inputs.push({
						action: 'changeNeighboor',
						changeNeighboor: {
							troopId: troop.id,
							target: {
								case: 'targetTowerId',
								targetTowerId: enemyTower.index
							}
						}
					});
				}
			}
		} else {
			// Fallback: If all enemy towers are destroyed, release the troops to hunt enemy troops
			// naturally by cancelling their forced target.
			for (const troop of myTroops) {
				if (troop.neighboor !== null) {
					inputs.push({
						action: 'changeNeighboor',
						changeNeighboor: {
							troopId: troop.id,
							target: {
								case: 'cancel',
								cancel: {}
							}
						}
					});
				}
			}
		}
	}

	// 3. INPUT LIMITING
	// To prevent flooding the network/server with too many simultaneous inputs on a single frame 
	// (e.g. issuing 20 commands at once when transitioning states), we slice the array to only send a batch.
	// The rest will be sent in the subsequent frames since the target condition won't be met yet.
	return [inputs.slice(0, 5), 'success'];
});

const root = (function() {
	return all([method]);
})();

export default describeBot(
	[{ root, data: dataConstructor }]
);

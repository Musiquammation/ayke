import { Fields } from "../Fields";
import { GMRoarsOnGlass } from "../gamemods/GMRoarsOnGlass";
import { getBestInArray } from "../util/getBestInArray";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-roarsOnGlass');
// logger.setLevel('debug');

const { all, first, loop, runner } = botActionNodeHelper<GMRoarsOnGlass, Data>();

const TYPES = GMRoarsOnGlass.types;

class Data {
	// Keep track of the last computed movement direction and roar state 
	// to avoid sending redundant network packets on every single tick.
	lastDx: number = 0;
	lastDy: number = 0;
	lastRoar: boolean = false;
}

function dataConstructor(): Data {
	return new Data();
}

/**
 * Score function calculating tile safety rating between 0 and 1.
 * Any tile with health >= 1.5 returns a maximum score of 1.0.
 */
function getTileScore(health: number): number {
	if (health <= 0) return 0;
	if (health >= 1.5) return 1.0;
	return health / 1.5;
}

/**
 * Main behavior runner for the GMRoarsOnGlass bot.
 * 
 * Strategy breakdown:
 * 1. Global Pathfinding: Compute shortest weighted paths from bot position to all reachable tiles.
 * 2. Targeted Enemy Pursuit: Evaluate enemies using path travel times, attack readiness upon arrival,
 *    and push safety (ensuring enemy counter-attack won't push us into a tile with current health < 1).
 * 3. Fallback & Fleeing: If no enemy is targeted, locate the reachable tile with the best
 *    health score, actively fleeing nearby enemies by maximizing our distance from them.
 * 4. Input Emission: Send updates only when movement or action states change.
 */
const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const bot = game.players[playerIdx];

	// If the bot is dead or the round has ended, clear inputs and exit early.
	if (!bot || !bot.isAlive()) {
		return [inputs, 'success'];
	}

	// Constants reflecting game configurations
	const TILE_SIZE = 150;
	const GRID_PADDING = 1.5;
	const BOT_SPEED = 10; // Estimated movement speed in pixels per tick
	const TICKS_PER_TILE = TILE_SIZE / BOT_SPEED;

	const gridHeight = game.grid.length;
	const gridWidth = game.grid[0] ? game.grid[0].length : 0;

	if (gridHeight === 0 || gridWidth === 0) {
		return [inputs, 'success'];
	}

	// Current bot grid coordinates
	const botGx = Math.floor(bot.x / TILE_SIZE - GRID_PADDING);
	const botGy = Math.floor(bot.y / TILE_SIZE - GRID_PADDING);

	const startGx = Math.max(0, Math.min(gridWidth - 1, botGx));
	const startGy = Math.max(0, Math.min(gridHeight - 1, botGy));

	// --- STEP 1: DIJKSTRA PATHFINDING TO ALL TILES ---
	const dist = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(Infinity));
	const timeTicks = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(Infinity));
	const firstStep = Array.from({ length: gridHeight }, () => Array<{ dx: number; dy: number } | null>(gridWidth).fill(null));

	dist[startGy][startGx] = 0;
	timeTicks[startGy][startGx] = 0;

	const pq: { gx: number; gy: number; cost: number }[] = [{ gx: startGx, gy: startGy, cost: 0 }];

	const neighbors = [
		{ dx: 1, dy: 0, costMult: 1 },
		{ dx: -1, dy: 0, costMult: 1 },
		{ dx: 0, dy: 1, costMult: 1 },
		{ dx: 0, dy: -1, costMult: 1 },
		{ dx: 1, dy: 1, costMult: 1.414 },
		{ dx: -1, dy: 1, costMult: 1.414 },
		{ dx: 1, dy: -1, costMult: 1.414 },
		{ dx: -1, dy: -1, costMult: 1.414 },
	];

	while (pq.length > 0) {
		pq.sort((a, b) => a.cost - b.cost);
		const curr = pq.shift()!;

		if (curr.cost > dist[curr.gy][curr.gx]) continue;

		for (const n of neighbors) {
			const ngx = curr.gx + n.dx;
			const ngy = curr.gy + n.dy;

			if (ngy >= 0 && ngy < gridHeight && ngx >= 0 && ngx < gridWidth) {
				const health = game.grid[ngy][ngx];
				if (health <= 0) continue; // Unwalkable hole

				// Path cost weighting: health lower than 3 adds cost penalty
				const healthPenalty = Math.max(0, 3.0 - health);
				const stepCost = n.costMult * (1 + healthPenalty * 1.5);
				const newCost = dist[curr.gy][curr.gx] + stepCost;

				if (newCost < dist[ngy][ngx]) {
					dist[ngy][ngx] = newCost;
					timeTicks[ngy][ngx] = timeTicks[curr.gy][curr.gx] + n.costMult * TICKS_PER_TILE;

					if (curr.gx === startGx && curr.gy === startGy) {
						firstStep[ngy][ngx] = { dx: n.dx, dy: n.dy };
					} else {
						firstStep[ngy][ngx] = firstStep[curr.gy][curr.gx];
					}

					pq.push({ gx: ngx, gy: ngy, cost: newCost });
				}
			}
		}
	}

	// --- STEP 2: ENEMY SELECTION BASED ON ATTACK READINESS & SAFETY ---
	let targetDx = 0;
	let targetDy = 0;
	let bestEnemy: typeof bot | null = null;
	let minEnemyPathCost = Infinity;

	for (let i = 0; i < game.players.length; i++) {
		const other = game.players[i];
		if (i === playerIdx || !other.isAlive() || other.team === bot.team) continue;

		const egx = Math.floor(other.x / TILE_SIZE - GRID_PADDING);
		const egy = Math.floor(other.y / TILE_SIZE - GRID_PADDING);

		if (egy < 0 || egy >= gridHeight || egx < 0 || egx >= gridWidth) continue;

		const pathCost = dist[egy][egx];
		if (pathCost === Infinity) continue; // Unreachable enemy

		const travelTime = timeTicks[egy][egx];

		// Check if we can attack upon arrival
		const ourCooldownAtArrival = (bot.roarCooldown ?? 0) - travelTime;
		const weCanAttack = ourCooldownAtArrival <= 0;

		if (!weCanAttack) continue;

		// Check if enemy can attack us upon arrival and if that attack would push us into danger
		const enemyCooldownAtArrival = (other.roarCooldown ?? 0) - travelTime;
		const enemyCanAttack = enemyCooldownAtArrival <= 0;

		let safeFromEnemyAttack = true;

		if (enemyCanAttack) {
			// Simulate push direction away from enemy center upon arrival
			const PUSH_DISTANCE = 300;
			let pushDx = bot.x - other.x;
			let pushDy = bot.y - other.y;
			let pushLen = Math.sqrt(pushDx * pushDx + pushDy * pushDy);

			if (pushLen < 0.001) {
				pushDx = 1;
				pushDy = 0;
				pushLen = 1;
			}

			const pushedX = other.x + (pushDx / pushLen) * PUSH_DISTANCE;
			const pushedY = other.y + (pushDy / pushLen) * PUSH_DISTANCE;

			const pushedGx = Math.floor(pushedX / TILE_SIZE - GRID_PADDING);
			const pushedGy = Math.floor(pushedY / TILE_SIZE - GRID_PADDING);

			if (pushedGy < 0 || pushedGy >= gridHeight || pushedGx < 0 || pushedGx >= gridWidth) {
				safeFromEnemyAttack = false; // Pushed off map
			} else {
				const currentTileHealth = game.grid[pushedGy][pushedGx];
				if (currentTileHealth < 1.0) {
					safeFromEnemyAttack = false; // Pushed into a dangerous tile with current health < 1
				}
			}
		}

		if (weCanAttack && safeFromEnemyAttack) {
			if (pathCost < minEnemyPathCost) {
				minEnemyPathCost = pathCost;
				bestEnemy = other;
				const step = firstStep[egy][egx];
				if (step) {
					targetDx = step.dx;
					targetDy = step.dy;
				}
			}
		}
	}

	// --- STEP 3: FALLBACK TO HIGHEST SCORE TILE & FLEE IF ENEMIES ARE CLOSE ---
	if (!bestEnemy) {
		let maxCompositeScore = -1;
		let minCostToBestScore = Infinity;

		// Pre-compute current enemy grid positions to optimize distance checks inside the loop
		const enemyPositions: {gx: number, gy: number}[] = [];
		for (let i = 0; i < game.players.length; i++) {
			const other = game.players[i];
			if (i === playerIdx || !other.isAlive() || other.team === bot.team) continue;
			enemyPositions.push({
				gx: Math.floor(other.x / TILE_SIZE - GRID_PADDING),
				gy: Math.floor(other.y / TILE_SIZE - GRID_PADDING)
			});
		}

		for (let gy = 0; gy < gridHeight; gy++) {
			for (let gx = 0; gx < gridWidth; gx++) {
				if (dist[gy][gx] === Infinity) continue; // Unreachable tile

				const health = game.grid[gy][gx];
				const healthScore = getTileScore(health); // Scales from 0.0 to 1.0

				// Calculate distance from this candidate tile to the closest living enemy
				let minEnemyDistSq = Infinity;
				for (const ep of enemyPositions) {
					const dx = gx - ep.gx;
					const dy = gy - ep.gy;
					minEnemyDistSq = Math.min(minEnemyDistSq, dx * dx + dy * dy);
				}
				const minEnemyDist = minEnemyDistSq === Infinity ? Infinity : Math.sqrt(minEnemyDistSq);

				// Calculate a fleeing bonus:
				// We want to maximize distance from enemies up to a certain safe threshold (dangerRadius).
				const dangerRadius = 6.0;
				let distanceBonus = 0;
				
				if (minEnemyDist === Infinity) {
					distanceBonus = 1.0; // No enemies alive
				} else if (minEnemyDist < dangerRadius) {
					// Fractional bonus based on how far we are. Further is better.
					distanceBonus = minEnemyDist / dangerRadius; 
				} else {
					// If we are already far enough, max out the distance bonus.
					distanceBonus = 1.0; 
				}

				// Composite score heavily prioritizes tile health (multiplied by 10).
				// Distance to enemies acts as a secondary priority to break ties or near-ties,
				// making the bot actively flee from enemies when deciding between safe tiles.
				const compositeScore = (healthScore * 10) + distanceBonus;

				// Prioritize tiles with the highest composite score, and break ties using closest path cost
				if (compositeScore > maxCompositeScore + 1e-4) {
					maxCompositeScore = compositeScore;
					minCostToBestScore = dist[gy][gx];
					const step = firstStep[gy][gx];
					targetDx = step ? step.dx : 0;
					targetDy = step ? step.dy : 0;
				} else if (Math.abs(compositeScore - maxCompositeScore) < 1e-4) {
					// If scores are virtually identical, pick the one that requires the shortest travel distance
					if (dist[gy][gx] < minCostToBestScore) {
						minCostToBestScore = dist[gy][gx];
						const step = firstStep[gy][gx];
						targetDx = step ? step.dx : 0;
						targetDy = step ? step.dy : 0;
					}
				}
			}
		}
	}

	// --- STEP 4: ROAR / PUSH LOGIC ---
	// Trigger a roar if an enemy is within effective push radius (e.g., within 450 pixels)
	// and the roar ability is ready off cooldown.
	let triggerRoar = false;
	const ROAR_TRIGGER_DISTANCE = 450;

	for (let i = 0; i < game.players.length; i++) {
		const other = game.players[i];
		if (i === playerIdx || !other.isAlive() || other.team === bot.team) continue;

		const edx = other.x - bot.x;
		const edy = other.y - bot.y;
		if (edx * edx + edy * edy <= ROAR_TRIGGER_DISTANCE * ROAR_TRIGGER_DISTANCE) {
			if ((bot.roarCooldown ?? 0) <= 0) {
				triggerRoar = true;
				break;
			}
		}
	}

	// --- STEP 5: PACKET GENERATION ---
	// Only push movement updates if input states have changed since the last tick.
	if (targetDx !== data.lastDx || targetDy !== data.lastDy) {
		inputs.push({
			action: 'move',
			move: { dx: targetDx, dy: targetDy }
		});
		data.lastDx = targetDx;
		data.lastDy = targetDy;
	}

	// Only push roar action updates if the roar state changed.
	if (triggerRoar !== data.lastRoar) {
		inputs.push({
			action: 'roar',
			roar: triggerRoar
		});
		data.lastRoar = triggerRoar;
	}

	return [inputs, 'success'];
});

const root = (function() {
	return all([method]);
})();

export default describeBot(
	[{root, data: dataConstructor}]
);
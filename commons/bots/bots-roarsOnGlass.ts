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
 * Main behavior runner for the GMRoarsOnGlass bot.
 * 
 * Strategy breakdown:
 * 1. Self-Preservation: Check local glass tiles beneath and around the player. 
 *    If the current tile is breaking or broken, steer towards solid glass (value 3.0).
 * 2. Target Acquisition: Find the closest alive enemy player on the opposing team.
 * 3. Combat Positioning & Offense: 
 *    - Align with the enemy so that a roar or movement push can send them flying into a gap or off the map.
 *    - Trigger a roar (`roar = true`) when close enough to an enemy to push them backwards, provided the roar is off cooldown.
 * 4. Input Emission: Send movement and action updates only when states change to optimize performance.
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
	const PLAYER_SIZE = 100;

	// --- STEP 1: FIND NEAREST ENEMY ---
	let closestEnemy: typeof bot | null = null;
	let minEnemyDistSq = Infinity;

	for (let i = 0; i < game.players.length; i++) {
		const other = game.players[i];
		// Skip self, dead players, or teammates
		if (i === playerIdx || !other.isAlive() || other.team === bot.team) {
			continue;
		}

		const dx = other.x - bot.x;
		const dy = other.y - bot.y;
		const distSq = dx * dx + dy * dy;

		if (distSq < minEnemyDistSq) {
			minEnemyDistSq = distSq;
			closestEnemy = other;
		}
	}

	// --- STEP 2: EVALUATE SURROUNDING TILE SAFETY ---
	// Look for nearby safe tiles (value close to 3.0) to avoid falling into holes.
	let targetDirX = 0;
	let targetDirY = 0;

	// Convert world coordinates to grid coordinates
	const currentGridX = Math.floor(bot.x / TILE_SIZE - GRID_PADDING);
	const currentGridY = Math.floor(bot.y / TILE_SIZE - GRID_PADDING);

	// Scan a local 3x3 window around the bot to find the healthiest glass tile
	let bestTileX = bot.x;
	let bestTileY = bot.y;
	let highestGlassHealth = -1;
	let currentTileHealth = 0;

	for (let gy = currentGridY - 1; gy <= currentGridY + 1; gy++) {
		for (let gx = currentGridX - 1; gx <= currentGridX + 1; gx++) {
			// Check grid boundary limits
			if (gy >= 0 && gy < game.grid.length && gx >= 0 && gx < game.grid[0].length) {
				const health = game.grid[gy][gx];
				
				// Track health of the exact tile the bot is currently standing on
				if (gx === currentGridX && gy === currentGridY) {
					currentTileHealth = health;
				}

				// Look for stable glass (higher health value means safer ground)
				if (health > highestGlassHealth) {
					highestGlassHealth = health;
					// Compute world center position of this tile
					bestTileX = (gx + GRID_PADDING + 0.5) * TILE_SIZE;
					bestTileY = (gy + GRID_PADDING + 0.5) * TILE_SIZE;
				}
			}
		}
	}

	// --- STEP 3: EVASION VS. AGGRESSION DECISION MAKING ---
	// If the current tile is heavily degraded (health below 1.5), prioritize fleeing to safer ground.
	if (currentTileHealth < 1.5 && highestGlassHealth > currentTileHealth) {
		const escapeDx = bestTileX - bot.x;
		const escapeDy = bestTileY - bot.y;
		const escapeDist = Math.sqrt(escapeDx * escapeDx + escapeDy * escapeDy);

		if (escapeDist > 1) {
			targetDirX = escapeDx / escapeDist;
			targetDirY = escapeDy / escapeDist;
		}
	} 
	else if (closestEnemy) {
		// If standing on safe ground, engage the nearest enemy.
		const enemyDx = closestEnemy.x - bot.x;
		const enemyDy = closestEnemy.y - bot.y;
		const distanceToEnemy = Math.sqrt(minEnemyDistSq);

		// Calculate vector towards the enemy to pressure or align with them
		if (distanceToEnemy > 1) {
			targetDirX = enemyDx / distanceToEnemy;
			targetDirY = enemyDy / distanceToEnemy;
		}
	}

	// Discretize directional values into standard movement steps (-1, 0, or 1)
	const finalDx = Math.abs(targetDirX) > 0.3 ? Math.sign(targetDirX) : 0;
	const finalDy = Math.abs(targetDirY) > 0.3 ? Math.sign(targetDirY) : 0;

	// --- STEP 4: ROAR / PUSH LOGIC ---
	// Trigger a roar if an enemy is within effective push radius (e.g., within 450 pixels)
	// and the roar ability is ready off cooldown.
	let triggerRoar = false;
	const ROAR_TRIGGER_DISTANCE = 450;

	if (closestEnemy && minEnemyDistSq <= ROAR_TRIGGER_DISTANCE * ROAR_TRIGGER_DISTANCE) {
		if (bot.roarCooldown <= 0) {
			triggerRoar = true;
		}
	}

	// --- STEP 5: PACKET GENERATION ---
	// Only push movement updates if input states have changed since the last tick.
	if (finalDx !== data.lastDx || finalDy !== data.lastDy) {
		inputs.push({
			action: 'move',
			move: { dx: finalDx, dy: finalDy }
		});
		data.lastDx = finalDx;
		data.lastDy = finalDy;
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



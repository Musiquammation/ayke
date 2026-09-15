import { Fields } from "../../commons/Fields";
import { GMLavaBall } from "../../commons/gamemods/GMLavaBall";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-lavaball');

const { all, runner } = botActionNodeHelper<GMLavaBall, Data>();

// Define the exact phases used by the game to know when we can act
const PHASE_AIMING = 1; // Assuming 1 based on standard sequential enum, adjust if the game exports it
const THROW_DELAY = 1.5; // Wait 1.5 seconds into our turn before throwing

/**
 * Persistent state for the bot across game ticks.
 * Useful for caching decisions so we don't recalculate pathing/heuristics every frame.
 */
class Data {
	public hasThrownThisTurn: boolean = false;
	public targetX: number | null = null;
	public targetY: number | null = null;

	public resetTurnData() {
		this.hasThrownThisTurn = false;
		this.targetX = null;
		this.targetY = null;
	}
}

function dataConstructor(): Data {
	return new Data();
}

/**
 * Helper to determine if it is currently our turn and the game is waiting for our aim/throw.
 */
function isMyAimingTurn(game: GMLavaBall, playerIdx: number): boolean {
	const me = game.players[playerIdx];
	if (me.eliminated || !me.connected) {
		return false;
	}
	
	// We can only act if we are the current player and the game is in the aiming phase
	return game.currentPlayer === playerIdx && game.turnPhase === PHASE_AIMING;
}

/**
 * Helper to evaluate and find the safest, most progressive platform to jump to.
 * Uses a heuristic scoring system prioritizing reachable vertical gain.
 */
function evaluateBestPlatform(game: GMLavaBall): { x: number, y: number } | null {
	const ball = game.ball;
	let bestScore = -Infinity;
	let bestTarget: { x: number, y: number } | null = null;

	// The maximum realistic height we can throw based on gravity and speed
	const MAX_REACHABLE_HEIGHT = 800; 

	for (const platform of game.platforms) {
		const topOfPlatform = platform.y + platform.h / 2;
		
		// Skip platforms below us or slightly below us
		if (topOfPlatform <= ball.y + 10) {
			continue;
		}

		const deltaY = topOfPlatform - ball.y;
		const deltaX = Math.abs((platform.x + platform.w / 2) - ball.x);

		// Skip platforms that are impossibly high
		if (deltaY > MAX_REACHABLE_HEIGHT) {
			continue;
		}

		// Score heuristic: Reward vertical progress, penalize extreme horizontal distance
		// This ensures the bot climbs steadily rather than attempting risky, long horizontal lobs
		const score = (deltaY * 1.5) - (deltaX * 0.5);

		if (score > bestScore) {
			bestScore = score;
			// Aim for the center of the platform, slightly above it to account for ball radius
			bestTarget = {
				x: platform.x + platform.w / 2,
				y: topOfPlatform + 20 
			};
		}
	}

	return bestTarget;
}

/**
 * Helper to consistently format inputs exactly as required by the spec.
 */
function buildInput(actionName: 'aim' | 'throwBall', x: number, y: number): Fields {
	return {
		action: actionName,
		[actionName]: { x, y }
	};
}

/**
 * The main execution loop for the bot. Evaluates state and pushes actions.
 */
const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];

	// 1. Check if we have authority to act
	if (!isMyAimingTurn(game, playerIdx)) {
		// If it's not our turn, reset our cached state so we are ready for next time
		if (data.hasThrownThisTurn) {
			data.resetTurnData();
		}
		return [inputs, 'success'];
	}

	// 2. Prevent spamming inputs if we already locked in our throw
	if (data.hasThrownThisTurn) {
		return [inputs, 'success'];
	}

	// 3. Target Acquisition (Cached)
	if (data.targetX === null || data.targetY === null) {
		const target = evaluateBestPlatform(game);
		
		if (target) {
			data.targetX = target.x;
			data.targetY = target.y;
		} else {
			// Fallback: If no good platform is found, just aim straight up
			data.targetX = game.ball.x;
			data.targetY = game.ball.y + 500;
		}
	}

	// 4. Execution Delay & Input Generation
	// We wait a bit to allow obstacles to move and to simulate human "thinking" time
	const currentTurnTime = game.turnTimer;
	
	// Always send aim input to show intent to other players
	inputs.push(buildInput('aim', data.targetX!, data.targetY!));

	if (currentTurnTime > THROW_DELAY) {
		// Time is up, lock in the throw
		inputs.push(buildInput('throwBall', data.targetX!, data.targetY!));
		data.hasThrownThisTurn = true;
		logger.info(`Bot threw ball towards X:${data.targetX}, Y:${data.targetY}`);
	}

	return [inputs, 'success'];
});

const root = (function() {
	return all([method]);
})();

export default describeBot([
	{ root, data: dataConstructor }
]);

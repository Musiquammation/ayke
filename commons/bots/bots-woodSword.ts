import { Fields } from "../../commons/Fields";
import { GMWoodSword } from "../../commons/gamemods/GMWoodSword";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-woodSword');

const { all, runner } = botActionNodeHelper<GMWoodSword, Data>();

/*
 * ================================================================
 * CONSTANTS
 * ================================================================
 */


const {
	SWORD_SPEED,
	SWORD_SPAWN,
	TRUNK_RADIUS,
	SWORD_HITBOX_ANGLE,
	ROUND_TIME
} = GMWoodSword.DATA;


const TIME_OF_FLIGHT = (SWORD_SPAWN - TRUNK_RADIUS) / SWORD_SPEED;
const THROW_COOLDOWN = 0.2; 

// The ideal safety margin. Slightly larger than the strict engine hitbox
// to account for the trunk's acceleration which we don't fully predict.
const SAFE_MARGIN = SWORD_HITBOX_ANGLE + 0.1;

/*
 * ================================================================
 * BOT DATA
 * ================================================================
 */

class Data {
	lastThrowTimer: number = -1;
}

function dataConstructor(): Data {
	return new Data();
}

/*
 * ================================================================
 * HELPER METHODS
 * ================================================================
 */

/**
 * Normalizes an angle to the range [-PI, PI].
 */
function normalizeAngle(angle: number): number {
	let normalized = angle % (2 * Math.PI);
	if (normalized > Math.PI) {
		normalized -= 2 * Math.PI;
	} else if (normalized < -Math.PI) {
		normalized += 2 * Math.PI;
	}
	return normalized;
}

/**
 * Gathers the local angles of all swords that are either already 
 * clinging to the trunk or currently moving towards it.
 */
function getOccupiedAngles(game: GMWoodSword): number[] {
	const angles: number[] = [];

	for (const cs of game.clingingSwords) {
		angles.push(cs.angle);
	}

	for (const ms of game.movingSwords) {
		let distance = 0;
		let arrivalWorld = 0;

		if (ms.team === "red") {
			distance = Math.abs(ms.x - (-TRUNK_RADIUS));
			arrivalWorld = Math.PI;
		} else {
			distance = Math.abs(ms.x - TRUNK_RADIUS);
			arrivalWorld = 0;
		}

		const timeToHit = distance / SWORD_SPEED;
		const futureTrunkAngle = game.trunkAngle + game.trunkSpeed * timeToHit;
		const localAngle = normalizeAngle(arrivalWorld - futureTrunkAngle);
		angles.push(localAngle);
	}

	return angles;
}

/**
 * Calculates how much space is "missing" for a perfectly safe throw.
 * 
 * @returns 0 if the throw is completely safe. A higher number means 
 * the sword is closer to overlapping an existing sword.
 */
function getMissingSpace(targetAngle: number, occupiedAngles: number[], margin: number): number {
	if (occupiedAngles.length === 0) {
		return 0; // Completely empty trunk
	}

	let minDistance = Math.PI * 2;
	for (const angle of occupiedAngles) {
		const diff = Math.abs(normalizeAngle(targetAngle - angle));
		if (diff < minDistance) {
			minDistance = diff;
		}
	}

	// Return the deficit between our required margin and the actual available distance
	return Math.max(0, margin - minDistance);
}

/*
 * ================================================================
 * MAIN BOT BEHAVIOR
 * ================================================================
 */

const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const player = game.players[playerIdx];

	// 1. Check if the bot can throw (has swords and time is running)
	if (player.swordsLeft <= 0 || game.roundTimer <= 0) {
		return [inputs, 'success'];
	}

	// 2. Detect if a new round has started
	// If the game timer is higher than our last throw timer, the round reset to 30.
	if (data.lastThrowTimer !== -1 && game.roundTimer > data.lastThrowTimer) {
		data.lastThrowTimer = -1; // Reset our cooldown tracker for the new round
	}

	// 3. Enforce cooldown to prevent frame-perfect spamming
	if (data.lastThrowTimer !== -1 && (data.lastThrowTimer - game.roundTimer) < THROW_COOLDOWN) {
		return [inputs, 'success'];
	}

	// 4. Predict the exact local angle the sword will hit on the trunk
	const arrivalWorld = player.team === "red" ? Math.PI : 0;
	const futureTrunkAngle = game.trunkAngle + (game.trunkSpeed * TIME_OF_FLIGHT);
	const targetLocalAngle = normalizeAngle(arrivalWorld - futureTrunkAngle);

	// 5. Retrieve all angles currently targeted or occupied
	const occupiedAngles = getOccupiedAngles(game);

	// 6. Evaluate the safety of the throw (returns 0 if perfectly safe)
	const missingSpace = getMissingSpace(targetLocalAngle, occupiedAngles, SAFE_MARGIN);

	// 7. Deterministic risk assessment based on time left
	// timeFactor goes from 0 (at 30s left) to 1 (at 0s left)
	const timeFactor = 1 - (game.roundTimer / ROUND_TIME);

	// We tolerate more "missing space" (i.e. we accept a tighter fit) as time runs out.
	// At the very end of the round, we tolerate up to 90% of the safe margin being eaten up.
	const maxToleratedMissingSpace = SAFE_MARGIN * 0.9 * timeFactor;

	// If the space we are missing is within our tolerated threshold, we take the shot.
	// At the start of the round, maxTolerated is 0, so it ONLY shoots if missingSpace is 0 (perfectly safe).
	if (missingSpace <= maxToleratedMissingSpace) {
		inputs.push({ action: 'throw', throw: true });
		data.lastThrowTimer = game.roundTimer;
	}

	return [inputs, 'success'];
});

const root = (function() {
	return all([method]);
})();

export default describeBot(
	[{ root, data: dataConstructor }]
);
import { Fields } from "../../commons/Fields";
import { GMCrayzoll } from "../../commons/gamemods/GMCrayzoll";
import { getBestInArray } from "../../commons/util/getBestInArray";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-crayzoll');
// logger.setLevel('debug');

const { all, runner } = botActionNodeHelper<GMCrayzoll, Data>();

// Shortcut reference to game classes
const TYPES = GMCrayzoll.types;

// World and boundary constants derived from GMCrayzoll rules
const HALF_WIDTH = 1800;
const HALF_HEIGHT = 1012.5;
const SAFE_MARGIN_X = 400; // Keep distance from horizontal lethal edges
const BALL_GRAVITY = 500;

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

// ---------------------------------------------------------------------------
// Strategy Helper Methods
// ---------------------------------------------------------------------------

/**
 * Selects the optimal alive enemy to target.
 * Prefers enemies that are positioned close to screen edges (easier to knock out)
 * or close to the bot for higher accuracy.
 */
function findTargetEnemy(game: GMCrayzoll, self: InstanceType<typeof TYPES.Player>) {
	const enemies = game.players.filter(p => p.team !== self.team && p.isAlive());
	if (enemies.length === 0) return null;

	const idx = getBestInArray(enemies, (enemy) => {
		const distToCenter = Math.hypot(enemy.x, enemy.y);
		const distToSelf = Math.hypot(enemy.x - self.x, enemy.y - self.y);

		// Prioritize enemies already near boundary walls
		return distToCenter * 2.5 - distToSelf;
	}).index;

	return enemies[idx];
}



/**
 * Calculates ballistic intercept coordinates to hit an enemy with the ball.
 * Solves: dx^2 + (dy - 0.5 * g * t^2)^2 = (v * t)^2 for flight time t.
 */
function computeBallThrowTarget(
	game: GMCrayzoll,
	self: InstanceType<typeof TYPES.Player>,
	enemy: InstanceType<typeof TYPES.Player>
): { x: number; y: number } | null {
	const throwSpeed = game.getThrowSpeed(self);
	
	// Estimate initial flight time to predict enemy position
	const estDist = Math.hypot(enemy.x - self.x, enemy.y - self.y);
	const estTime = Math.max(0.05, estDist / throwSpeed);

	// Predicted target position based on current enemy velocity
	const targetX = enemy.x + enemy.vx * estTime;
	const targetY = enemy.y + enemy.vy * estTime;

	const dx = targetX - self.x;
	const dy = targetY - self.y;

	// Coefficients for quadratic equation in u = t^2
	const A = 0.25 * BALL_GRAVITY * BALL_GRAVITY;
	const B = -(throwSpeed * throwSpeed + BALL_GRAVITY * dy);
	const C = dx * dx + dy * dy;

	const discriminant = B * B - 4 * A * C;
	if (discriminant < 0) {
		// Out of ballistic reach; aim directly at predicted position
		return { x: targetX, y: targetY };
	}

	const sqrtDisc = Math.sqrt(discriminant);
	let u = (-B - sqrtDisc) / (2 * A);
	if (u <= 0) {
		u = (-B + sqrtDisc) / (2 * A);
	}

	if (u <= 0) return { x: targetX, y: targetY };

	const flightTime = Math.sqrt(u);
	const vx = dx / flightTime;
	const vy = (dy - 0.5 * BALL_GRAVITY * flightTime * flightTime) / flightTime;

	// Aim target relative to player position
	return {
		x: self.x + vx,
		y: self.y + vy
	};
}

/**
 * Evaluates whether an unheld ball is dangerous (e.g. thrown by an enemy at high speed).
 * Returns true if the bot should dodge rather than attempt to catch it.
 */
function evaluateBallDanger(
	game: GMCrayzoll,
	self: InstanceType<typeof TYPES.Player>
): { isDangerous: boolean; dodgeX: number } {
	const ball = game.ball;
	if (ball.grabber >= 0) {
		return { isDangerous: false, dodgeX: 0 };
	}

	const prevGrabber = ball.prevGrabber >= 0 ? game.players[ball.prevGrabber] : null;
	const isEnemyBall = prevGrabber !== null && prevGrabber.team !== self.team;

	if (!isEnemyBall) {
		return { isDangerous: false, dodgeX: 0 };
	}

	const ballSpeed = ball.speed();
	const dist = Math.hypot(ball.x - self.x, ball.y - self.y);

	// A fast ball thrown by an enemy will inflict massive knockback if touched
	if (ballSpeed > 900 && dist < 500) {
		const dodgeX = self.x > 0 ? -1 : 1;
		return { isDangerous: true, dodgeX };
	}

	return { isDangerous: false, dodgeX: 0 };
}

/**
 * Finds the highest-value available gem based on distance and proximity to center.
 */
function findBestGem(
	game: GMCrayzoll,
	self: InstanceType<typeof TYPES.Player>
): InstanceType<typeof TYPES.Gem> | null {
	if (game.gems.length === 0) return null;

	const idx = getBestInArray(game.gems, (gem) => {
		const dist = Math.hypot(gem.x - self.x, gem.y - self.y);
		return -dist;
	}).index;

	return game.gems[idx];
}


/**
 * Calculates movement controls (direction, jump, fast-fall) required to reach a target coordinate.
 */
function computeMovementInputs(
	self: InstanceType<typeof TYPES.Player>,
	targetX: number,
	targetY: number,
	allowJump: boolean
): { dir: number; wantJump: boolean; wantDown: boolean } {
	const dx = targetX - self.x;
	const dy = targetY - self.y;

	let dir = 0;
	if (dx > 35) dir = 1;
	else if (dx < -35) dir = -1;

	// Jump if target is significantly higher
	const wantJump = allowJump && dy < -120 && Math.abs(dx) < 500;

	// Activate pushDown if target is lower
	const wantDown = dy > 120;

	return { dir, wantJump, wantDown };
}

/**
 * Ensures the target coordinate keeps the bot within safe arena boundaries.
 */
function clampTargetToSafeZone(targetX: number, targetY: number): { x: number; y: number } {
	const minX = -HALF_WIDTH + SAFE_MARGIN_X;
	const maxX = HALF_WIDTH - SAFE_MARGIN_X;
	return {
		x: Math.max(minX, Math.min(maxX, targetX)),
		y: Math.max(-HALF_HEIGHT + 200, Math.min(HALF_HEIGHT - 200, targetY))
	};
}

// ---------------------------------------------------------------------------
// Bot Decision Loop
// ---------------------------------------------------------------------------

const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const self = game.players[playerIdx];

	if (!self) {
		return [inputs, 'success'];
	}

	let targetX = 0;
	let targetY = 0;
	let allowJump = true;
	let aimTarget: { x: number; y: number } | null = null;

	const isBallHolder = game.ball.grabber === playerIdx;
	const isFreeBall = game.ball.grabber < 0;

	// 1. BEHAVIOR: Bot is currently holding the ball
	if (isBallHolder) {
		const enemy = findTargetEnemy(game, self);
		if (enemy) {
			aimTarget = computeBallThrowTarget(game, self, enemy);
		}
		// Stay positioned near center stage while holding the ball
		const safePos = clampTargetToSafeZone(0, 0);
		targetX = safePos.x;
		targetY = safePos.y;
		allowJump = false; // Jumping is disabled while holding ball in game rules
	} 
	// 2. BEHAVIOR: Ball is free in the arena
	else if (isFreeBall) {
		const danger = evaluateBallDanger(game, self);
		
		if (danger.isDangerous) {
			// Evade high-speed incoming enemy ball
			targetX = self.x + danger.dodgeX * 400;
			targetY = self.y - 200;
		} else {
			// Chase and grab the free ball
			targetX = game.ball.x;
			targetY = game.ball.y;
		}
	} 
	// 3. BEHAVIOR: Ball is held by another player (Teammate or Enemy)
	else {
		const bestGem = findBestGem(game, self);
		if (bestGem) {
			// Collect gems to build throwing power for the team
			targetX = bestGem.x;
			targetY = bestGem.y;
		} else {
			// Retreat to stage center to avoid being easily knocked out
			const safePos = clampTargetToSafeZone(0, 0);
			targetX = safePos.x;
			targetY = safePos.y;
		}
	}

	// Calculate movement intents
	const move = computeMovementInputs(self, targetX, targetY, allowJump);

	// --- Process Movement Inputs ---
	if (move.dir !== data.lastDir) {
		if (move.dir === 1) inputs.push(INPUTS.right);
		else if (move.dir === -1) inputs.push(INPUTS.left);
		else inputs.push(INPUTS.stop);
		data.lastDir = move.dir;
	}

	if (move.wantJump) {
		inputs.push(INPUTS.jump);
	}

	if (move.wantDown !== data.isDown) {
		inputs.push(move.wantDown ? INPUTS.downOn : INPUTS.downOff);
		data.isDown = move.wantDown;
	}

	// --- Process Aiming / Throw Inputs ---
	if (aimTarget) {
		// Only re-send throwTarget if coordinates changed noticeably
		if (!data.isAiming || Math.abs(aimTarget.x - data.lastTargetX) > 10 || Math.abs(aimTarget.y - data.lastTargetY) > 10) {
			inputs.push({
				action: 'throwTarget',
				throwTarget: { x: aimTarget.x, y: aimTarget.y }
			});
			data.isAiming = true;
			data.lastTargetX = aimTarget.x;
			data.lastTargetY = aimTarget.y;
		}
	} else if (data.isAiming) {
		inputs.push(INPUTS.throwOff);
		data.isAiming = false;
	}

	return [inputs, 'success'];
});

const root = (function() {
	return all([method]);
})();

export default describeBot(
	[{ root, data: dataConstructor }]
);

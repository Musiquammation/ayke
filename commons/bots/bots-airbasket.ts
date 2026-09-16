import { Fields } from "../Fields";
import { GMAirBasket } from "../gamemods/GMAirBasket";
import { getBestInArray } from "../util/getBestInArray";
import { norm2 } from "../util/norm2";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-airbasket');

const { all, runner } = botActionNodeHelper<GMAirBasket, Data>();

type Player = InstanceType<typeof GMAirBasket.types.Player>;
type Bucket = InstanceType<typeof GMAirBasket.types.Bucket>;
type Ball = InstanceType<typeof GMAirBasket.types.Ball>;

/**
 * ================================================================
 * STRATEGIC BOT OVERVIEW (HUMAN-LIKE GAMEPLAY)
 * ================================================================
 * 
 * Instead of purely reactive tactics (chasing the ball blindly), this 
 * bot implements higher-level team strategies: Anticipation, Spacing, 
 * and Zone Defense.
 * 
 * Key Human-Like Behaviors Introduced:
 * 
 * 1. ANTICIPATION (Reading the play):
 *    Humans don't run to where a flying ball IS, they run to where 
 *    it WILL BE. When the ball is free, the bot calculates a simple 
 *    parabolic trajectory to intercept it upon landing.
 * 
 * 2. SPACING (Offensive Spread):
 *    If an ally has the ball, bots won't swarm the exact same bucket.
 *    They penalize buckets that are already covered by teammates, 
 *    naturally spreading across the court to provide multiple passing 
 *    options and stretch the enemy defense.
 * 
 * 3. ZONE DEFENSE (Protecting the paint):
 *    When an enemy has the ball, only the closest defender presses them.
 *    The others fall back to protect the most vulnerable (closest) 
 *    buckets. This cuts off passing lanes and prevents easy dunks.
 * 
 * 4. IMPERFECTION & MOMENTUM (Deadzones):
 *    Added horizontal deadzones so the bot doesn't jitter left/right 
 *    pixel-perfectly, mimicking a human's analog movement.
 * ================================================================
 */

const INPUTS = {
	jump: { jump: {}, action: 'jump' },
	downOn: { downOn: {}, action: 'downOn' },
	downOff: { downOff: {}, action: 'downOff' },
	left: { left: {}, action: 'left' },
	right: { right: {}, action: 'right' },
	stop: { stop: {}, action: 'stop' },
	throwOff: { throwOff: {}, action: 'throwOff' },
};

const STATS = {
	FOCUS_Y: 200,    
	JUMP_VY: 600,    
	DUNK_RANGE: 260,
	THREAT_RADIUS: 450, // Slightly expanded to account for human anticipation
	DEADZONE_X: 20,     // Prevents pixel-perfect robotic jittering
	INTERCEPT_TIME: 0.6 // Time in seconds to look ahead for ball prediction
};
const DUNK_RANGE_SQ = STATS.DUNK_RANGE * STATS.DUNK_RANGE;
const THREAT_RADIUS_SQ = STATS.THREAT_RADIUS * STATS.THREAT_RADIUS;

class Data {
	private lastAvoidOOBTick = 0;
	private dir = 0;
	private pushDownStates: Record<number, boolean> = {};

	/**
	 * HARD BOUNDS SAFETY SYSTEM:
	 * Prevents players from dying or going out of bounds.
	 * Overrides all tactical movement if dangerously close to limits.
	 */
	avoidOOB(game: GMAirBasket, player: Player, inputs: Fields[]): { overrideX: boolean; nearBottom: boolean } {
		if (game.internalFrameTick === this.lastAvoidOOBTick) {
			const nearBottom = player.y >= GMAirBasket.DATA.Y_LIMIT - 650;
			return { overrideX: this.isNearXBounds(player), nearBottom };
		}
		this.lastAvoidOOBTick = game.internalFrameTick;

		// Large safety margins to counter heavy momentum and gravity acceleration
		const MARGIN_X = 500;
		const MARGIN_Y_BOTTOM = 650;
		const MARGIN_Y_TOP = 300;

		let overrideX = false;

		// --- 1. HORIZONTAL SAFETY (X BOUNDS) ---
		if (player.x >= GMAirBasket.DATA.X_LIMIT - MARGIN_X) {
			this.goLeft(inputs);
			overrideX = true;
		} else if (player.x <= -GMAirBasket.DATA.X_LIMIT + MARGIN_X) {
			this.goRight(inputs);
			overrideX = true;
		}

		// --- 2. VERTICAL SAFETY (Y BOUNDS & PIT DEATH) ---
		const nearBottom = player.y >= GMAirBasket.DATA.Y_LIMIT - MARGIN_Y_BOTTOM;

		if (nearBottom) {
			// Hard cut-off: kill all active push-down flags immediately
			this.pushDownStates[0] = false;
			this.pushDownStates[1] = false;
			inputs.push(INPUTS.downOff);

			// Spam jump aggressively to overcome downward velocity
			inputs.push(INPUTS.jump);
		} else if (player.y <= -GMAirBasket.DATA.Y_LIMIT + MARGIN_Y_TOP) {
			// Too high: push down to stay in play area
			this.pushDown(true, 0, inputs);
		} else {
			this.pushDown(false, 0, inputs);
		}

		return { overrideX, nearBottom };
	}

	private isNearXBounds(player: Player): boolean {
		const MARGIN_X = 500;
		return (
			player.x >= GMAirBasket.DATA.X_LIMIT - MARGIN_X ||
			player.x <= -GMAirBasket.DATA.X_LIMIT + MARGIN_X
		);
	}

	pushDown(active: boolean, slot: number, inputs: Fields[]) {
		if (active) {
			const wasIdle = Object.values(this.pushDownStates).every(v => !v);
			this.pushDownStates[slot] = true;
			if (wasIdle) inputs.push(INPUTS.downOn);
		} else if (this.pushDownStates[slot]) {
			this.pushDownStates[slot] = false;
			if (Object.values(this.pushDownStates).every(v => !v)) inputs.push(INPUTS.downOff);
		}
	}

	goLeft(inputs: Fields[]) { if (this.dir === -1) return; this.dir = -1; inputs.push(INPUTS.left); }
	goRight(inputs: Fields[]) { if (this.dir === 1) return; this.dir = 1; inputs.push(INPUTS.right); }
	goStop(inputs: Fields[]) { if (this.dir === 0) return; this.dir = 0; inputs.push(INPUTS.stop); }

	/**
	 * Steers towards target, yielding control if safety overrides are active.
	 */
	reach(
		player: Player,
		target: { x: number; y: number },
		inputs: Fields[],
		safety: { overrideX: boolean; nearBottom: boolean }
	) {
		const dx = target.x - player.x;
		const dy = target.y - player.y;

		// Only apply horizontal tactical steering if horizontal safety override is inactive
		if (!safety.overrideX) {
			if (dx < -STATS.DEADZONE_X) this.goLeft(inputs);
			else if (dx > STATS.DEADZONE_X) this.goRight(inputs);
			else this.goStop(inputs);
		}

		// Vertical steering with absolute ban on pushDown near the pit
		if (dy < 0) {
			if (player.vy > -STATS.JUMP_VY) inputs.push(INPUTS.jump);
			this.pushDown(false, 1, inputs);
		} else if (dy > STATS.FOCUS_Y && !safety.nearBottom) {
			this.pushDown(true, 1, inputs);
		} else {
			this.pushDown(false, 1, inputs);
		}
	}

	predictBallLocation(ball: Ball): { x: number; y: number } {
		const t = STATS.INTERCEPT_TIME;
		const predictedX = ball.x + (ball.vx * t);
		const predictedY = ball.y + (ball.vy * t) + (0.5 * GMAirBasket.DATA.GRAVITY * t * t);
		
		// Clamp predictions strictly inside safe limits (margin of 600px)
		const SAFE_X = GMAirBasket.DATA.X_LIMIT - 600;
		const SAFE_Y = GMAirBasket.DATA.Y_LIMIT - 700;

		return {
			x: Math.max(-SAFE_X, Math.min(SAFE_X, predictedX)),
			y: Math.max(-SAFE_Y, Math.min(SAFE_Y, predictedY))
		};
	}

	isGuardedByOpponent(game: GMAirBasket, x: number, y: number, selfTeam: 'red' | 'blue', radiusSq: number) {
		for (const p of game.players) {
			if (p.team === selfTeam || !p.isAlive()) continue;
			if (norm2(p.x - x, p.y - y) <= radiusSq) return true;
		}
		return false;
	}

	findStrategicBucket(game: GMAirBasket, player: Player, selfTeam: 'red' | 'blue') {
		const u = getBestInArray(game.buckets, (b: Bucket) => {
			if (b.team !== null) return -Infinity;
			let score = -norm2(b.x - player.x, b.y - player.y);
			
			for (const p of game.players) {
				if (p === player || p.team !== selfTeam || !p.isAlive()) continue;
				const allyDistSq = norm2(b.x - p.x, b.y - p.y);
				if (allyDistSq < -score) {
					score -= 10000000;
				}
			}
			return score;
		});
		if (!Number.isFinite(u.score)) return null;
		return { bucket: game.buckets[u.index], index: u.index, distSq: -u.score };
	}

	findSafeBucket(game: GMAirBasket, player: Player, selfTeam: 'red' | 'blue') {
		const u = getBestInArray(game.buckets, (b: Bucket) => {
			if (b.team !== null) return -Infinity;
			if (this.isGuardedByOpponent(game, b.x, b.y, selfTeam, THREAT_RADIUS_SQ)) return -Infinity;
			return -norm2(b.x - player.x, b.y - player.y);
		});
		if (!Number.isFinite(u.score)) return null;
		return { bucket: game.buckets[u.index], index: u.index };
	}

	findOpenTeammate(game: GMAirBasket, selfIdx: number, selfTeam: 'red' | 'blue') {
		let best: { mate: Player; index: number } | null = null;
		let bestScore = -Infinity;

		for (let idx = 0; idx < game.players.length; idx++) {
			if (idx === selfIdx || idx === game.ball.grabber) continue;
			const mate = game.players[idx];
			if (mate.team !== selfTeam || !mate.isAlive()) continue;
			if (this.isGuardedByOpponent(game, mate.x, mate.y, selfTeam, THREAT_RADIUS_SQ)) continue;

			const u = getBestInArray(game.buckets, (b: Bucket) => b.team === null ? -norm2(b.x - mate.x, b.y - mate.y) : -Infinity);
			const score = Number.isFinite(u.score) ? u.score : 0;
			
			if (score > bestScore) {
				bestScore = score;
				best = { mate, index: idx };
			}
		}
		return best;
	}
}

function dataConstructor(): Data {
	return new Data();
}

const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const player = game.players[playerIdx];
	const selfTeam = player.team;

	// Execute safety check first and capture active overrides
	const safety = data.avoidOOB(game, player, inputs);

	let threwThisTick = false;

	let amIClosestToBall = true;
	const myDistToBallSq = norm2(game.ball.x - player.x, game.ball.y - player.y);
	for (const p of game.players) {
		if (p === player || p.team !== selfTeam || !p.isAlive()) continue;
		if (norm2(game.ball.x - p.x, game.ball.y - p.y) < myDistToBallSq) {
			amIClosestToBall = false;
			break;
		}
	}

	if (game.ball.grabber === playerIdx) {
		// ROLE: CARRIER
		const nearest = data.findStrategicBucket(game, player, selfTeam);

		if (nearest && nearest.distSq <= DUNK_RANGE_SQ) {
			data.reach(player, nearest.bucket, inputs, safety);
		} else {
			const apexReached = player.vy >= -100; 
			const safe = data.findSafeBucket(game, player, selfTeam);

			if (safe && apexReached) {
				inputs.push({ throwTarget: { x: safe.bucket.x, y: safe.bucket.y }, action: 'throwTarget' });
				threwThisTick = true;
			} else {
				const mate = data.findOpenTeammate(game, playerIdx, selfTeam);

				if (mate && apexReached) {
					inputs.push({ throwTarget: { x: mate.mate.x, y: mate.mate.y }, action: 'throwTarget' });
					threwThisTick = true;
				} else if (nearest) {
					data.reach(player, nearest.bucket, inputs, safety);
				}
			}
		}
	} else if (game.ball.grabber >= 0) {
		const grabber = game.players[game.ball.grabber];

		if (grabber.team === selfTeam) {
			// ROLE: WINGER
			const target = data.findStrategicBucket(game, player, selfTeam);
			if (target) data.reach(player, target.bucket, inputs, safety);
		} else {
			// ROLE: DEFENDER
			if (amIClosestToBall) {
				data.reach(player, grabber, inputs, safety);
			} else {
				const vulnerableBucket = getBestInArray(game.buckets, (b) => {
					return b.team === null ? -norm2(b.x - grabber.x, b.y - grabber.y) : -Infinity;
				});
				
				if (Number.isFinite(vulnerableBucket.score)) {
					const targetBucket = game.buckets[vulnerableBucket.index];
					data.reach(player, { x: targetBucket.x, y: targetBucket.y - 150 }, inputs, safety);
				} else {
					data.reach(player, grabber, inputs, safety);
				}
			}
		}
	} else {
		// ROLE: CHASER
		if (amIClosestToBall) {
			const distSq = norm2(game.ball.x - player.x, game.ball.y - player.y);
			
			// Switch to direct pursuit when close enough to guarantee grab
			if (distSq < 400 * 400) {
				data.reach(player, game.ball, inputs, safety);
			} else {
				const predictedLocation = data.predictBallLocation(game.ball);
				data.reach(player, predictedLocation, inputs, safety);
			}
		} else {
			const transitionTarget = data.findStrategicBucket(game, player, selfTeam);
			if (transitionTarget) data.reach(player, transitionTarget.bucket, inputs, safety);
		}
	}

	if (!threwThisTick) {
		inputs.push(INPUTS.throwOff);
	}

	return [inputs, 'success'];
});

const root = all([method]);

export default describeBot(
	[{root, data: dataConstructor}]
);
import { Fields } from "../Fields";
import { GMAirBasket } from "../gamemods/GMAirBasket";
import { getBestInArray } from "../util/getBestInArray";
import { norm2 } from "../util/norm2";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-airbasket');
// logger.setLevel('debug');

const { all, runner } = botActionNodeHelper<GMAirBasket, Data>();

type Player = InstanceType<typeof GMAirBasket.types.Player>;
type Bucket = InstanceType<typeof GMAirBasket.types.Bucket>;

/**
 * ================================================================
 * BOT STRATEGY OVERVIEW
 * ================================================================
 *
 * Goal: carry/throw the ball into an available (unclaimed) bucket.
 *
 * Two hard rules from the game engine drive this whole strategy:
 *
 *   - A player CANNOT JUMP while currently holding the ball
 *     (`ball.grabber === playerIdx`). This matters for the DUNK
 *     behaviour below: reaching a bucket that sits above us while
 *     we're holding the ball may be impossible without a jump.
 *
 *   - Once a player THROWS the ball, they cannot re-grab it
 *     immediately afterwards (outside of the "grabber infinite" /
 *     "sudden death" end-game phases). ANY other player - ally or
 *     opponent - who touches the flying ball becomes the new
 *     grabber. A throw is therefore a one-way commitment: once
 *     released, we have no more control over it.
 *
 * Because a throw can be intercepted, a holder only really has
 * three sensible things to do with the ball, evaluated in this
 * priority order:
 *
 *   1. DUNK  - An available bucket is close enough to just walk
 *              onto while still holding the ball. This scores
 *              immediately (see `playerTouchBucket` in the game
 *              code) with zero mid-air interception risk. Always
 *              the best option when available.
 *
 *   2. SHOOT - Throw at an available bucket from range, but only
 *              if no opponent is standing close enough to it to
 *              likely intercept the flying ball ("guarded").
 *
 *   3. PASS  - If every reachable bucket is guarded, throw to an
 *              open (unguarded) teammate instead, so *they* get a
 *              cleaner look at scoring next.
 *
 * If none of the three is currently safe, we do NOT throw blindly
 * - we just keep moving towards the nearest bucket and wait for an
 * opening (a defender to move away, an ally to get free, etc.).
 *
 * When we do NOT hold the ball, we pick one of three roles instead:
 *
 *   - CHASE   : the ball is free -> go grab it.
 *   - SUPPORT : a teammate holds it -> get open near an unguarded
 *               bucket so we're a good pass target.
 *   - DEFEND  : an opponent holds it -> press them to make their
 *               eventual throw harder to place safely.
 *
 * All roles are re-evaluated every single tick, since possession
 * changes constantly in this game.
 * ================================================================
 */

/** Static "keyboard-like" inputs, reused every tick to avoid re-allocating. */
const INPUTS = {
	jump: { jump: {}, action: 'jump' },
	downOn: { downOn: {}, action: 'downOn' },
	downOff: { downOff: {}, action: 'downOff' },
	left: { left: {}, action: 'left' },
	right: { right: {}, action: 'right' },
	stop: { stop: {}, action: 'stop' },
	throwOff: { throwOff: {}, action: 'throwOff' },
};

/** Tunable bot parameters - all distances are kept squared where possible to avoid sqrt(). */
const STATS = {
	FOCUS_Y: 200,   // vertical slack before we start dashing down towards a target
	JUMP_VY: 600,   // don't spam-jump if we're already rising faster than this

	// If a free bucket is within this range while we hold the ball, just
	// walk onto it (a "dunk") instead of risking a throw.
	DUNK_RANGE: 260,

	// A bucket or teammate is considered "guarded" if an opponent is
	// standing within this range of it - throwing there risks a mid-air
	// interception.
	THREAT_RADIUS: 380,
};
const DUNK_RANGE_SQ = STATS.DUNK_RANGE * STATS.DUNK_RANGE;
const THREAT_RADIUS_SQ = STATS.THREAT_RADIUS * STATS.THREAT_RADIUS;

class Data {
	private lastAvoidOOBTick = 0;
	private dir = 0;
	private pushDownStates: Record<number, boolean> = {};

	// ------------------------------------------------------------------
	// Generic movement primitives (safety + steering). These don't know
	// anything about baskets/balls - just "how do I move towards a point".
	// ------------------------------------------------------------------

	/** Keeps the bot away from the level's out-of-bounds edges. Runs once per game tick. */
	avoidOOB(game: GMAirBasket, player: Player, inputs: Fields[]) {
		if (game.internalFrameTick === this.lastAvoidOOBTick) return; // already handled this tick
		const LIMIT = 150;

		if (player.y <= -GMAirBasket.DATA.Y_LIMIT + LIMIT) {
			this.pushDown(true, 0, inputs); // too high -> come back down
		} else {
			this.pushDown(false, 0, inputs);
		}
		if (player.y >= GMAirBasket.DATA.Y_LIMIT - LIMIT) {
			inputs.push(INPUTS.jump); // too low -> bounce back up
		}
		this.lastAvoidOOBTick = game.internalFrameTick;
	}

	/**
	 * Multiple callers (avoidOOB uses slot 0, reach() uses slot 1) may want
	 * to dash down at the same time; we only emit downOn/downOff when the
	 * *combined* state actually changes, to avoid spamming redundant inputs.
	 */
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
	 * Steers the player towards an arbitrary (x, y) point: left/right to
	 * close the horizontal gap, jump if the target is above us, dash down
	 * if it's clearly below. Works for chasing the ball, a bucket, an
	 * opponent or a teammate alike - it only needs x/y.
	 *
	 * NOTE: while we're holding the ball, the game silently ignores jump
	 * inputs (you can't jump with the ball). That means a bucket sitting
	 * above us while dunking may be unreachable this way - acceptable
	 * limitation given the bucket layout is mostly on a few horizontal
	 * bands.
	 */
	reach(player: Player, target: { x: number; y: number }, inputs: Fields[]) {
		const dx = target.x - player.x;
		const dy = target.y - player.y;

		if (dx < -1) this.goLeft(inputs);
		else if (dx > 1) this.goRight(inputs);
		else this.goStop(inputs);

		if (dy < 0) {
			// Target is above us: hop towards it (unless already rising fast).
			if (player.vy > -STATS.JUMP_VY) inputs.push(INPUTS.jump);
			this.pushDown(false, 1, inputs);
		} else if (dy > STATS.FOCUS_Y) {
			// Target is clearly below us: dash down to close the gap faster.
			this.pushDown(true, 1, inputs);
		} else {
			this.pushDown(false, 1, inputs);
		}
	}

	// ------------------------------------------------------------------
	// Game-state analysis helpers - these are what actually implement
	// the DUNK / SHOOT / PASS decision tree described above.
	// ------------------------------------------------------------------

	/** Is any *alive opponent* of `selfTeam` standing within `radiusSq` of (x, y)? */
	isGuardedByOpponent(game: GMAirBasket, x: number, y: number, selfTeam: 'red' | 'blue', radiusSq: number) {
		for (const p of game.players) {
			if (p.team === selfTeam) continue; // teammates can't "steal" from us on purpose here
			if (!p.isAlive()) continue;
			if (norm2(p.x - x, p.y - y) <= radiusSq) return true;
		}
		return false;
	}

	/** Closest bucket that hasn't been claimed yet, ignoring how dangerous it is. Used for DUNK range checks and as a last-resort fallback target. */
	findNearestBucket(game: GMAirBasket, player: Player) {
		const u = getBestInArray(game.buckets, (b: Bucket) => {
			if (b.team !== null) return -Infinity; // already claimed, skip
			return -norm2(b.x - player.x, b.y - player.y);
		});
		if (!Number.isFinite(u.score)) return null; // no bucket left at all
		return { bucket: game.buckets[u.index], index: u.index, distSq: -u.score };
	}

	/**
	 * Closest bucket that is BOTH available and currently unguarded.
	 * This is what we throw at for the SHOOT option - throwing at a
	 * guarded bucket is how you hand the ball straight to the defense.
	 */
	findSafeBucket(game: GMAirBasket, player: Player, selfTeam: 'red' | 'blue') {
		const u = getBestInArray(game.buckets, (b: Bucket) => {
			if (b.team !== null) return -Infinity;
			if (this.isGuardedByOpponent(game, b.x, b.y, selfTeam, THREAT_RADIUS_SQ)) return -Infinity;
			return -norm2(b.x - player.x, b.y - player.y);
		});
		if (!Number.isFinite(u.score)) return null;
		return { bucket: game.buckets[u.index], index: u.index };
	}

	/**
	 * Best teammate to PASS to when no bucket is safe to shoot at
	 * directly: must be alive, not already holding the ball, and
	 * unguarded (never pass into a contested teammate - that's just
	 * gifting the ball to the defense one step later). Among the valid
	 * candidates we prefer whoever is closest to an available bucket,
	 * since they'll be best placed to follow up with their own
	 * dunk/shot.
	 */
	findOpenTeammate(game: GMAirBasket, selfIdx: number, selfTeam: 'red' | 'blue') {
		let best: { mate: Player; index: number } | null = null;
		let bestScore = -Infinity;

		for (let idx = 0; idx < game.players.length; idx++) {
			if (idx === selfIdx || idx === game.ball.grabber) continue;
			const mate = game.players[idx];
			if (mate.team !== selfTeam || !mate.isAlive()) continue;
			if (this.isGuardedByOpponent(game, mate.x, mate.y, selfTeam, THREAT_RADIUS_SQ)) continue;

			const nearestBucket = this.findNearestBucket(game, mate);
			const score = nearestBucket ? -nearestBucket.distSq : 0; // closer-to-a-bucket teammate wins
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

// ========================================================================
// Main per-tick decision loop. One call per bot per frame.
// ========================================================================
const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const player = game.players[playerIdx];
	const selfTeam = player.team;

	// Safety first, regardless of role.
	data.avoidOOB(game, player, inputs);

	let threwThisTick = false;

	if (game.ball.grabber === playerIdx) {
		// ====================================================================
		// ROLE: ATTACK - we are holding the ball.
		// Priority: 1) DUNK  2) SHOOT (safe bucket)  3) PASS (open mate)  4) STALL
		// ====================================================================
		const nearest = data.findNearestBucket(game, player);

		if (nearest && nearest.distSq <= DUNK_RANGE_SQ) {
			// --- 1) DUNK -------------------------------------------------
			// Close enough to just walk it in: guaranteed score, no risk.
			logger.debug(`#${playerIdx} dunking bucket ${nearest.index}`);
			data.reach(player, nearest.bucket, inputs);
		} else {
			// Only release a throw once we're falling/level (vy >= 0), so the
			// resulting arc is predictable instead of being thrown mid-jump.
			const readyToThrow = player.vy >= 0;
			const safe = data.findSafeBucket(game, player, selfTeam);

			if (safe && readyToThrow) {
				// --- 2) SHOOT ------------------------------------------------
				logger.debug(`#${playerIdx} shooting at bucket ${safe.index}`);
				inputs.push({ throwTarget: { x: safe.bucket.x, y: safe.bucket.y }, action: 'throwTarget' });
				threwThisTick = true;
			} else {
				const mate = data.findOpenTeammate(game, playerIdx, selfTeam);

				if (mate && readyToThrow) {
					// --- 3) PASS ---------------------------------------------
					logger.debug(`#${playerIdx} passing to #${mate.index}`);
					inputs.push({ throwTarget: { x: mate.mate.x, y: mate.mate.y }, action: 'throwTarget' });
					threwThisTick = true;
				} else if (nearest) {
					// --- 4) STALL ----------------------------------------------
					// Nothing safe to do yet: don't throw blindly into a
					// contested bucket/teammate. Keep closing the distance to
					// the nearest bucket while we wait for an opening.
					data.reach(player, nearest.bucket, inputs);
				}
			}
		}
	} else if (game.ball.grabber >= 0) {
		const grabber = game.players[game.ball.grabber];

		if (grabber.team === selfTeam) {
			// ====================================================================
			// ROLE: SUPPORT - a teammate has the ball.
			// Get open near an unguarded bucket so we're a good pass target.
			// ====================================================================
			const target = data.findSafeBucket(game, player, selfTeam) ?? data.findNearestBucket(game, player);
			if (target) data.reach(player, target.bucket, inputs);
		} else {
			// ====================================================================
			// ROLE: DEFEND - an opponent has the ball.
			// We can't steal it directly (only a *free* ball can be grabbed), so
			// the best we can do is press the carrier to make their throw
			// harder to place, and be close enough to contest it once released.
			// ====================================================================
			data.reach(player, grabber, inputs);
		}
	} else {
		// ====================================================================
		// ROLE: CHASE - the ball is free, go grab it.
		// ====================================================================
		data.reach(player, game.ball, inputs);
	}

	if (!threwThisTick) {
		// Always clear any stale throw target when we're not actively
		// throwing this tick. Without this, an old target left over from a
		// previous hold could trigger an unwanted instant re-throw the
		// moment we grab the ball again.
		inputs.push(INPUTS.throwOff);
	}

	return [inputs, 'success'];
});

const root = all([method]);


export default describeBot(
	[{root, data: dataConstructor}]
);



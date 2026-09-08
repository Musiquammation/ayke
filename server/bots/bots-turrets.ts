import { Fields } from "../../commons/Fields";
import { GMTurrets } from "../../commons/gamemods/GMTurrets";
import { appendBots, botActionNodeHelper } from "../Bot";
import { getLogger } from "../Logger";

const logger = getLogger('bots-turrets');
// logger.setLevel('debug');

const {all, first, loop, runner} = botActionNodeHelper<GMTurrets, Data>();

// Kept for parity with the other bot files (exposes the server's Player /
// Turret classes and their static constants, e.g. TYPES.Player.RADIUS).
const TYPES = GMTurrets.types;

// ---------------------------------------------------------------------------
// Type aliases pulled structurally off GMTurrets, so we don't need the
// (unexported) Player/Turret/ItemInMap classes to be imported directly.
// ---------------------------------------------------------------------------
type PlayerT = GMTurrets['players'][number];
type TurretT = GMTurrets['turrets'][number];
type ItemT = GMTurrets['itemsInMap'][number];

// ---------------------------------------------------------------------------
// Constants mirrored from the server implementation (turrets.ts / turrets.md).
// They aren't exposed through GMTurrets.types, so we keep local copies here.
// ---------------------------------------------------------------------------
const TURRET_HP = 1200;            // Turret.hp max, see turrets.md §2.1.
const TURRET_RADIUS = 1440;        // Turret kill radius / bullet travel distance.
const ITEM_PICKUP_RADIUS = 100;    // ItemInMap.RADIUS(40) + Player.RADIUS(60).

const RETREAT_HP_FRACTION = 0.35;  // Below this HP fraction, prefer to disengage.
const DANGER_RANGE = 1400;         // Distance under which a low-HP bot feels threatened.
const ENGAGE_RANGE = 1700;         // Distance under which an enemy player is worth fighting.
const PREFERRED_COMBAT_RANGE = 900;// Distance the bot tries to keep from its target.
const MIN_COMBAT_RANGE = 500;      // Distance under which the bot backs off from an enemy.


/**
 * Per-bot memory that persists across frames.
 */
class Data {
	/** Index into game.turrets of the turret currently being pushed, or null. */
	lockedTurretIdx: number | null = null;
}

function dataConstructor(): Data {
	return new Data();
}


// ---------------------------------------------------------------------------
// Small geometry helpers.
// ---------------------------------------------------------------------------

/** Euclidean distance between two points. */
function distance(ax: number, ay: number, bx: number, by: number): number {
	return Math.hypot(ax - bx, ay - by);
}

/** Normalizes a (dx, dy) vector to unit length, or [0, 0] if it's ~zero. */
function normalize(dx: number, dy: number): [number, number] {
	const len = Math.hypot(dx, dy);
	if (len < 1e-6) return [0, 0];
	return [dx / len, dy / len];
}


// ---------------------------------------------------------------------------
// Input builders. Every entry follows the exact {action, [action]: data}
// shape consumed by GMTurrets.runInput() (see the switch on input.action).
// ---------------------------------------------------------------------------

/** Sets the horizontal movement axis. */
function moveXInput(dirX: number): Fields {
	return {action: 'dirX', dirX};
}

/** Sets the vertical movement axis. */
function moveYInput(dirY: number): Fields {
	return {action: 'dirY', dirY};
}

/** Aims/fires standard attacks at a fixed world-space point (also used to shoot turrets). */
function attackAtInput(x: number, y: number): Fields {
	return {action: 'throwTarget', throwTarget: {x, y}};
}

/** Aims/fires standard attacks automatically at the nearest enemy player. */
function attackAutoInput(): Fields {
	return {action: 'throwAuto', throwAuto: {}};
}

/** Stops attacking/throwing entirely. */
function stopAttackInput(): Fields {
	return {action: 'throwOff', throwOff: {}};
}

/** Picks up the item under the player into the given inventory slot (or selects that slot). */
function useItemInput(slot: number): Fields {
	return {action: 'useItem', useItem: {slot}};
}


// ---------------------------------------------------------------------------
// Game-state readers / decision helpers.
// ---------------------------------------------------------------------------

/** Returns this bot's own player object. */
function getSelf(game: GMTurrets, playerIdx: number): PlayerT {
	return game.players[playerIdx];
}

/** Returns the team opposing `self`. */
function getEnemyTeam(self: PlayerT): 'red' | 'blue' {
	return self.team === 'red' ? 'blue' : 'red';
}

/** Finds the nearest living enemy player, if any. */
function findNearestEnemyPlayer(
	game: GMTurrets,
	self: PlayerT
): {player: PlayerT, dist: number} | null {
	const enemyTeam = getEnemyTeam(self);
	let best: {player: PlayerT, dist: number} | null = null;

	for (const other of game.players) {
		if (other === self || !other.isAlive() || other.team !== enemyTeam) continue;

		const dist = distance(self.x, self.y, other.x, other.y);
		if (best === null || dist < best.dist) {
			best = {player: other, dist};
		}
	}

	return best;
}

/** Finds the closest ground item within pickup range, if any. */
function findLootableItem(game: GMTurrets, self: PlayerT): ItemT | null {
	let best: ItemT | null = null;
	let bestDist = Infinity;

	for (const item of game.itemsInMap) {
		const dist = distance(self.x, self.y, item.x, item.y);
		if (dist <= ITEM_PICKUP_RADIUS && dist < bestDist) {
			best = item;
			bestDist = dist;
		}
	}

	return best;
}

/** Returns the index of the first empty inventory slot, or -1 if the inventory is full. */
function findEmptyItemSlot(self: PlayerT): number {
	return self.items.findIndex(id => id === -1);
}

/**
 * Chooses which turret to push next.
 * Sticks to a previously locked turret (avoids flip-flopping mid-approach)
 * unless it becomes our own team's, in which case a fresh target is scored.
 */
function chooseTurretTarget(
	game: GMTurrets,
	self: PlayerT,
	data: Data
): {turret: TurretT, idx: number} | null {
	if (data.lockedTurretIdx !== null) {
		const locked = game.turrets[data.lockedTurretIdx];
		if (locked && locked.team !== self.team) {
			return {turret: locked, idx: data.lockedTurretIdx};
		}
		data.lockedTurretIdx = null;
	}

	let bestIdx = -1;
	let bestScore = -Infinity;

	game.turrets.forEach((turret, idx) => {
		// Never target our own team's turret here: friendly fire on a
		// full-HP turret just heals/farms it, it doesn't help us capture.
		if (turret.team === self.team) return;

		const dist = distance(self.x, self.y, turret.x, turret.y);

		// Base score favors nearby turrets.
		let score = -dist;

		if (turret.team !== null) {
			// A freshly captured enemy turret can't fire back yet - a
			// great time to strike (turrets.md §2.6/§2.8).
			if (turret.startCooldown > 0) score += 4000;

			// Prefer turrets that are already low on HP (closer to flipping).
			score += (TURRET_HP - turret.hp);
		} else {
			// Neutral turret: prefer one where the tug-of-war already
			// leans toward our team, since less work is needed to finish
			// the capture (turrets.md §2.4).
			const ourLean = self.team === 'red' ? turret.activation : -turret.activation;
			score += ourLean;
		}

		if (score > bestScore) {
			bestScore = score;
			bestIdx = idx;
		}
	});

	if (bestIdx === -1) return null;

	data.lockedTurretIdx = bestIdx;
	return {turret: game.turrets[bestIdx], idx: bestIdx};
}


// ---------------------------------------------------------------------------
// Main bot loop.
// ---------------------------------------------------------------------------
const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const self = getSelf(game, playerIdx);

	// Dead / waiting to respawn: nothing useful to send this frame.
	if (!self.isAlive()) {
		return [inputs, 'success'];
	}

	// --- 1. Opportunistic looting -----------------------------------------
	// If we're standing on a dropped item and have a free slot, grab it.
	const lootable = findLootableItem(game, self);
	if (lootable) {
		const emptySlot = findEmptyItemSlot(self);
		if (emptySlot !== -1) {
			inputs.push(useItemInput(emptySlot));
		}
	}

	// --- 2. Read the local threat picture -----------------------------------
	const nearestEnemy = findNearestEnemyPlayer(game, self);
	const hpFraction = self.hp / self.maxHp;
	const inDanger = hpFraction < RETREAT_HP_FRACTION
		&& nearestEnemy !== null
		&& nearestEnemy.dist < DANGER_RANGE;

	// --- 3. Retreat / disengage ---------------------------------------------
	// Low HP with a nearby threat: stop shooting (frees up the faster idle
	// regen path per turrets.md §14.8) and run straight away from it.
	if (inDanger && nearestEnemy) {
		inputs.push(stopAttackInput());

		const [awayX, awayY] = normalize(
			self.x - nearestEnemy.player.x,
			self.y - nearestEnemy.player.y
		);

		inputs.push(moveXInput(awayX));
		inputs.push(moveYInput(awayY));

		return [inputs, 'success'];
	}

	// --- 4. Fight a nearby enemy player --------------------------------------
	if (nearestEnemy && nearestEnemy.dist < ENGAGE_RANGE) {
		let moveDirX = 0;
		let moveDirY = 0;

		if (nearestEnemy.dist > PREFERRED_COMBAT_RANGE) {
			// Too far: close the gap.
			[moveDirX, moveDirY] = normalize(
				nearestEnemy.player.x - self.x,
				nearestEnemy.player.y - self.y
			);
		} else if (nearestEnemy.dist < MIN_COMBAT_RANGE) {
			// Too close: back off to a safer firing distance.
			[moveDirX, moveDirY] = normalize(
				self.x - nearestEnemy.player.x,
				self.y - nearestEnemy.player.y
			);
		}
		// Otherwise hold position (moveDirX/Y stay at 0).

		inputs.push(moveXInput(moveDirX));
		inputs.push(moveYInput(moveDirY));

		// 'auto' targeting always tracks the nearest living enemy player -
		// exactly what we want here (it never targets turrets, see §7).
		inputs.push(attackAutoInput());

		return [inputs, 'success'];
	}

	// --- 5. No enemy nearby: push toward a turret ----------------------------
	const targetTurret = chooseTurretTarget(game, self, data);

	if (!targetTurret) {
		// Nothing left worth attacking: just hold position.
		inputs.push(moveXInput(0));
		inputs.push(moveYInput(0));
		inputs.push(stopAttackInput());
		return [inputs, 'success'];
	}

	const dist = distance(self.x, self.y, targetTurret.turret.x, targetTurret.turret.y);

	// Approach until we're comfortably within our own engagement range,
	// then hold rather than walking deep into the turret's kill zone.
	if (dist > PREFERRED_COMBAT_RANGE) {
		const [dirX, dirY] = normalize(
			targetTurret.turret.x - self.x,
			targetTurret.turret.y - self.y
		);
		inputs.push(moveXInput(dirX));
		inputs.push(moveYInput(dirY));
	} else {
		inputs.push(moveXInput(0));
		inputs.push(moveYInput(0));
	}

	// Only bother shooting once inside (a margin around) the turret's own
	// bullet range - a 'fixed' target aimed straight at its center, since
	// 'auto' targeting never picks turrets.
	if (dist <= TURRET_RADIUS * 1.5) {
		inputs.push(attackAtInput(targetTurret.turret.x, targetTurret.turret.y));
	}

	return [inputs, 'success'];
});


const root = (function() {
	return all([method]);
})();

appendBots('turrets', [
	{root, data: dataConstructor}
]);

logger.info("Bot loaded!");

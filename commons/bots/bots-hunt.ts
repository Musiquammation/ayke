import { Fields } from "../Fields";
import { botActionNodeHelper, describeBot } from "../Bot";
import { GMHunt } from "../gamemods/GMHunt";
import {
	BOMB_MAX_RANGE,
	EXPLOSION_RADIUS,
	GUN_HEIGHT,
	ITEM_BOMB,
	ITEM_ICE_BOMB,
	ITEM_JUMP,
	ITEM_NONE,
	ITEM_SHELLS,
	PLAYER_HEIGHT,
	WEAPON_BOT_RANGES,
	WEAPON_LONG,
	WEAPON_MID,
	WEAPON_SHORT,
	WEAPONS,
} from "../gamemods/hunt/constants";
import { Box, Pickup, Player } from "../gamemods/hunt/entities";
import { canShoot } from "../gamemods/hunt/simulation";

/* -------------------------------------------------------------------------- */
/* Hunt bot: chase the nearest opponent, keep the range of the best weapon,   */
/* strafe, jump when stuck, shoot and use items.                              */
/* Ammo is scarce (burst and sniper above all): the bot never shoots without  */
/* a clear line, rushes in with the plentiful shotgun, grabs the ammo lying   */
/* nearby, and breaks boxes to get more when it runs low.                     */
/* -------------------------------------------------------------------------- */

const STRAFE_PERIOD = 2.2;   // seconds before changing strafe direction
const STUCK_DISTANCE = 4;    // moved less than this in a frame while walking = stuck
const LEAP_MIN_DISTANCE = 950; // super jump toward targets farther than this
const SHELL_BOT_RANGE = 700;   // shells thrown at targets closer than this

// Ammo management
const AMMO_DETOUR = 450;       // ammo pickups closer than this are always grabbed (if useful)
const LOW_SHOTGUN = 3;         // under this many shotgun shells, the bot looks for ammo
const LOW_BURST = 15;          // same for the burst (used when the shotgun is low too)
const BOX_SHOT_RANGE = 0.8;    // fraction of a weapon range under which a box is shot

class Data {
	lastX = 0;
	lastY = 0;
	strafe = 1;
	strafeTimer = 0;
	lastClock = 0;
}

function dataConstructor(): Data {
	return new Data();
}

const { all, runner } = botActionNodeHelper<GMHunt, Data>();

type Point = { x: number; y: number; z: number };

/** Index of the nearest living opponent, or -1. */
function nearestOpponent(game: GMHunt, playerIdx: number) {
	const self = game.players[playerIdx];
	let best = -1;
	let bestDist = Infinity;
	for (const [i, p] of game.players.entries()) {
		if (i === playerIdx || !p.isAlive())
			continue;
		const d = Math.hypot(p.x - self.x, p.y - self.y);
		if (d < bestDist) {
			bestDist = d;
			best = i;
		}
	}
	return best;
}

/** True when nothing blocks a bullet from the gun of `self` to `to` (ignoring `ignore`). */
function clearShot(game: GMHunt, self: Player, to: Point, ignore: Box | null = null) {
	const physics = game.getPhysics();
	if (!physics)
		return false;
	return physics.lineOfSight(self.x, self.y, to.x, to.y, self.z + GUN_HEIGHT, ignore);
}

/**
 * Best weapon with ammo for a given distance. The shotgun is plentiful, so it is used
 * whenever it reaches; the rare burst only at mid range, and the rarer sniper only when
 * nothing else reaches. Returns -1 when no weapon with ammo reaches.
 */
function weaponFor(self: Player, dist: number) {
	for (const w of [WEAPON_SHORT, WEAPON_MID, WEAPON_LONG]) {
		if (self.ammo[w] > 0 && dist < WEAPONS[w].range * 0.85)
			return w;
	}
	return -1;
}

/** Weapon the bot fights with: decides the distance it keeps from its target. */
function preferredWeapon(self: Player) {
	if (self.ammo[WEAPON_SHORT] > 0) return WEAPON_SHORT;
	if (self.ammo[WEAPON_MID] > 0) return WEAPON_MID;
	if (self.ammo[WEAPON_LONG] > 0) return WEAPON_LONG;
	return -1;
}

/** True when the bot should go out of its way to find ammo. */
function lowOnAmmo(self: Player) {
	return self.ammo[WEAPON_SHORT] < LOW_SHOTGUN && self.ammo[WEAPON_MID] < LOW_BURST;
}

/**
 * Ammo pickup worth walking to: the nearest useful one, its distance weighted so the
 * shotgun ammo (the bot's main weapon) is preferred. When not low on ammo, only the
 * pickups within AMMO_DETOUR are considered.
 */
function wantedAmmo(game: GMHunt, self: Player, low: boolean): Pickup | null {
	let best: Pickup | null = null;
	let bestScore = Infinity;
	for (const p of game.pickups) {
		if (!p.isAmmo() || !self.canTakeAmmo(p.ammoWeapon))
			continue;
		const d = Math.hypot(p.x - self.x, p.y - self.y);
		if (!low && d > AMMO_DETOUR)
			continue;
		const score = p.ammoWeapon === WEAPON_SHORT ? d * 0.7 : d;
		if (score < bestScore) {
			bestScore = score;
			best = p;
		}
	}
	return best;
}

/** Nearest standing box, or null. */
function nearestBox(game: GMHunt, self: Player): Box | null {
	let best: Box | null = null;
	let bestDist = Infinity;
	for (const b of game.boxes) {
		if (!b.isStanding())
			continue;
		const d = Math.hypot(b.x - self.x, b.y - self.y);
		if (d < bestDist) {
			bestDist = d;
			best = b;
		}
	}
	return best;
}

/** Quantize a direction to the -1/0/1 axes used by the move input. */
function axis(v: number) {
	return v > 0.38 ? 1 : v < -0.38 ? -1 : 0;
}

/** Unit vector from the bot toward a point. */
function toward(self: Player, x: number, y: number) {
	const dx = x - self.x;
	const dy = y - self.y;
	const d = Math.hypot(dx, dy) || 1;
	return { x: dx / d, y: dy / d };
}

/** True when using this item now would be useful against a target at this distance. */
function itemInRange(item: number, dist: number) {
	switch (item) {
		// Not too close: the blast also hits the thrower
		case ITEM_BOMB: return dist < BOMB_MAX_RANGE * 0.95 && dist > EXPLOSION_RADIUS * 1.3;
		case ITEM_ICE_BOMB: return dist < BOMB_MAX_RANGE * 0.95;
		case ITEM_SHELLS: return dist < SHELL_BOT_RANGE;
		case ITEM_JUMP: return dist > LEAP_MIN_DISTANCE;
		default: return false;
	}
}

const fight = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const self = game.players[playerIdx];
	if (!self.isAlive() || game.finished)
		return [inputs, 'success'];

	// Elapsed time, from the shared game clock
	const clock = -game.time;
	const dt = Math.max(0, clock - data.lastClock);
	data.lastClock = clock;

	const targetIdx = nearestOpponent(game, playerIdx);
	if (targetIdx < 0) {
		if (self.moveX !== 0 || self.moveY !== 0)
			inputs.push({ action: 'move', move: { x: 0, y: 0 } });
		return [inputs, 'success'];
	}

	const target = game.players[targetIdx];
	const dx = target.x - self.x;
	const dy = target.y - self.y;
	const dist = Math.hypot(dx, dy) || 1;
	const aim = { x: target.x, y: target.y, z: target.z + PLAYER_HEIGHT / 2 };

	// Ammo: grab the useful ammo nearby; when low, go get some, or break a box for it
	const low = lowOnAmmo(self);
	const ammo = wantedAmmo(game, self, low);
	const box = low && !ammo ? nearestBox(game, self) : null;

	// Weapon: the one that reaches the target, else the one the bot fights with
	const reaching = weaponFor(self, dist);
	const preferred = preferredWeapon(self);
	let weapon = reaching >= 0 ? reaching : preferred >= 0 ? preferred : self.weapon;

	// Breaking a box: the shotgun when possible (one full shot breaks it), else the
	// burst; the rare sniper is kept for players
	const boxDist = box ? Math.hypot(box.x - self.x, box.y - self.y) : Infinity;
	const boxWeapon = self.ammo[WEAPON_SHORT] > 0 ? WEAPON_SHORT
		: self.ammo[WEAPON_MID] > 0 ? WEAPON_MID
		: -1;
	const shootBox = box !== null && reaching < 0 && boxWeapon >= 0;
	if (shootBox)
		weapon = boxWeapon;

	if (weapon !== self.weapon)
		inputs.push({ action: 'weapon', weapon });

	// Movement: ammo first, then a box to break, else approach / back off / strafe around the target
	data.strafeTimer -= dt;
	if (data.strafeTimer <= 0) {
		data.strafeTimer = STRAFE_PERIOD;
		data.strafe = -data.strafe;
	}
	const wanted = WEAPON_BOT_RANGES[preferred >= 0 ? preferred : WEAPON_SHORT];
	const ux = dx / dist;
	const uy = dy / dist;
	let mx: number, my: number;
	if (ammo) {
		({ x: mx, y: my } = toward(self, ammo.x, ammo.y));
	} else if (box && !(shootBox && boxDist < WEAPONS[boxWeapon].range * BOX_SHOT_RANGE * 0.7)) {
		({ x: mx, y: my } = toward(self, box.x, box.y));
	} else if (dist > wanted * 1.1) {
		mx = ux; my = uy;
	} else if (dist < wanted * 0.6) {
		mx = -ux; my = -uy;
	} else {
		mx = -uy * data.strafe; my = ux * data.strafe;
	}
	const moveX = axis(mx);
	const moveY = axis(my);
	if (moveX !== self.moveX || moveY !== self.moveY)
		inputs.push({ action: 'move', move: { x: moveX, y: moveY } });

	// Jump when walking into an obstacle
	const moved = Math.hypot(self.x - data.lastX, self.y - data.lastY);
	if ((self.moveX !== 0 || self.moveY !== 0) && moved < STUCK_DISTANCE && dt > 0)
		inputs.push({ action: 'jump', jump: {} });
	data.lastX = self.x;
	data.lastY = self.y;

	// Shoot: only with a clear line, so no ammo is wasted on walls
	if (self.weapon === weapon && canShoot(self)) {
		if (reaching >= 0 && weapon === reaching && dist < WEAPONS[weapon].range * 0.95 && clearShot(game, self, aim)) {
			inputs.push({ action: 'shoot', shoot: aim });
		} else if (shootBox && box && boxDist < WEAPONS[weapon].range * BOX_SHOT_RANGE && clearShot(game, self, box.center(), box)) {
			inputs.push({ action: 'shoot', shoot: box.center() });
		}
	}

	// Items: each one is used at the distance where it works.
	// Out of ammo, an explosive bomb is thrown at a box to open it.
	const item = self.items[self.selectedItem];
	const firstItem = self.items.findIndex(i => i !== ITEM_NONE);
	if (item === ITEM_NONE && firstItem >= 0) {
		inputs.push({ action: 'selectItem', selectItem: firstItem });
	} else if (self.canAttack() && itemInRange(item, dist)) {
		const feet = { x: target.x, y: target.y, z: target.z };
		inputs.push({ action: 'useItem', useItem: item === ITEM_SHELLS ? aim : feet });
	} else if (self.canAttack() && item === ITEM_BOMB && box && preferred < 0 &&
		itemInRange(ITEM_BOMB, boxDist)) {
		inputs.push({ action: 'useItem', useItem: { x: box.x, y: box.y, z: box.z } });
	}

	return [inputs, 'success'];
});

const root = (function() {
	return all([fight]);
})();

export default describeBot(
	[{ root, data: dataConstructor }]
);

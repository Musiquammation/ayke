import { Fields } from "../Fields";
import { botActionNodeHelper, describeBot } from "../Bot";
import { GMHunt } from "../gamemods/GMHunt";
import {
	BOMB_MAX_RANGE,
	BOOMERANG_REACH,
	DASH_DISTANCE,
	ITEM_BOMB,
	ITEM_BOOMERANG,
	ITEM_DASH,
	ITEM_JUMP,
	ITEM_NONE,
	PLAYER_HEIGHT,
	WEAPON_BOT_RANGES,
	WEAPONS,
} from "../gamemods/hunt/constants";
import { canShoot } from "../gamemods/hunt/simulation";

/* -------------------------------------------------------------------------- */
/* Hunt bot: chase the nearest opponent, keep the range of the best weapon,   */
/* strafe, jump when stuck, shoot and use items.                              */
/* -------------------------------------------------------------------------- */

const STRAFE_PERIOD = 2.2;   // seconds before changing strafe direction
const STUCK_DISTANCE = 4;    // moved less than this in a frame while walking = stuck
const LEAP_MIN_DISTANCE = 950; // super jump toward targets farther than this

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

/** Best weapon for a given distance. */
function weaponFor(dist: number) {
	if (dist < WEAPONS[2].range * 0.85) return 2;
	if (dist < WEAPONS[1].range * 0.85) return 1;
	return 0;
}

/** Quantize a direction to the -1/0/1 axes used by the move input. */
function axis(v: number) {
	return v > 0.38 ? 1 : v < -0.38 ? -1 : 0;
}

/** True when using this item now would be useful against a target at this distance. */
function itemInRange(item: number, dist: number) {
	switch (item) {
		case ITEM_BOMB: return dist < BOMB_MAX_RANGE * 0.95;
		case ITEM_BOOMERANG: return dist < BOOMERANG_REACH * 0.9;
		case ITEM_DASH: return dist < DASH_DISTANCE * 0.8;
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

	// Weapon
	const weapon = weaponFor(dist);
	if (weapon !== self.weapon)
		inputs.push({ action: 'weapon', weapon });

	// Movement: approach, back off, or strafe around the target
	data.strafeTimer -= dt;
	if (data.strafeTimer <= 0) {
		data.strafeTimer = STRAFE_PERIOD;
		data.strafe = -data.strafe;
	}
	const wanted = WEAPON_BOT_RANGES[weapon];
	const ux = dx / dist;
	const uy = dy / dist;
	let mx: number, my: number;
	if (dist > wanted * 1.1) {
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

	// Shoot
	const aim = { x: target.x, y: target.y, z: target.z + PLAYER_HEIGHT / 2 };
	if (self.weapon === weapon && canShoot(self) && dist < WEAPONS[weapon].range * 0.95)
		inputs.push({ action: 'shoot', shoot: aim });

	// Items: each one is used at the distance where it works
	const item = self.items[self.selectedItem];
	const firstItem = self.items.findIndex(i => i !== ITEM_NONE);
	if (item === ITEM_NONE && firstItem >= 0) {
		inputs.push({ action: 'selectItem', selectItem: firstItem });
	} else if (self.canAttack() && itemInRange(item, dist)) {
		const feet = { x: target.x, y: target.y, z: target.z };
		inputs.push({ action: 'useItem', useItem: item === ITEM_BOMB || item === ITEM_JUMP ? feet : aim });
	}

	return [inputs, 'success'];
});

const root = (function() {
	return all([fight]);
})();

export default describeBot(
	[{ root, data: dataConstructor }]
);

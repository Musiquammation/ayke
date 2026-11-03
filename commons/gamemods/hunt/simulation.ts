import {
	BOOMERANG_DAMAGE,
	BOOMERANG_PULL_MAX_TIME,
	BOOMERANG_PULL_SPEED,
	BOOMERANG_RADIUS,
	BOOMERANG_RELEASE_GAP,
	BOX_HEIGHT,
	BOX_HP,
	BOX_RESPAWN,
	DASH_DAMAGE,
	DASH_DISTANCE,
	DASH_GRAB_MARGIN,
	DASH_LAUNCH_VELOCITY,
	DASH_STUN,
	DASH_TIME,
	EXPLOSION_DAMAGE,
	EXPLOSION_RADIUS,
	EXPLOSION_VERTICAL_REACH,
	GUN_HEIGHT,
	ITEM_BOMB,
	ITEM_BOOMERANG,
	ITEM_DASH,
	ITEM_JUMP,
	ITEM_KINDS,
	ITEM_NONE,
	ITEM_SLOTS,
	JUMP_VELOCITY,
	KILL_FEED_SIZE,
	KILLS_TO_WIN,
	MATCH_DURATION,
	MAX_AMMO,
	PICKUP_RADIUS,
	PICKUP_VERTICAL_REACH,
	PLAYER_HEIGHT,
	PLAYER_RADIUS,
	PLAYER_SPEED,
	REGEN_DELAY,
	REGEN_RATE,
	RELOAD_DELAY,
	RELOAD_RATE,
	RESPAWN_TIME,
	STEP_HEIGHT,
	WEAPONS,
} from "./constants";
import { spansOverlap } from "./collision";
import {
	Bomb,
	Boomerang,
	Box,
	Entity,
	Explosion,
	KillEvent,
	Pickup,
	Player,
	Projectile,
	Vec3,
} from "./entities";
import { LEVEL } from "./level";
import { HuntPhysics } from "./physics";
import {
	aimDirection,
	bombLaunch,
	boomerangCatches,
	boomerangPoint,
	boomerangProgress,
	boomerangThrow,
	fall,
	isCatch,
	leapLaunch,
	stepBomb,
	stepLeap,
} from "./trajectories";

/* -------------------------------------------------------------------------- */
/* Game rules. Pure functions over the shared state: the same state and the   */
/* same inputs always give the same result (no randomness is needed).         */
/* -------------------------------------------------------------------------- */

/** Respawn timer value used to keep a disconnected player off the map forever. */
const NEVER = 1e9;
/** Distance between the dropped items of a dead player. */
const DEATH_DROP_SPREAD = 46;
/** Golden angle: spreads the pellets of a shot evenly in their disc. */
const GOLDEN_ANGLE = 2.399963;

export type AimPoint = Vec3;

/** Everything the rules read and write. Implemented by GMHunt. */
export interface HuntState {
	readonly players: Player[];
	readonly boxes: Box[];
	projectiles: Projectile[];
	bombs: Bomb[];
	boomerangs: Boomerang[];
	explosions: Explosion[];
	pickups: Pickup[];
	killFeed: KillEvent[];
	time: number;
	finished: boolean;
}


/* ---------------------------- Setup ---------------------------- */

/** Put every player on its initial spawn point (spawn i for player i). */
export function initialSpawn(state: HuntState) {
	for (const [i, p] of state.players.entries()) {
		const s = LEVEL.spawns[i % LEVEL.spawns.length];
		p.spawnAt(s.x, s.y, 0);
	}
}


/* ---------------------------- Main tick ---------------------------- */

/** Advance the whole simulation by dt seconds. */
export function stepWorld(state: HuntState, physics: HuntPhysics, dt: number) {
	if (state.finished)
		return;

	state.time = Math.max(0, state.time - dt);

	// Players only collide with obstacles and boxes, so one sync before moving is enough
	physics.sync();
	for (const [idx, p] of state.players.entries()) {
		updatePlayer(state, physics, p, idx, dt);
	}

	// Bullets must see where the players are now
	physics.sync();
	updateProjectiles(state, physics, dt);
	updateBombs(state, physics, dt);
	updateBoomerangs(state, physics, dt);
	updateExplosions(state, dt);
	updateBoxes(state, physics, dt);
	updatePickups(state, dt);
	updateKillFeed(state, dt);

	if (state.time <= 0 || state.players.some(p => p.kills >= KILLS_TO_WIN))
		state.finished = true;
}


/* ---------------------------- Players ---------------------------- */

/** Timers, respawn, movement, jump, dash, regen and ammo of one player. */
function updatePlayer(state: HuntState, physics: HuntPhysics, p: Player, idx: number, dt: number) {
	if (!p.connected && p.isAlive()) {
		p.respawn = NEVER; // a disconnected player leaves the map (no kill credited)
		releaseDragged(state, idx, false);
		return;
	}

	if (!p.isAlive()) {
		updateRespawn(state, physics, p, dt);
		return;
	}

	updateTimers(p, dt);
	updateHorizontalMove(physics, p, dt);
	if (p.dashTimer > 0)
		updateDash(state, physics, p, idx, dt);
	updateVerticalMove(physics, p, dt);
	updateRegenAndAmmo(p, dt);
}

/** Count down the respawn timer, then put the player back on the safest spawn point. */
function updateRespawn(state: HuntState, physics: HuntPhysics, p: Player, dt: number) {
	if (!p.connected)
		return;

	p.respawn -= dt;
	if (p.respawn > 0)
		return;

	const s = chooseSpawn(state, physics, p);
	p.spawnAt(s.x, s.y, physics.groundHeight(s.x, s.y, 0));
}

/**
 * Pick the spawn point that is the farthest from every living opponent.
 * Deterministic: ties are broken by the spawn order.
 */
function chooseSpawn(state: HuntState, physics: HuntPhysics, self: Player) {
	let best = LEVEL.spawns[0];
	let bestScore = -Infinity;

	for (const s of LEVEL.spawns) {
		if (physics.isBlocked(s.x, s.y, 0))
			continue;

		let nearest = Infinity;
		for (const o of state.players) {
			if (o === self || !o.isAlive())
				continue;
			nearest = Math.min(nearest, Math.hypot(o.x - s.x, o.y - s.y));
		}

		if (nearest > bestScore) {
			bestScore = nearest;
			best = s;
		}
	}

	return best;
}

/** Decrease every effect timer. */
function updateTimers(p: Player, dt: number) {
	p.shotCooldown = Math.max(0, p.shotCooldown - dt);
	p.spawnShield = Math.max(0, p.spawnShield - dt);
	p.stunTimer = Math.max(0, p.stunTimer - dt);
}

/**
 * Move on the ground plane, sliding along obstacles (Rapier shape casts):
 * with ZQSD, or along the leap of a super jump. Players moved by someone else
 * (dash, boomerang) and dashing players do not walk.
 */
function updateHorizontalMove(physics: HuntPhysics, p: Player, dt: number) {
	const free = physics.resolvePenetration(p);
	p.x = free.x;
	p.y = free.y;

	if (p.isControlled() || p.dashTimer > 0)
		return;

	let dx: number, dy: number;
	if (p.leaping) {
		dx = p.vx * dt;
		dy = p.vy * dt;
	} else {
		let mx = p.moveX;
		let my = p.moveY;
		if (mx === 0 && my === 0)
			return;

		const len = Math.hypot(mx, my);
		mx /= len;
		my /= len;
		dx = mx * PLAYER_SPEED * dt;
		dy = my * PLAYER_SPEED * dt;
	}

	const reached = physics.movePlayer(p, dx, dy, p);
	p.x = reached.x;
	p.y = reached.y;
}

/** Gravity, jumps and landing on the highest surface under the player. */
function updateVerticalMove(physics: HuntPhysics, p: Player, dt: number) {
	if (p.carriedBy >= 0) {
		p.vz = 0; // hanging on a boomerang
		p.jumpQueued = false;
		return;
	}

	const ground = physics.groundHeight(p.x, p.y, p.z);
	const grounded = p.z <= ground + 0.5 && p.vz <= 0;

	if (p.jumpQueued && grounded && !p.isControlled())
		p.vz = JUMP_VELOCITY;
	p.jumpQueued = false;

	const landed = fall(physics, p, dt, p);
	if (landed && p.leaping) {
		p.leaping = false;
		p.vx = 0;
		p.vy = 0;
	}
}

/**
 * Regenerate life when out of combat.
 * Ammo: a cartridge being used drains down to the next integer; otherwise the ammo
 * stays blocked for RELOAD_DELAY, then goes back up quickly.
 */
function updateRegenAndAmmo(p: Player, dt: number) {
	p.sinceCombat += dt;
	if (p.sinceCombat >= REGEN_DELAY)
		p.hp = Math.min(p.maxHp, p.hp + REGEN_RATE * dt);

	if (p.ammoDrainTo >= 0) {
		p.ammo -= dt / WEAPONS[p.weapon].drain;
		if (p.ammo <= p.ammoDrainTo) {
			p.ammo = p.ammoDrainTo;
			p.ammoDrainTo = -1;
			p.reloadDelay = RELOAD_DELAY;
		}
		return;
	}

	if (p.ammo >= MAX_AMMO)
		return;

	if (p.reloadDelay > 0) {
		p.reloadDelay -= dt;
		return;
	}

	p.ammo = Math.min(MAX_AMMO, p.ammo + RELOAD_RATE * dt);
}


/* ---------------------------- Shooting ---------------------------- */

/** True when the player can shoot right now (used by inputs, bots and the client). */
export function canShoot(p: Player) {
	return p.canAttack() && p.shotCooldown <= 0 && (p.ammoDrainTo >= 0 || p.ammo > 1e-3);
}

/**
 * Shoot the current weapon toward a 3D aim point. The first shot starts draining a
 * cartridge; the next ones (while it drains) are free. Every bullet flies in a
 * straight line from the gun to the aim point (pellets to points around it).
 */
export function shoot(state: HuntState, idx: number, aim: AimPoint) {
	const p = state.players[idx];
	if (!canShoot(p))
		return;

	const def = WEAPONS[p.weapon];
	if (p.ammoDrainTo < 0)
		p.ammoDrainTo = Math.max(0, Math.ceil(p.ammo - 1e-3) - 1);

	p.shotCooldown = def.cooldown;
	p.sinceCombat = 0;
	p.spawnShield = 0; // attacking ends the spawn protection

	const dir = aimDirection(p, aim);
	p.facing = Math.atan2(dir.y, dir.x);

	for (let i = 0; i < def.count; i++) {
		const r = def.count > 1 ? def.scatter * Math.sqrt((i + 0.5) / def.count) : 0;
		const a = i * GOLDEN_ANGLE + p.facing;
		spawnBullet(state, p, idx, p.weapon, {
			x: aim.x + Math.cos(a) * r,
			y: aim.y + Math.sin(a) * r,
			z: aim.z,
		});
	}
}

/** Create one bullet leaving the gun of a player toward a point. */
function spawnBullet(state: HuntState, p: Player, idx: number, weapon: number, target: Vec3) {
	const def = WEAPONS[weapon];
	const z = p.z + GUN_HEIGHT;
	let dx = target.x - p.x;
	let dy = target.y - p.y;
	let dz = target.z - z;
	let len = Math.hypot(dx, dy, dz);
	if (len < 1) {
		dx = Math.cos(p.facing);
		dy = Math.sin(p.facing);
		dz = 0;
		len = 1;
	}

	const b = new Projectile();
	b.owner = idx;
	b.weapon = weapon;
	b.x = p.x;
	b.y = p.y;
	b.z = z;
	b.vx = dx / len * def.speed;
	b.vy = dy / len * def.speed;
	b.vz = dz / len * def.speed;
	b.rangeLeft = def.range;
	b.damage = def.damage;
	state.projectiles.push(b);
}

/** Players a bullet of `owner` can hit (obstacles and boxes always stop bullets). */
function hittablePlayers(owner: number) {
	return (e: Entity) => e instanceof Player && e.idx !== owner && e.isTargetable();
}

/** Move every bullet, using Rapier shape casts to find what it hits. */
function updateProjectiles(state: HuntState, physics: HuntPhysics, dt: number) {
	const kept: Projectile[] = [];

	for (const b of state.projectiles) {
		const dx = b.vx * dt;
		const dy = b.vy * dt;
		const dz = b.vz * dt;
		const radius = WEAPONS[b.weapon].radius;

		const hit = physics.castBall(b.x, b.y, b.z, dx, dy, dz, radius, hittablePlayers(b.owner));
		if (hit) {
			damageEntity(state, physics, hit.entity, b.damage, b.owner);
			continue; // the bullet is consumed
		}

		b.x += dx;
		b.y += dy;
		b.z += dz;
		b.rangeLeft -= Math.hypot(dx, dy, dz);
		if (b.rangeLeft > 0 && b.z > 0)
			kept.push(b);
	}

	state.projectiles = kept;
}


/* ---------------------------- Damage ---------------------------- */

/** Hurt anything with life. */
function damageEntity(state: HuntState, physics: HuntPhysics, e: Entity, amount: number, attackerIdx: number) {
	if (e instanceof Player)
		damagePlayer(state, physics, e.idx, amount, attackerIdx);
	else if (e instanceof Box)
		damageBox(state, e, amount);
}

/** Hurt a player. Credits the attacker and kills the victim when its life reaches 0. */
export function damagePlayer(
	state: HuntState,
	physics: HuntPhysics,
	victimIdx: number,
	amount: number,
	attackerIdx: number
) {
	const victim = state.players[victimIdx];
	if (!victim.isAlive() || victim.spawnShield > 0)
		return;

	amount = Math.min(amount, victim.hp);
	victim.hp -= amount;
	victim.sinceCombat = 0;
	if (attackerIdx >= 0 && attackerIdx !== victimIdx) {
		victim.lastAttacker = attackerIdx;
		state.players[attackerIdx].damageDealt += amount;
	}

	if (victim.hp <= 0)
		killPlayer(state, physics, victimIdx);
}

/** Remove a player from the map, drop its items and give the kill to its last attacker. */
function killPlayer(state: HuntState, physics: HuntPhysics, victimIdx: number) {
	const victim = state.players[victimIdx];
	victim.hp = 0;
	victim.respawn = RESPAWN_TIME;
	victim.deaths++;
	victim.moveX = 0;
	victim.moveY = 0;
	victim.leaping = false;
	victim.dashTimer = 0;
	victim.draggedBy = -1;
	victim.carriedBy = -1;
	releaseDragged(state, victimIdx, false);

	dropItems(state, physics, victim);

	const killer = victim.lastAttacker;
	if (killer >= 0 && killer !== victimIdx) {
		const k = state.players[killer];
		k.kills++;
		k.lastKillTime = MATCH_DURATION - state.time;
	}

	state.killFeed.push(new KillEvent(killer, victimIdx));
	if (state.killFeed.length > KILL_FEED_SIZE)
		state.killFeed.shift();
}

/** Scatter the items of a dead player around its body, so its killer can grab them. */
function dropItems(state: HuntState, physics: HuntPhysics, p: Player) {
	const z = physics.groundHeight(p.x, p.y, p.z);
	const items = p.items.filter(i => i !== ITEM_NONE);
	for (const [k, item] of items.entries()) {
		const angle = (k / Math.max(1, items.length)) * Math.PI * 2;
		const r = items.length > 1 ? DEATH_DROP_SPREAD : 0;
		state.pickups.push(Pickup.create(p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r, z, item));
	}
	p.items = new Array(ITEM_SLOTS).fill(ITEM_NONE);
}

/** Hurt a box. A broken box drops an item and comes back later on its slot. */
function damageBox(state: HuntState, box: Box, amount: number) {
	if (!box.isStanding())
		return;

	box.hp -= amount;
	if (box.hp > 0)
		return;

	box.hp = 0;
	box.respawn = BOX_RESPAWN;
	box.breaks++;
	box.carriedBy = -1;

	const idx = state.boxes.indexOf(box);
	state.pickups.push(Pickup.create(box.x, box.y, box.z, boxDrop(idx, box.breaks)));
}

/** Item dropped by a box: varies with the box and the number of times it broke (deterministic). */
function boxDrop(idx: number, breaks: number) {
	return ITEM_KINDS[(idx * 5 + breaks * 3 + idx * breaks) % ITEM_KINDS.length];
}


/* ---------------------------- Items ---------------------------- */

/** Use the selected item of a player toward the aim point. */
export function useItem(state: HuntState, physics: HuntPhysics, idx: number, aim: AimPoint) {
	const p = state.players[idx];
	if (!p.canAttack())
		return;

	const item = p.items[p.selectedItem];
	if (item === ITEM_NONE || (item === ITEM_JUMP && p.leaping))
		return;
	p.items[p.selectedItem] = ITEM_NONE;

	p.sinceCombat = 0;
	p.spawnShield = 0;
	const dir = aimDirection(p, aim);
	p.facing = Math.atan2(dir.y, dir.x);

	switch (item) {
		case ITEM_BOMB: {
			const b = new Bomb();
			Object.assign(b, bombLaunch(physics, p, aim));
			b.owner = idx;
			state.bombs.push(b);
			break;
		}

		case ITEM_BOOMERANG: {
			const b = new Boomerang();
			Object.assign(b, boomerangThrow(p, aim));
			b.owner = idx;
			b.x = p.x;
			b.y = p.y;
			b.z = p.z + GUN_HEIGHT;
			state.boomerangs.push(b);
			break;
		}

		case ITEM_DASH:
			p.dashTimer = DASH_TIME;
			p.dashDirX = dir.x;
			p.dashDirY = dir.y;
			p.leaping = false;
			break;

		case ITEM_JUMP: {
			const v = leapLaunch(physics, p, aim);
			p.leaping = true;
			p.vx = v.vx;
			p.vy = v.vy;
			p.vz = v.vz;
			break;
		}
	}
}


/* ---------------------------- Dash ---------------------------- */

/**
 * Move a dashing player straight ahead. Opponents it touches take damage and are
 * dragged in front of it; when the dash ends they are thrown up and stunned.
 */
function updateDash(state: HuntState, physics: HuntPhysics, p: Player, idx: number, dt: number) {
	const step = Math.min(dt, p.dashTimer);
	const speed = DASH_DISTANCE / DASH_TIME;
	const moved = physics.movePlayer(p, p.dashDirX * speed * step, p.dashDirY * speed * step, p);
	p.x = moved.x;
	p.y = moved.y;
	p.dashTimer -= dt;

	const grab = PLAYER_RADIUS * 2 + DASH_GRAB_MARGIN;
	for (const [i, o] of state.players.entries()) {
		if (i === idx || !o.isAlive() || o.isControlled() || o.spawnShield > 0)
			continue;
		if (Math.hypot(o.x - p.x, o.y - p.y) > grab)
			continue;
		if (!spansOverlap(o.z, o.z + PLAYER_HEIGHT, p.z, p.z + PLAYER_HEIGHT))
			continue;

		damagePlayer(state, physics, i, DASH_DAMAGE, idx);
		if (o.isAlive()) {
			o.draggedBy = idx;
			o.leaping = false;
		}
	}

	// Keep the dragged players in front of the dasher
	const ahead = PLAYER_RADIUS * 2 + 4;
	for (const o of state.players) {
		if (o.draggedBy !== idx)
			continue;
		const tx = p.x + p.dashDirX * ahead;
		const ty = p.y + p.dashDirY * ahead;
		const reached = physics.movePlayer(o, tx - o.x, ty - o.y, o);
		o.x = reached.x;
		o.y = reached.y;
	}

	if (p.dashTimer <= 0) {
		p.dashTimer = 0;
		releaseDragged(state, idx, true);
	}
}

/** Free the players dragged by a dasher (thrown up and stunned when `launch`). */
function releaseDragged(state: HuntState, idx: number, launch: boolean) {
	for (const o of state.players) {
		if (o.draggedBy !== idx)
			continue;
		o.draggedBy = -1;
		if (launch) {
			o.vz = DASH_LAUNCH_VELOCITY;
			o.stunTimer = DASH_STUN;
		}
	}
}


/* ---------------------------- Bombs & explosions ---------------------------- */

/** Move bombs along their arc and explode them when they touch something or land. */
function updateBombs(state: HuntState, physics: HuntPhysics, dt: number) {
	const kept: Bomb[] = [];
	for (const b of state.bombs) {
		const at = stepBomb(physics, b, b.owner, dt);
		if (at)
			explode(state, physics, at, b.owner);
		else
			kept.push(b);
	}
	state.bombs = kept;
}

/**
 * Damage every player (but the thrower) and every box in the blast.
 * Obstacles protect what is behind them (same rays as `explosionZone`).
 */
function explode(state: HuntState, physics: HuntPhysics, at: Vec3, owner: number) {
	const e = new Explosion();
	e.x = at.x;
	e.y = at.y;
	e.z = at.z;
	state.explosions.push(e);

	const rayZ = at.z + STEP_HEIGHT;
	for (const [i, p] of state.players.entries()) {
		if (i === owner || !p.isAlive())
			continue;
		const d = Math.hypot(p.x - at.x, p.y - at.y);
		if (d > EXPLOSION_RADIUS + PLAYER_RADIUS || Math.abs(p.z - at.z) > EXPLOSION_VERTICAL_REACH)
			continue;
		if (physics.lineOfSight(at.x, at.y, p.x, p.y, rayZ))
			damagePlayer(state, physics, i, EXPLOSION_DAMAGE, owner);
	}

	for (const box of state.boxes) {
		if (!box.isStanding())
			continue;
		const d = Math.hypot(box.x - at.x, box.y - at.y);
		if (d > EXPLOSION_RADIUS + box.hitRadius() || Math.abs(box.z - at.z) > EXPLOSION_VERTICAL_REACH)
			continue;
		if (physics.lineOfSight(at.x, at.y, box.x, box.y, rayZ, box))
			damageBox(state, box, EXPLOSION_DAMAGE);
	}
}

/** Fade explosions out. */
function updateExplosions(state: HuntState, dt: number) {
	for (const e of state.explosions)
		e.remaining -= dt;
	state.explosions = state.explosions.filter(e => e.remaining > 0);
}


/* ---------------------------- Boomerangs ---------------------------- */

/** Fly boomerangs along their loop, or drag their catch back to their owner. */
function updateBoomerangs(state: HuntState, physics: HuntPhysics, dt: number) {
	state.boomerangs = state.boomerangs.filter(b =>
		b.isPulling() ? pullBoomerang(state, physics, b, dt) : flyBoomerang(state, physics, b, dt)
	);
}

/** Advance a free boomerang. Returns false when it is gone (back in hand, or broken on a wall). */
function flyBoomerang(state: HuntState, physics: HuntPhysics, b: Boomerang, dt: number) {
	const owner = state.players[b.owner];
	if (!owner?.isAlive())
		return false;

	b.u = boomerangProgress(b.u, dt);
	const next = boomerangPoint(b, b.u, owner.x, owner.y);
	const dx = next.x - b.x;
	const dy = next.y - b.y;
	const hit = physics.castBall(b.x, b.y, b.z, dx, dy, 0, BOOMERANG_RADIUS, boomerangCatches(b.owner));

	if (!hit) {
		b.x = next.x;
		b.y = next.y;
		return b.u < 1;
	}

	b.x += dx * hit.toi;
	b.y += dy * hit.toi;
	if (!isCatch(hit))
		return false; // a wall: the boomerang falls

	const target = hit.entity as Player | Box;
	damageEntity(state, physics, target, BOOMERANG_DAMAGE, b.owner);
	if (!target.isTargetable())
		return false; // killed or broken by the hit

	b.catchKind = target instanceof Player ? 'player' : 'box';
	b.catchIdx = target instanceof Player ? target.idx : state.boxes.indexOf(target);
	b.pullTime = 0;
	target.carriedBy = b.owner;
	if (target instanceof Player) {
		target.leaping = false;
		target.dashTimer = 0;
		releaseDragged(state, target.idx, false);
	}
	return true;
}

/** Drag the catch of a boomerang toward its owner. Returns false once it is released. */
function pullBoomerang(state: HuntState, physics: HuntPhysics, b: Boomerang, dt: number) {
	const owner = state.players[b.owner];
	const target: Player | Box | undefined = b.catchKind === 'player'
		? state.players[b.catchIdx]
		: state.boxes[b.catchIdx];
	if (!target)
		return false;

	const release = () => {
		if (target.carriedBy === b.owner)
			target.carriedBy = -1;
		return false;
	};

	b.pullTime += dt;
	if (!owner?.isAlive() || !target.isTargetable() || target.carriedBy !== b.owner || b.pullTime > BOOMERANG_PULL_MAX_TIME)
		return release();

	const dx = owner.x - target.x;
	const dy = owner.y - target.y;
	const dist = Math.hypot(dx, dy);
	const stop = PLAYER_RADIUS + target.hitRadius() + BOOMERANG_RELEASE_GAP;
	if (dist <= stop)
		return release();

	const step = Math.min(BOOMERANG_PULL_SPEED * dt, dist - stop);
	const mx = dx / dist * step;
	const my = dy / dist * step;
	const reached = target instanceof Player
		? physics.movePlayer(target, mx, my, target)
		: physics.moveEntity(target, mx, my, BOX_HEIGHT);
	const progress = Math.hypot(reached.x - target.x, reached.y - target.y);
	target.x = reached.x;
	target.y = reached.y;
	target.vz = 0;

	const c = target.center();
	b.x = c.x;
	b.y = c.y;
	b.z = c.z;

	// Stuck behind a wall: let go
	if (step > 1 && progress < step * 0.1)
		return release();
	return true;
}


/* ---------------------------- Boxes & pickups ---------------------------- */

/**
 * Standing boxes fall when they are not held (a boomerang can drop them anywhere).
 * Broken boxes come back on their slot once their timer is over and nobody is in the way.
 */
function updateBoxes(state: HuntState, physics: HuntPhysics, dt: number) {
	for (const box of state.boxes) {
		if (box.isStanding()) {
			if (box.carriedBy < 0)
				fall(physics, box, dt, box);
			continue;
		}

		box.respawn -= dt;
		if (box.respawn > 0)
			continue;

		const body = box.getBody();
		const slot = box.slot;
		if (body && physics.overlapsPlayer(body.shape, slot.cx, slot.cy, slot.base, slot.base + BOX_HEIGHT)) {
			box.respawn = 0.1; // try again a bit later
			continue;
		}

		box.respawn = 0;
		box.hp = BOX_HP;
		box.resetToSlot();
	}
}

/** Players walking on an item grab it (if they have a free slot). Old items disappear. */
function updatePickups(state: HuntState, dt: number) {
	const kept: Pickup[] = [];
	const reach = PICKUP_RADIUS + PLAYER_RADIUS;

	for (const pickup of state.pickups) {
		pickup.life -= dt;
		if (pickup.life <= 0)
			continue;

		const taker = state.players.find(p =>
			p.isAlive() && p.hasFreeSlot() &&
			Math.abs(p.z - pickup.z) <= PICKUP_VERTICAL_REACH &&
			Math.hypot(p.x - pickup.x, p.y - pickup.y) <= reach
		);

		if (taker)
			taker.giveItem(pickup.item);
		else
			kept.push(pickup);
	}

	state.pickups = kept;
}

/** Age the kill feed. */
function updateKillFeed(state: HuntState, dt: number) {
	for (const k of state.killFeed)
		k.remaining -= dt;
	state.killFeed = state.killFeed.filter(k => k.remaining > 0);
}


/* ---------------------------- Ranking ---------------------------- */

/**
 * Players sorted from the best to the worst:
 * most kills, then fewest deaths, then earliest last kill, then most damage.
 */
export function ranking(players: Player[]) {
	return players
		.map((_, i) => i)
		.sort((a, b) => compareStanding(players[a], players[b]) || a - b);
}

/** Negative when `a` ranks before `b`, 0 when they are tied. */
export function compareStanding(a: Player, b: Player) {
	if (a.kills !== b.kills) return b.kills - a.kills;
	if (a.deaths !== b.deaths) return a.deaths - b.deaths;
	if (a.kills > 0 && Math.abs(a.lastKillTime - b.lastKillTime) > 1e-3)
		return a.lastKillTime - b.lastKillTime;
	if (Math.abs(a.damageDealt - b.damageDealt) > 0.5)
		return b.damageDealt - a.damageDealt;
	return 0;
}

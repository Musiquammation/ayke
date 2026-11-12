import {
	BOMB_ICE,
	BOX_HP,
	BOX_HEIGHT,
	BOX_RESPAWN,
	EXPLOSION_DAMAGE,
	EXPLOSION_KNOCKBACK_SPEED,
	EXPLOSION_KNOCKBACK_VZ,
	EXPLOSION_RADIUS,
	EXPLOSION_VERTICAL_REACH,
	GUN_HEIGHT,
	ICE_SLOW_FACTOR,
	ICE_SLOW_LINGER,
	ICE_ZONE_RADIUS,
	ICE_ZONE_VERTICAL_REACH,
	ITEM_BOMB,
	ITEM_ICE_BOMB,
	ITEM_JUMP,
	AMMO_DROP_CYCLE,
	AMMO_PICKUP_SPREAD,
	ITEM_DROP_CYCLE,
	ITEM_NONE,
	ITEM_SHELLS,
	JUMP_VELOCITY,
	KILL_FEED_SIZE,
	KILLS_TO_WIN,
	HOMING_TURN_RATE,
	LOCK_BOX,
	LOCK_NONE,
	LOCK_PLAYER,
	MATCH_DURATION,
	PUSH_DECAY,
	PUSH_MAX_SPEED,
	PICKUP_RADIUS,
	PICKUP_VERTICAL_REACH,
	PLAYER_RADIUS,
	PLAYER_SPEED,
	REGEN_DELAY,
	REGEN_RATE,
	RESPAWN_TIME,
	SHELL_DAMAGE,
	SHELL_KNOCKBACK_SPEED,
	SHELL_KNOCKBACK_VZ,
	SHELL_RADIUS,
	SIDE_JUMP_SPEED,
	STEP_HEIGHT,
	WEAPONS,
} from "./constants";
import {
	Bomb,
	Box,
	Entity,
	Explosion,
	IceZone,
	KillEvent,
	Pickup,
	Player,
	Projectile,
	Shell,
	Vec3,
} from "./entities";
import { LEVEL } from "./level";
import { HuntPhysics } from "./physics";
import {
	aimDirection,
	bombLaunch,
	fall,
	leapLaunch,
	shellLaunch,
	stepBomb,
	stepShell,
} from "./trajectories";

/* -------------------------------------------------------------------------- */
/* Game rules. Pure functions over the shared state: the same state and the   */
/* same inputs always give the same result (no randomness is needed).         */
/* -------------------------------------------------------------------------- */

/** Respawn timer value used to keep a disconnected player off the map forever. */
const NEVER = 1e9;
/** Golden angle: spreads the pellets of a shot evenly in their disc. */
const GOLDEN_ANGLE = 2.399963;

export type AimPoint = Vec3;

/** Everything the rules read and write. Implemented by GMHunt. */
export interface HuntState {
	readonly players: Player[];
	readonly boxes: Box[];
	projectiles: Projectile[];
	bombs: Bomb[];
	shells: Shell[];
	explosions: Explosion[];
	iceZones: IceZone[];
	pickups: Pickup[];
	killFeed: KillEvent[];
	time: number;
	finished: boolean;
	/** Items dropped so far by the boxes (position in ITEM_DROP_CYCLE). */
	drops: number;
}


/* ---------------------------- Setup ---------------------------- */

/** Put every player on its initial spawn point (spawn i for player i). */
export function initialSpawn(state: HuntState) {
	for (const [i, p] of state.players.entries()) {
		const s = LEVEL.spawns[i % LEVEL.spawns.length];
		p.spawnAt(s.x, s.y, 0);
		p.ammo = WEAPONS.map(w => w.startAmmo);
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
	for (const p of state.players) {
		updatePlayer(state, physics, p, dt);
	}

	// Bullets must see where the players are now
	physics.sync();
	updateProjectiles(state, physics, dt);
	updateBombs(state, physics, dt);
	updateShells(state, physics, dt);
	updateExplosions(state, dt);
	updateIceZones(state, dt);
	updateBoxes(state, physics, dt);
	updatePickups(state, dt);
	updateKillFeed(state, dt);

	if (state.time <= 0 || state.players.some(p => p.kills >= KILLS_TO_WIN))
		state.finished = true;
}


/* ---------------------------- Players ---------------------------- */

/** Timers, respawn, movement, jump and regen of one player. */
function updatePlayer(state: HuntState, physics: HuntPhysics, p: Player, dt: number) {
	if (!p.connected && p.isAlive()) {
		p.respawn = NEVER; // a disconnected player leaves the map (no kill credited)
		return;
	}

	if (!p.isAlive()) {
		updateRespawn(state, physics, p, dt);
		return;
	}

	updateTimers(p, dt);
	updateHorizontalMove(physics, p, dt);
	updateVerticalMove(state, physics, p, dt);
	updateRegen(p, dt);
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
	// Dying keeps the ammo left, plus a small refill
	for (const [w, def] of WEAPONS.entries())
		p.giveAmmo(w, def.respawnAmmo);
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

	const fade = Math.exp(-PUSH_DECAY * dt);
	p.pushX *= fade;
	p.pushY *= fade;
	if (Math.hypot(p.pushX, p.pushY) < 5) {
		p.pushX = 0;
		p.pushY = 0;
	}
}

/** Walking speed multiplier (slowed by the ice). */
function speedFactor(p: Player) {
	return p.slowTimer > 0 ? ICE_SLOW_FACTOR : 1;
}

/** Entity a lock (LOCK_* kind and index) points to, or null when it is not on the map. */
function lockedEntity(state: HuntState, kind: number, idx: number): Player | Box | null {
	const e = kind === LOCK_PLAYER ? state.players[idx]
		: kind === LOCK_BOX ? state.boxes[idx]
		: undefined;
	return e && e.isTargetable() ? e : null;
}

/**
 * Move on the ground plane, sliding along obstacles (Rapier shape casts):
 * with ZQSD, or along the arc of a super jump, a side jump or a knockback.
 */
function updateHorizontalMove(physics: HuntPhysics, p: Player, dt: number) {
	const free = physics.resolvePenetration(p);
	p.x = free.x;
	p.y = free.y;

	let dx: number, dy: number;
	if (p.leaping || p.sideJump || p.launched) {
		dx = p.vx * dt;
		dy = p.vy * dt;
	} else {
		// Walking, plus the shotgun push (the player keeps control)
		dx = p.pushX * dt;
		dy = p.pushY * dt;
		const len = Math.hypot(p.moveX, p.moveY);
		if (len > 0) {
			const speed = PLAYER_SPEED * speedFactor(p);
			dx += p.moveX / len * speed * dt;
			dy += p.moveY / len * speed * dt;
		}
		if (dx === 0 && dy === 0)
			return;
	}

	const reached = physics.movePlayer(p, dx, dy, p);
	p.x = reached.x;
	p.y = reached.y;
}

/**
 * Gravity, jumps and landing on the highest surface under the player.
 * Jumping with Q / D while locked makes a fast side jump. Landing ends a knockback.
 */
function updateVerticalMove(state: HuntState, physics: HuntPhysics, p: Player, dt: number) {
	const ground = physics.groundHeight(p.x, p.y, p.z);
	const grounded = p.z <= ground + 0.5 && p.vz <= 0;

	if (p.jumpQueued && grounded && !p.launched) {
		p.vz = JUMP_VELOCITY;
		const locked = lockedEntity(state, p.lockKind, p.lockIdx);
		if (p.moveX !== 0 && !p.leaping && locked && locked !== p) {
			p.sideJump = true;
			p.vx = p.moveX * SIDE_JUMP_SPEED * speedFactor(p);
			p.vy = p.moveY * PLAYER_SPEED * speedFactor(p);
		}
	}
	p.jumpQueued = false;

	const landed = fall(physics, p, dt, p);
	if (landed && (p.leaping || p.sideJump || p.launched)) {
		p.leaping = false;
		p.sideJump = false;
		p.launched = false;
		p.vx = 0;
		p.vy = 0;
	}
}

/** Regenerate life when out of combat. */
function updateRegen(p: Player, dt: number) {
	p.sinceCombat += dt;
	if (p.sinceCombat >= REGEN_DELAY)
		p.hp = Math.min(p.maxHp, p.hp + REGEN_RATE * dt);
}


/* ---------------------------- Shooting ---------------------------- */

/** True when the player can shoot right now (used by inputs, bots and the client). */
export function canShoot(p: Player) {
	return p.canAttack() && p.shotCooldown <= 0 && p.ammo[p.weapon] > 0;
}

/**
 * Shoot the current weapon toward a 3D aim point, using one of its ammo. Every bullet flies in a
 * straight line from the gun to the aim point (pellets to points around it).
 * Homing weapons fired while locked aim at the target and follow it.
 */
export function shoot(state: HuntState, idx: number, aim: AimPoint) {
	const p = state.players[idx];
	if (!canShoot(p))
		return;

	const def = WEAPONS[p.weapon];
	p.ammo[p.weapon]--;
	p.shotCooldown = def.cooldown;
	p.sinceCombat = 0;
	p.spawnShield = 0; // attacking ends the spawn protection

	// Homing weapons fired while locked go to the target (and follow it, see updateProjectiles)
	const locked = def.homing ? lockedEntity(state, p.lockKind, p.lockIdx) : null;
	if (locked && locked !== p)
		aim = locked.center();

	const dir = aimDirection(p, aim);
	p.facing = Math.atan2(dir.y, dir.x);

	// Pellets spread in a cone of constant angle around the aim: yaw and pitch offsets
	// spread evenly in a disc of `spread` radius (radians), whatever the aim distance
	const reach = Math.max(PLAYER_RADIUS * 2, Math.hypot(aim.x - p.x, aim.y - p.y));
	for (let i = 0; i < def.count; i++) {
		const r = def.count > 1 ? def.spread * Math.sqrt((i + 0.5) / def.count) : 0;
		const a = i * GOLDEN_ANGLE;
		const yaw = p.facing + Math.cos(a) * r;
		const target = r === 0 ? aim : {
			x: p.x + Math.cos(yaw) * reach,
			y: p.y + Math.sin(yaw) * reach,
			z: aim.z + Math.tan(Math.sin(a) * r) * reach,
		};
		const b = spawnBullet(state, p, idx, p.weapon, target);
		if (locked && locked !== p) {
			b.homingKind = p.lockKind;
			b.homingIdx = p.lockIdx;
		}
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
	return b;
}

/**
 * Turn a homing bullet toward its target center, by HOMING_TURN_RATE at most
 * (so a fast side jump can still dodge it). The speed does not change.
 */
function steerProjectile(state: HuntState, b: Projectile, dt: number) {
	const target = lockedEntity(state, b.homingKind, b.homingIdx);
	if (!target) {
		b.homingKind = LOCK_NONE; // the target is gone: fly straight
		return;
	}

	const speed = Math.hypot(b.vx, b.vy, b.vz);
	const c = target.center();
	const tx = c.x - b.x;
	const ty = c.y - b.y;
	const tz = c.z - b.z;
	const dist = Math.hypot(tx, ty, tz);
	if (speed < 1e-3 || dist < 1e-3)
		return;

	// Current and wanted directions, then rotate from one to the other (capped angle)
	const ux = b.vx / speed, uy = b.vy / speed, uz = b.vz / speed;
	const wx = tx / dist, wy = ty / dist, wz = tz / dist;
	const angle = Math.acos(Math.max(-1, Math.min(1, ux * wx + uy * wy + uz * wz)));
	if (angle < 1e-4)
		return;

	const t = Math.min(1, HOMING_TURN_RATE * dt / angle);
	const s0 = Math.sin((1 - t) * angle) / Math.sin(angle);
	const s1 = Math.sin(t * angle) / Math.sin(angle);
	b.vx = (ux * s0 + wx * s1) * speed;
	b.vy = (uy * s0 + wy * s1) * speed;
	b.vz = (uz * s0 + wz * s1) * speed;
}

/** Players a bullet of `owner` can hit (obstacles and boxes always stop bullets). */
function hittablePlayers(owner: number) {
	return (e: Entity) => e instanceof Player && e.idx !== owner && e.isTargetable();
}

/** Move every bullet, using Rapier shape casts to find what it hits. */
function updateProjectiles(state: HuntState, physics: HuntPhysics, dt: number) {
	const kept: Projectile[] = [];

	for (const b of state.projectiles) {
		if (b.homingKind !== LOCK_NONE)
			steerProjectile(state, b, dt);

		const dx = b.vx * dt;
		const dy = b.vy * dt;
		const dz = b.vz * dt;
		const radius = WEAPONS[b.weapon].radius;

		const hit = physics.castBall(b.x, b.y, b.z, dx, dy, dz, radius, hittablePlayers(b.owner));
		if (hit) {
			if (hit.entity instanceof Player)
				pushPlayer(hit.entity, b.vx, b.vy, WEAPONS[b.weapon].push);
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


/**
 * Push a player along (dirX, dirY) without stunning it: the speed is added to its
 * walking speed and fades out. The total push speed is capped.
 */
function pushPlayer(p: Player, dirX: number, dirY: number, speed: number) {
	const len = Math.hypot(dirX, dirY);
	if (speed <= 0 || len < 1e-3 || !p.isAlive() || p.spawnShield > 0)
		return;

	p.pushX += dirX / len * speed;
	p.pushY += dirY / len * speed;
	const total = Math.hypot(p.pushX, p.pushY);
	if (total > PUSH_MAX_SPEED) {
		p.pushX *= PUSH_MAX_SPEED / total;
		p.pushY *= PUSH_MAX_SPEED / total;
	}
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
		killPlayer(state, victimIdx);
}

/** Remove a player from the map (it keeps its items) and give the kill to its last attacker. */
function killPlayer(state: HuntState, victimIdx: number) {
	const victim = state.players[victimIdx];
	victim.hp = 0;
	victim.respawn = RESPAWN_TIME;
	victim.deaths++;
	victim.moveX = 0;
	victim.moveY = 0;
	victim.leaping = false;
	victim.sideJump = false;
	victim.launched = false;
	victim.slowTimer = 0;
	victim.pushX = 0;
	victim.pushY = 0;

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

/** Hurt a box. A broken box drops an item and some ammo, and comes back later on its slot. */
function damageBox(state: HuntState, box: Box, amount: number) {
	if (!box.isStanding())
		return;

	box.hp -= amount;
	if (box.hp > 0)
		return;

	box.hp = 0;
	box.respawn = BOX_RESPAWN;
	box.breaks++;

	// One item and some ammo pickups around it, both following their cycles
	const breakIdx = state.drops++;
	const item = ITEM_DROP_CYCLE[breakIdx % ITEM_DROP_CYCLE.length];
	state.pickups.push(Pickup.create(box.x, box.y, box.z, item));
	const ammo = AMMO_DROP_CYCLE[breakIdx % AMMO_DROP_CYCLE.length];
	for (const [k, weapon] of ammo.entries()) {
		const a = (k + 0.5) / ammo.length * Math.PI * 2;
		state.pickups.push(Pickup.createAmmo(
			box.x + Math.cos(a) * AMMO_PICKUP_SPREAD,
			box.y + Math.sin(a) * AMMO_PICKUP_SPREAD,
			box.z, weapon,
		));
	}
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
		case ITEM_BOMB:
		case ITEM_ICE_BOMB: {
			const b = new Bomb();
			Object.assign(b, bombLaunch(physics, p, aim));
			b.owner = idx;
			b.kind = item === ITEM_ICE_BOMB ? BOMB_ICE : b.kind;
			state.bombs.push(b);
			break;
		}

		case ITEM_SHELLS:
			for (const body of shellLaunch(p, aim))
				state.shells.push(Object.assign(new Shell(), body));
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


/* ---------------------------- Knockback ---------------------------- */

/**
 * Throw a player along (dirX, dirY) (a unit vector): it flies up and cannot act
 * until it lands. Players protected by their spawn shield are not moved.
 */
function launchPlayer(p: Player, dirX: number, dirY: number, speed: number, vz: number) {
	if (!p.isAlive() || p.spawnShield > 0)
		return;

	p.launched = true;
	p.pushX = 0;
	p.pushY = 0;
	p.leaping = false;
	p.sideJump = false;
	p.vx = dirX * speed;
	p.vy = dirY * speed;
	p.vz = vz;
}


/* ---------------------------- Bombs & explosions ---------------------------- */

/**
 * Move bombs along their arc. When they touch something or land, they explode
 * (or leave an ice zone for an ice bomb).
 */
function updateBombs(state: HuntState, physics: HuntPhysics, dt: number) {
	const kept: Bomb[] = [];
	for (const b of state.bombs) {
		const at = stepBomb(physics, b, b.owner, dt);
		if (!at)
			kept.push(b);
		else if (b.kind === BOMB_ICE)
			state.iceZones.push(IceZone.create(at.x, at.y, at.z));
		else
			explode(state, physics, at, b.owner);
	}
	state.bombs = kept;
}

/**
 * Damage every player (the thrower too) and every box in the blast, and throw the
 * players backward. Obstacles protect what is behind them (same rays as `explosionZone`).
 */
function explode(state: HuntState, physics: HuntPhysics, at: Vec3, owner: number) {
	const e = new Explosion();
	e.x = at.x;
	e.y = at.y;
	e.z = at.z;
	state.explosions.push(e);

	const rayZ = at.z + STEP_HEIGHT;
	for (const [i, p] of state.players.entries()) {
		if (!p.isAlive())
			continue;
		const d = Math.hypot(p.x - at.x, p.y - at.y);
		if (d > EXPLOSION_RADIUS + PLAYER_RADIUS || Math.abs(p.z - at.z) > EXPLOSION_VERTICAL_REACH)
			continue;
		if (!physics.lineOfSight(at.x, at.y, p.x, p.y, rayZ))
			continue;

		damagePlayer(state, physics, i, EXPLOSION_DAMAGE, owner);
		// Away from the blast (backward from the facing when right on it)
		const ux = d > 1 ? (p.x - at.x) / d : -Math.cos(p.facing);
		const uy = d > 1 ? (p.y - at.y) / d : -Math.sin(p.facing);
		launchPlayer(p, ux, uy, EXPLOSION_KNOCKBACK_SPEED, EXPLOSION_KNOCKBACK_VZ);
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


/** Melt ice zones, and slow the players standing in one (the slow lingers after leaving). */
function updateIceZones(state: HuntState, dt: number) {
	for (const z of state.iceZones)
		z.remaining -= dt;
	state.iceZones = state.iceZones.filter(z => z.remaining > 0);

	for (const p of state.players) {
		if (!p.isAlive())
			continue;
		const inside = state.iceZones.some(z =>
			Math.abs(p.z - z.z) <= ICE_ZONE_VERTICAL_REACH &&
			Math.hypot(p.x - z.x, p.y - z.y) <= ICE_ZONE_RADIUS
		);
		p.slowTimer = inside ? ICE_SLOW_LINGER : Math.max(0, p.slowTimer - dt);
	}
}


/* ---------------------------- Shells ---------------------------- */

/**
 * Slide the shells. A shell touching a player hurts it and throws it up (stunned
 * until it lands); two armed shells touching each other both break.
 */
function updateShells(state: HuntState, physics: HuntPhysics, dt: number) {
	const moved: Shell[] = [];
	for (const s of state.shells) {
		s.life -= dt;
		if (s.life <= 0)
			continue;

		const result = stepShell(physics, s, dt);
		if (result === 'broken')
			continue;
		if (result) {
			hitByShell(state, physics, result, s);
			continue;
		}
		moved.push(s);
	}

	const broken = new Set<Shell>();
	for (let i = 0; i < moved.length; i++) {
		const a = moved[i];
		for (let j = i + 1; j < moved.length; j++) {
			const b = moved[j];
			if (!a.isArmed() || !b.isArmed())
				continue;
			if (Math.abs(a.z - b.z) < SHELL_RADIUS * 2 && Math.hypot(a.x - b.x, a.y - b.y) < SHELL_RADIUS * 2) {
				broken.add(a);
				broken.add(b);
			}
		}
	}

	state.shells = moved.filter(s => !broken.has(s));
}

/** A shell touched a player: damage, then thrown along the shell's motion. */
function hitByShell(state: HuntState, physics: HuntPhysics, p: Player, s: Shell) {
	damagePlayer(state, physics, p.idx, SHELL_DAMAGE, s.owner);
	const speed = Math.hypot(s.vx, s.vy);
	if (speed > 1e-3)
		launchPlayer(p, s.vx / speed, s.vy / speed, SHELL_KNOCKBACK_SPEED, SHELL_KNOCKBACK_VZ);
}


/* ---------------------------- Boxes & pickups ---------------------------- */

/**
 * Standing boxes fall onto what is under them.
 * Broken boxes come back on their slot once their timer is over and nobody is in the way.
 */
function updateBoxes(state: HuntState, physics: HuntPhysics, dt: number) {
	for (const box of state.boxes) {
		if (box.isStanding()) {
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

/**
 * Players walking on a pickup grab it: an item if they have a free slot, ammo if
 * that weapon is not full. Old pickups disappear.
 */
function updatePickups(state: HuntState, dt: number) {
	const kept: Pickup[] = [];
	const reach = PICKUP_RADIUS + PLAYER_RADIUS;

	for (const pickup of state.pickups) {
		pickup.life -= dt;
		if (pickup.life <= 0)
			continue;

		const taker = state.players.find(p =>
			p.isAlive() && (pickup.isAmmo() ? p.canTakeAmmo(pickup.ammoWeapon) : p.hasFreeSlot()) &&
			Math.abs(p.z - pickup.z) <= PICKUP_VERTICAL_REACH &&
			Math.hypot(p.x - pickup.x, p.y - pickup.y) <= reach
		);

		if (taker && pickup.isAmmo())
			taker.giveAmmo(pickup.ammoWeapon, pickup.ammoAmount);
		else if (taker)
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

import RAPIER from '@dimforge/rapier2d-compat';
import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { ALL, GROUP_PLAYER, groups, Span } from "../collision";
import {
	CURSOR_COLOR,
	ITEM_NONE,
	ITEM_SLOTS,
	LOCK_NONE,
	MAX_HP,
	PLAYER_HEIGHT,
	PLAYER_RADIUS,
	SPAWN_SHIELD_TIME,
	WEAPON_LONG,
	WEAPONS,
} from "../constants";
import { Damageable, MovingEntity, ViewContext } from "./Entity";
import { ownedTransparent, place, solid, unitBox, unitCylinder, unitOctahedron, unitRing, unitSphere, yaw } from "./models";

/**
 * A player: a vertical cylinder. vx / vy are only used during a super jump, a
 * side jump or a knockback (the walking speed comes from moveX / moveY).
 */
export class Player extends MovingEntity implements Damageable {
	readonly maxHp = MAX_HP;
	connected = true;

	// Requested movement (set by runInput, used by run)
	moveX = 0;
	moveY = 0;
	jumpQueued = false;

	// Lock: aims homing weapons, and jumping with Q / D while set makes a side jump
	lockKind = LOCK_NONE;
	lockIdx = 0;
	sideJump = false;

	// Life
	hp = MAX_HP;
	respawn = -1;
	sinceCombat = 0;
	spawnShield = 0;
	lastAttacker = -1;

	// Weapons
	weapon = WEAPON_LONG;
	/** Ammo of each weapon (one ammo = one shot). */
	ammo: number[] = WEAPONS.map(w => w.startAmmo);
	shotCooldown = 0;
	facing = 0;

	// Items
	items: number[] = new Array(ITEM_SLOTS).fill(ITEM_NONE);
	selectedItem = 0;
	leaping = false;

	// Effects suffered
	launched = false; // thrown by a blast or a shell: no control and no attack until landing
	slowTimer = 0;    // slowed by an ice zone while > 0
	pushX = 0;        // shotgun push: added to the walking speed, fades out
	pushY = 0;

	// Score
	kills = 0;
	deaths = 0;
	damageDealt = 0;
	lastKillTime = 0;

	constructor(readonly idx: number) {
		super();
	}

	/** True when the player is on the map (not waiting for a respawn). */
	isAlive() {
		return this.respawn < 0;
	}

	/** True when the player may shoot or use an item. */
	canAttack() {
		return this.isAlive() && !this.launched;
	}

	isTargetable() {
		return this.isAlive();
	}

	center() {
		return { x: this.x, y: this.y, z: this.z + PLAYER_HEIGHT / 2 };
	}

	hitRadius() {
		return PLAYER_RADIUS;
	}

	/** Put the player back on the map at the given point, with full life (the ammo is kept). */
	spawnAt(x: number, y: number, z: number) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.vx = 0;
		this.vy = 0;
		this.vz = 0;
		this.hp = MAX_HP;
		this.respawn = -1;
		this.sinceCombat = 0;
		this.spawnShield = SPAWN_SHIELD_TIME;
		this.lastAttacker = -1;
		this.shotCooldown = 0;
		this.leaping = false;
		this.sideJump = false;
		this.launched = false;
		this.slowTimer = 0;
		this.pushX = 0;
		this.pushY = 0;
		this.jumpQueued = false;
	}

	/** True when picking ammo of this weapon is useful. */
	canTakeAmmo(weapon: number) {
		return this.ammo[weapon] < WEAPONS[weapon].maxAmmo;
	}

	/** Add ammo to a weapon, up to its maximum. */
	giveAmmo(weapon: number, amount: number) {
		this.ammo[weapon] = Math.min(WEAPONS[weapon].maxAmmo, this.ammo[weapon] + amount);
	}

	/** Add an item in the first free slot. Returns false when the inventory is full. */
	giveItem(item: number) {
		const slot = this.items.indexOf(ITEM_NONE);
		if (slot < 0)
			return false;

		this.items[slot] = item;
		return true;
	}

	/** True when at least one slot is free. */
	hasFreeSlot() {
		return this.items.includes(ITEM_NONE);
	}

	override save(): Fields {
		return {
			...super.save(),
			connected: this.connected,
			moveX: this.moveX, moveY: this.moveY, jumpQueued: this.jumpQueued,
			lockKind: this.lockKind, lockIdx: this.lockIdx, sideJump: this.sideJump,
			hp: this.hp, respawn: this.respawn, sinceCombat: this.sinceCombat,
			spawnShield: this.spawnShield, lastAttacker: this.lastAttacker,
			weapon: this.weapon, ammo: this.ammo,
			shotCooldown: this.shotCooldown, facing: this.facing,
			items: this.items, selectedItem: this.selectedItem,
			leaping: this.leaping, launched: this.launched, slowTimer: this.slowTimer,
			pushX: this.pushX, pushY: this.pushY,
			kills: this.kills, deaths: this.deaths,
			damageDealt: this.damageDealt, lastKillTime: this.lastKillTime,
		};
	}

	override load(obj: Fields) {
		super.load(obj);
		this.connected = obj.connected ?? false;
		this.moveX = obj.moveX ?? 0;
		this.moveY = obj.moveY ?? 0;
		this.jumpQueued = obj.jumpQueued ?? false;
		this.lockKind = obj.lockKind ?? LOCK_NONE;
		this.lockIdx = obj.lockIdx ?? 0;
		this.sideJump = obj.sideJump ?? false;
		this.hp = obj.hp ?? 0;
		this.respawn = obj.respawn ?? 0;
		this.sinceCombat = obj.sinceCombat ?? 0;
		this.spawnShield = obj.spawnShield ?? 0;
		this.lastAttacker = obj.lastAttacker ?? -1;
		this.weapon = obj.weapon ?? WEAPON_LONG;
		const ammo: number[] = obj.ammo ?? [];
		this.ammo = WEAPONS.map((_, i) => ammo[i] ?? 0);
		this.shotCooldown = obj.shotCooldown ?? 0;
		this.facing = obj.facing ?? 0;
		const items: number[] = obj.items ?? [];
		this.items = Array.from({ length: ITEM_SLOTS }, (_, i) => items[i] ?? ITEM_NONE);
		this.selectedItem = obj.selectedItem ?? 0;
		this.leaping = obj.leaping ?? false;
		this.launched = obj.launched ?? false;
		this.slowTimer = obj.slowTimer ?? 0;
		this.pushX = obj.pushX ?? 0;
		this.pushY = obj.pushY ?? 0;
		this.kills = obj.kills ?? 0;
		this.deaths = obj.deaths ?? 0;
		this.damageDealt = obj.damageDealt ?? 0;
		this.lastKillTime = obj.lastKillTime ?? 0;
	}

	/* ---------- Physics ---------- */

	protected override describeBody() {
		return RAPIER.ColliderDesc.ball(PLAYER_RADIUS)
			.setSensor(true)
			.setCollisionGroups(groups(GROUP_PLAYER, ALL));
	}

	override syncBody() {
		this.body?.setTranslation({ x: this.x, y: this.y });
		this.body?.setEnabled(this.isAlive());
	}

	override span(): Span | null {
		return this.isAlive() ? { base: this.z, top: this.z + PLAYER_HEIGHT } : null;
	}

	/* ---------- Model ---------- */

	override isVisible() {
		return this.isAlive();
	}

	protected override createModel(view: ViewContext) {
		const color = view.color(this.idx);
		const group = new THREE.Group();

		const body = new THREE.Mesh(unitCylinder(), solid(color));
		body.scale.set(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT);
		body.castShadow = true;
		group.add(body);

		// Lighter cap on the head
		const cap = new THREE.Mesh(unitCylinder(), solid(color, 0.25));
		cap.scale.set(PLAYER_RADIUS * 0.8, PLAYER_RADIUS * 0.8, 4);
		cap.position.z = PLAYER_HEIGHT / 2 + 1;
		group.add(cap);

		// Outline ring: blue for the local player, dark for the others
		const ring = new THREE.Mesh(unitRing(), solid(this.idx === view.selfIdx ? CURSOR_COLOR : "#222222", 0.4));
		ring.scale.setScalar(PLAYER_RADIUS + 4);
		ring.position.z = PLAYER_HEIGHT / 2 + 4;
		group.add(ring);

		// Gun, on a pivot turned toward `facing`
		const pivot = new THREE.Group();
		pivot.name = 'pivot';
		pivot.position.z = PLAYER_HEIGHT * 0.4;
		const gun = new THREE.Mesh(unitBox(), solid("#333333"));
		gun.name = 'gun';
		gun.scale.set(PLAYER_RADIUS + 18, 12, 12);
		gun.position.x = (PLAYER_RADIUS + 18) / 2;
		gun.castShadow = true;
		pivot.add(gun);
		group.add(pivot);

		// Spawn protection bubble
		const bubble = new THREE.Mesh(unitSphere(), ownedTransparent("#ffffff", 0.18));
		bubble.name = 'bubble';
		bubble.scale.set(PLAYER_RADIUS + 14, PLAYER_RADIUS + 14, PLAYER_HEIGHT * 0.7);
		group.add(bubble);

		// Stun: small stars turning above the head
		const stars = new THREE.Group();
		stars.name = 'stars';
		stars.position.z = PLAYER_HEIGHT / 2 + 22;
		for (let i = 0; i < 3; i++) {
			const star = new THREE.Mesh(unitOctahedron(), solid("#fde047", 0.8));
			const a = i * Math.PI * 2 / 3;
			star.scale.setScalar(7);
			star.position.set(Math.cos(a) * 24, Math.sin(a) * 24, 0);
			stars.add(star);
		}
		group.add(stars);

		// Slowed by ice: a frosty ring around the feet
		const frost = new THREE.Mesh(unitRing(), ownedTransparent("#bae6fd", 0.85));
		frost.name = 'frost';
		frost.scale.setScalar(PLAYER_RADIUS + 10);
		frost.position.z = -PLAYER_HEIGHT / 2 + 2;
		group.add(frost);

		return group;
	}

	protected override updateModel(model: THREE.Object3D, view: ViewContext) {
		place(model, this.x, this.y, this.z + PLAYER_HEIGHT / 2);

		// The local gun follows the aim without waiting for the server
		const facing = this.idx === view.selfIdx ? view.selfFacing ?? this.facing : this.facing;
		model.getObjectByName('pivot')!.rotation.z = yaw(facing);
		const gun = model.getObjectByName('gun') as THREE.Mesh;
		gun.material = solid(WEAPONS[this.weapon].color);

		model.getObjectByName('bubble')!.visible = this.spawnShield > 0;

		const stars = model.getObjectByName('stars')!;
		stars.visible = this.launched;
		stars.rotation.z = view.clock * 5;

		const frost = model.getObjectByName('frost')!;
		frost.visible = this.slowTimer > 0;
		frost.rotation.z = view.clock * 1.5;

		// Tumble backward while thrown
		model.rotation.set(0, 0, 0);
		if (this.launched) {
			model.rotation.x = -this.vy * 0.0006;
			model.rotation.y = -this.vx * 0.0006;
		}
	}
}

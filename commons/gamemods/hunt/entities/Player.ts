import RAPIER from '@dimforge/rapier2d-compat';
import * as THREE from 'three';
import { Fields } from "../../../Fields";
import { ALL, GROUP_PLAYER, groups, Span } from "../collision";
import {
	CURSOR_COLOR,
	ITEM_NONE,
	ITEM_SLOTS,
	MAX_AMMO,
	MAX_HP,
	PLAYER_HEIGHT,
	PLAYER_RADIUS,
	SPAWN_SHIELD_TIME,
	WEAPON_LONG,
	WEAPONS,
} from "../constants";
import { Carryable, Damageable, MovingEntity, ViewContext } from "./Entity";
import { ownedTransparent, place, solid, unitBox, unitCylinder, unitOctahedron, unitRing, unitSphere, yaw } from "./models";

/**
 * A player: a vertical cylinder. vx / vy are only used during a super jump
 * (the walking speed comes from moveX / moveY).
 */
export class Player extends MovingEntity implements Damageable, Carryable {
	readonly maxHp = MAX_HP;
	connected = true;

	// Requested movement (set by runInput, used by run)
	moveX = 0;
	moveY = 0;
	jumpQueued = false;

	// Life
	hp = MAX_HP;
	respawn = -1;
	sinceCombat = 0;
	spawnShield = 0;
	lastAttacker = -1;

	// Weapons
	weapon = WEAPON_LONG;
	ammo = MAX_AMMO;
	/** Integer the ammo is draining to, -1 when no cartridge is being drained. */
	ammoDrainTo = -1;
	/** Time left before the ammo starts going back up. */
	reloadDelay = 0;
	shotCooldown = 0;
	facing = 0;

	// Items
	items: number[] = new Array(ITEM_SLOTS).fill(ITEM_NONE);
	selectedItem = 0;
	leaping = false;
	dashTimer = 0;
	dashDirX = 1;
	dashDirY = 0;

	// Effects suffered
	draggedBy = -1;   // index of the dashing player dragging us
	carriedBy = -1;   // index of the player whose boomerang drags us
	stunTimer = 0;    // cannot attack while > 0

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

	/** True when the player is moved by someone else (dash, boomerang). */
	isControlled() {
		return this.draggedBy >= 0 || this.carriedBy >= 0;
	}

	/** True when the player may shoot or use an item. */
	canAttack() {
		return this.isAlive() && this.stunTimer <= 0 && !this.isControlled() && this.dashTimer <= 0;
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

	/** Put the player back on the map at the given point, with full life and ammo. */
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
		this.ammo = MAX_AMMO;
		this.ammoDrainTo = -1;
		this.reloadDelay = 0;
		this.shotCooldown = 0;
		this.leaping = false;
		this.dashTimer = 0;
		this.draggedBy = -1;
		this.carriedBy = -1;
		this.stunTimer = 0;
		this.jumpQueued = false;
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
			hp: this.hp, respawn: this.respawn, sinceCombat: this.sinceCombat,
			spawnShield: this.spawnShield, lastAttacker: this.lastAttacker,
			weapon: this.weapon, ammo: this.ammo, ammoDrainTo: this.ammoDrainTo,
			reloadDelay: this.reloadDelay, shotCooldown: this.shotCooldown, facing: this.facing,
			items: this.items, selectedItem: this.selectedItem,
			leaping: this.leaping, dashTimer: this.dashTimer,
			dashDirX: this.dashDirX, dashDirY: this.dashDirY,
			draggedBy: this.draggedBy, carriedBy: this.carriedBy, stunTimer: this.stunTimer,
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
		this.hp = obj.hp ?? 0;
		this.respawn = obj.respawn ?? 0;
		this.sinceCombat = obj.sinceCombat ?? 0;
		this.spawnShield = obj.spawnShield ?? 0;
		this.lastAttacker = obj.lastAttacker ?? -1;
		this.weapon = obj.weapon ?? WEAPON_LONG;
		this.ammo = obj.ammo ?? 0;
		this.ammoDrainTo = obj.ammoDrainTo ?? -1;
		this.reloadDelay = obj.reloadDelay ?? 0;
		this.shotCooldown = obj.shotCooldown ?? 0;
		this.facing = obj.facing ?? 0;
		const items: number[] = obj.items ?? [];
		this.items = Array.from({ length: ITEM_SLOTS }, (_, i) => items[i] ?? ITEM_NONE);
		this.selectedItem = obj.selectedItem ?? 0;
		this.leaping = obj.leaping ?? false;
		this.dashTimer = obj.dashTimer ?? 0;
		this.dashDirX = obj.dashDirX ?? 1;
		this.dashDirY = obj.dashDirY ?? 0;
		this.draggedBy = obj.draggedBy ?? -1;
		this.carriedBy = obj.carriedBy ?? -1;
		this.stunTimer = obj.stunTimer ?? 0;
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
		stars.visible = this.stunTimer > 0;
		stars.rotation.z = view.clock * 5;

		// Lean forward while dashing
		model.rotation.set(0, 0, 0);
		if (this.dashTimer > 0) {
			model.rotation.x = this.dashDirY * 0.35;
			model.rotation.y = this.dashDirX * 0.35;
		}
	}
}

import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { getLogger } from "../../server/Logger";
import { Fields } from "../Fields";
import { FinishGame, GameMode } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

const protocols = getProtocol('turrets', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
}

const GRAVITY = 1100;
const WIDTH = 2400;
const HEIGHT = 1350;

const FULL_ROOM_SIZE = WIDTH * 2.5;
const ROOM_SIZE = WIDTH * 1.5;
const BRIDGE_SIZE = WIDTH * 0.3;
const BULLET_DAMAGE = 15;

const TURRET_RADIUS = WIDTH * 0.6;
const TURRET_ACTIVATION = 100;
const TURRET_COOLDOWN = 2.0; 
const TURRET_HP = 200;
const TURRET_START_COOLDOWN = 5.0;
const TURRET_ITEM_DAMAGES = 500;
const TURRET_PAUSE = 1.25;

const MINIMAP_X = WIDTH * 0.79;
const MINIMAP_Y = HEIGHT * 0.01;
const MINIMAP_RATIO = 0.2;

const ITEM_COUNT = 3;
const TURRET_ITEM_COUNT = 2;

interface FixedTarget {
	type: 'fixed';
	x: number;
	y: number;
}

interface DeltaTarget {
	type: 'delta';
	dx: number;
	dy: number;
}

interface AutoTarget {
	type: 'auto';
}

class Player {
	static readonly SPEED = 15000;
	static readonly ACCELERATION = 10000;
	static readonly MIN_DECELERATION = 1000;
	static readonly SOFT_DECELERATION = 10000;
	static readonly QUICK_DECELERATION = 30000;
	static readonly COOLDOWN = 3.0;

	static readonly RADIUS = 60;
	static readonly PUSH_DOWN = 1000;
	static readonly THROW = 1200;
	static readonly BOUNCE_X = 1000;
	static readonly BOUNCE_Y = 100;

	// --- Health System ---
	static readonly MAX_HP = 100;

	// --- Attack System Constants ---
	static readonly ATTACK_FULL = 5.0;
	static readonly ATTACK_RELOAD = 3.0;
	static readonly ATTACK_SLOW_RELOAD = 1.8;
	static readonly ATTACK_COOLDOWN = 2.0;
	static readonly ATTACK_DELAY = 0.5;

	static readonly GRAB_GRAVITY = 900;

	spawnX: number | null = null;
	spawnY: number | null = null;

	connected = true;
	alive = -1;

	vx = 0;
	vy = 0;

	dirX = 0;
	dirY = 0;

	score = 0;

	hp = Player.MAX_HP;
	maxHp = Player.MAX_HP;

	target: FixedTarget | DeltaTarget | AutoTarget | null = null;
	team: 'red' | 'blue' = 'red';

	items: number[] = Array(ITEM_COUNT).fill(-1);
	selectedItem: number = -1;


	// --- Attack System Variables ---
	attackMunitions = Player.ATTACK_FULL;
	attackCooldown = 0;
	attackTimer = Player.ATTACK_DELAY;
	attackFullyReloading = false;

	// --- Per-frame entity effects ---
	// These are wiped every frame by resetEffects() and re-applied by any
	// active entity (EStar, ...) that still targets this player, so an
	// effect only lasts as long as its owning entity keeps re-applying it.
	invincible = false;
	speedMultiplier = 1;

	constructor(
		public x: number,
		public y: number
	) {
	}

	initSpawn(x: number, y: number, team: 'red' | 'blue') {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
		this.team = team;
	}

	isAlive() {
		return this.alive < 0;
	}

	/**
	 * Wipes every per-frame effect. Called once at the start of the frame,
	 * before entities run and possibly re-apply their effects.
	 */
	resetEffects() {
		this.invincible = false;
		this.speedMultiplier = 1;
	}

	private static applyMovement(
		dirX: number,
		dirY: number,
		vx: number,
		vy: number,
		dt: number,
		speedMultiplier: number
	): [number, number] {
		const dirLength2 = dirX * dirX + dirY * dirY;

		// Clamp the input direction to a maximum length of 1.
		if (dirLength2 >= 1) {
			const inv = 1 / Math.sqrt(dirLength2);
			dirX *= inv;
			dirY *= inv;
		}

		// No input: soft decelerate the velocity toward zero.
		if (dirX === 0 && dirY === 0) {
			const speed = Math.hypot(vx, vy);

			if (speed === 0) {
				return [0, 0];
			}

			const deceleration = Player.SOFT_DECELERATION * dt;

			if (speed <= deceleration) {
				return [0, 0];
			}

			const factor = (speed - deceleration) / speed;

			return [vx * factor, vy * factor];
		}

		const speed = Math.hypot(vx, vy);

		// Project the current velocity onto the desired direction.
		const forwardSpeed = vx * dirX + vy * dirY;

		if (forwardSpeed < 0) {
			// Moving in the opposite direction: decelerate quickly.
			const deceleration = Player.QUICK_DECELERATION * dt;

			if (speed <= deceleration) {
				return [0, 0];
			}

			const factor = (speed - deceleration) / speed;

			return [vx * factor, vy * factor];
		}

		const dirLength = Math.hypot(dirX, dirY);
		const targetSpeed = Player.SPEED * speedMultiplier * dirLength;

		if (forwardSpeed < targetSpeed) {
			const acceleration = Player.ACCELERATION * dt;
			const newSpeed = Math.min(
				forwardSpeed + acceleration,
				targetSpeed
			);

			return [
				dirX / dirLength * newSpeed,
				dirY / dirLength * newSpeed
			];
		}

		if (speed > targetSpeed) {
			const deceleration = Player.MIN_DECELERATION * dt;
			const newSpeed = Math.max(
				speed - deceleration,
				targetSpeed
			);

			return [
				vx / speed * newSpeed,
				vy / speed * newSpeed
			];
		}

		return [vx, vy];
	}

	move(dt: number) {
		if (this.alive >= 0) {
			this.alive -= dt;

			if (this.alive >= 0) {
				return;
			}

			// Reset at respawn
			if (this.spawnX !== null) {
				this.x = this.spawnX;
			}

			if (this.spawnY !== null) {
				this.y = this.spawnY;
			}

			this.hp = this.maxHp;
			this.attackMunitions = Player.ATTACK_FULL;
			this.attackFullyReloading = false;
			this.attackCooldown = 0;
			this.attackTimer = Player.ATTACK_DELAY;
		}

		[this.vx, this.vy] = Player.applyMovement(
			this.dirX,
			this.dirY,
			this.vx,
			this.vy,
			dt,
			this.speedMultiplier
		);

		this.x += this.vx * dt;
		this.y += this.vy * dt;

		this.avoidOOB();

		// Attack cooldown.
		if (this.attackCooldown > 0) {
			this.attackCooldown = Math.max(
				0,
				this.attackCooldown - dt
			);
		}
	}

	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.dirX = obj.dirX;
		this.dirY = obj.dirY;
		this.alive = obj.alive;
		this.score = obj.score;

		// Health state.
		this.hp = obj.hp;
		this.maxHp = obj.maxHp;

		// Attack state.
		this.attackMunitions = obj.attackMunitions;
		this.attackFullyReloading = obj.attackFullyReloading;
		this.attackCooldown = obj.attackCooldown;
		this.attackTimer = obj.attackTimer;

		this.items = obj.items && obj.items.length === ITEM_COUNT 
			? [...obj.items] 
			: Array(ITEM_COUNT).fill(-1);

		this.selectedItem = obj.selectedItem;

		this.invincible = obj.invincible;
		this.speedMultiplier = obj.speedMultiplier;
	}

	avoidOOB() {
		/// TODO: edit this.x, y if oob
	}

	die() {
		this.vx = 0;
		this.vy = 0;
		this.alive = Player.COOLDOWN;
		this.hp = 0;
	}


	attackLogic(dt: number, game: GMTurrets) {
		if (this.attackFullyReloading) {
			this.processReloading(dt);
			return;
		}

		if (this.target !== null && this.isAlive()) {
			if (this.selectedItem !== -1) {
				this.executeItemAttack(game);
			} else {
				this.executeStandardAttack(dt, game);
			}
		} else {
			this.processAttackCooldowns(dt);
		}
	}

	/**
	 * Executes the logic of a selected item instead of firing a bullet.
	 */
	private executeItemAttack(game: GMTurrets) {
		const itemId = this.items[this.selectedItem];
		
		// If slot is empty, cancel selection
		if (itemId === -1) {
			this.selectedItem = -1;
			return;
		}

		const itemDef = ITEMS[itemId];
		if (!itemDef) {
			this.selectedItem = -1;
			return;
		}

		// Get the vector for the throw/attack
		const [dx, dy] = this.resolveTargetVector(game);

		// Run item logic and apply replacement logic (consumed if null).
		// The owner (this player) is passed so the item knows where to
		// spawn its entity and which team it belongs to.
		const nextItemId = itemDef.run(game, this, dx, dy);
		this.items[this.selectedItem] = nextItemId !== null ? nextItemId : -1;
		
		this.attackCooldown = Player.ATTACK_COOLDOWN; 
	}

	/**
	 * Converts the current targeting system into a raw direction vector (dx, dy).
	 */
	private resolveTargetVector(game: GMTurrets): [number, number] {
		if (this.target?.type === 'fixed') {
			return [this.target.x - this.x, this.target.y - this.y];
		} 
		
		if (this.target?.type === 'delta') {
			return [this.target.dx, this.target.dy];
		} 
		
		if (this.target?.type === 'auto') {
			let closestDist = Infinity;
			let closestEnemy: Player | null = null;

			for (const other of game.players) {
				if (other.team !== this.team && other.isAlive()) {
					const dist = Math.hypot(other.x - this.x, other.y - this.y);
					if (dist < closestDist) {
						closestDist = dist;
						closestEnemy = other;
					}
				}
			}

			if (closestEnemy) {
				return [closestEnemy.x - this.x, closestEnemy.y - this.y];
			}
			
			// Default fallback direction
			return this.team === 'red' ? [0, 1] : [0, -1];
		}

		return [0, 1];
	}

	/**
	 * Extracts the old bullet firing logic for readability.
	 */
	private executeStandardAttack(dt: number, game: GMTurrets) {
		if (this.attackMunitions <= 0) return;

		this.attackMunitions = Math.max(0, this.attackMunitions - dt);
		this.attackCooldown = Player.ATTACK_COOLDOWN;
		this.attackTimer += dt;

		if (this.attackMunitions <= 0) {
			this.attackFullyReloading = true;
			this.attackTimer = 0;
			return;
		}

		if (this.attackTimer >= Player.ATTACK_DELAY) {
			this.attackTimer -= Player.ATTACK_DELAY;
			
			const [dx, dy] = this.resolveTargetVector(game);
			const baseAngle = Math.atan2(dy, dx);

			// Create bullets for every pattern.
			for (const pat of Bullet.PATTERNS) {
				const startAngle = baseAngle - pat.angle / 2;
				const step = pat.count > 1 ? pat.angle / (pat.count - 1) : 0;

				for (let i = 0; i < pat.count; i++) {
					const a = startAngle + i * step;
					const bdx = Math.cos(a);
					const bdy = Math.sin(a);

					game.bullets.push(
						Bullet.create(
							this.x, this.y, bdx, bdy, this.vx, this.vy,
							this.team, pat.dist, pat.initSpeed, false
						)
					);
				}
			}
		}
	}

	// Helper for attack logic extraction
	private processReloading(dt: number) {
		this.attackMunitions = Math.min(
			Player.ATTACK_FULL,
			this.attackMunitions + dt * Player.ATTACK_SLOW_RELOAD
		);

		if (this.attackMunitions >= Player.ATTACK_FULL) {
			this.attackMunitions = Player.ATTACK_FULL;
			this.attackFullyReloading = false;
			this.attackTimer = Player.ATTACK_DELAY;
		}
	}

	// Helper for attack logic extraction
	private processAttackCooldowns(dt: number) {
		this.attackTimer = Math.min(this.attackTimer + dt, Player.ATTACK_DELAY);

		if (this.attackCooldown > 0) {
			this.attackCooldown = Math.max(0, this.attackCooldown - dt);
		}

		if (this.attackCooldown <= 0) {
			this.attackMunitions = Math.min(
				Player.ATTACK_FULL,
				this.attackMunitions + dt * Player.ATTACK_RELOAD
			);
		}
	}

	hit(damages: number) {
		// EStar grants temporary invincibility - re-applied every frame by
		// its entity, so it is checked here rather than cached.
		if (this.invincible) return;

		this.hp -= damages;
		if (this.hp <= 0) {
			this.die();
		}
	}


	draw(
		ctx: CanvasRenderingContext2D,
		currentPlayer: boolean
	) {
		// Skip dead players
		if (!this.isAlive()) return;

		// Draw the player using their team color
		ctx.fillStyle = this.team;

		ctx.beginPath();
		ctx.arc(this.x, this.y, Player.RADIUS, 0, Math.PI * 2);
		ctx.fill();

		const BAR_W = 80;
		const BAR_H = 10;

		// Draw the health bar for every player
		const hpRatio = Math.max(0, this.hp / this.maxHp);

		// Draw the health bar background
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.fillRect(
			this.x - BAR_W / 2,
			this.y - Player.RADIUS - 15,
			BAR_W,
			BAR_H
		);

		// Draw the current health
		ctx.fillStyle = '#22cc22';
		ctx.fillRect(
			this.x - BAR_W / 2,
			this.y - Player.RADIUS - 15,
			BAR_W * hpRatio,
			BAR_H
		);

		// Draw the attack bar only for the local player
		if (currentPlayer) {
			const ratio = this.attackMunitions / Player.ATTACK_FULL;

			// Draw the attack bar background.
			// It is positioned 15px above the health bar to prevent overlap.
			ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
			ctx.fillRect(
				this.x - BAR_W / 2,
				this.y - Player.RADIUS - 30,
				BAR_W,
				BAR_H
			);

			if (this.attackFullyReloading) {
				// Display a gray bar while the attack is fully reloading
				ctx.fillStyle = 'gray';
				ctx.fillRect(
					this.x - BAR_W / 2,
					this.y - Player.RADIUS - 30,
					BAR_W,
					BAR_H
				);
			} else {
				// Display orange while the attack is on cooldown,
				// otherwise use white for the available ammunition
				ctx.fillStyle = this.attackCooldown > 0 ? 'orange' : 'white';
				ctx.fillRect(
					this.x - BAR_W / 2,
					this.y - Player.RADIUS - 30,
					BAR_W * ratio,
					BAR_H
				);
			}
		}
	}


	/**
	 * Handles picking up an item on the map or selecting a slot in inventory.
	 */
	interactWithSlot(slot: number, game: GMTurrets) {
		// Unselect
		if (slot === this.selectedItem) {
			this.selectedItem = -1;
			return;
		}

		// Find if the player is standing on any item
		const hoverItemIdx = game.itemsInMap.findIndex(item => {
			const dist = Math.hypot(item.x - this.x, item.y - this.y);
			return dist <= ItemInMap.RADIUS + Player.RADIUS;
		});

		if (hoverItemIdx !== -1) {
			this.swapOrPickupItem(slot, hoverItemIdx, game);
		} else {
			this.selectedItem = slot;
		}
	}

	/**
	 * Swaps the current item in the slot with the one on the ground, or picks it up.
	 */
	private swapOrPickupItem(slot: number, mapItemIdx: number, game: GMTurrets) {
		const mapItem = game.itemsInMap[mapItemIdx];
		const currentSlotItemId = this.items[slot];

		// Take the item from the map
		this.items[slot] = mapItem.id;

		if (currentSlotItemId !== -1) {
			// We already had an item, swap it (drop the old one at the exact same place)
			mapItem.id = currentSlotItemId;
		} else {
			// The slot was empty, consume the item from the map
			game.itemsInMap.splice(mapItemIdx, 1);
		}
	}

}


class Turret {
	team: 'red' | 'blue' | null = null;

	// State variables
	activation = 0;
	hp = 0;
	itemDamage = 0;
	pauseTimer = 0;
	startCooldown = 0;
	attackCooldown = 0;

	itemsToSpawn = 0;
	spawnIdx = 0;

	// --- Per-frame entity effects ---
	// Wiped every frame by resetEffects() and re-applied by EBooster while
	// it is attached to this turret.
	attackSpeedMultiplier = 1;

	static readonly SIZE = 100;

	constructor(
		public readonly x: number,
		public readonly y: number
	) {}

	/**
	 * Wipes every per-frame effect. Called once at the start of the frame,
	 * before entities run and possibly re-apply their effects.
	 */
	resetEffects() {
		this.attackSpeedMultiplier = 1;
	}

	/**
	 * Applies (or refreshes, for this frame) a fast-attack buff.
	 * Called every frame by an attached EBooster while its buff lasts.
	 */
	applyFastAttackEffect(multiplier: number) {
		this.attackSpeedMultiplier = Math.max(this.attackSpeedMultiplier, multiplier);
	}

	/**
	 * Handles damage dealt to the turret by bullets.
	 */
	hit(damage: number, attackerTeam: 'red' | 'blue') {
		// 1. Uncaptured State: Damage contributes to activation points
		if (this.team === null) {
			if (attackerTeam === 'red') {
				this.activation += damage;
			} else {
				this.activation -= damage;
			}

			// Capture threshold checks
			if (this.activation >= TURRET_ACTIVATION) {
				this.capture('red');
			} else if (this.activation <= -TURRET_ACTIVATION) {
				this.capture('blue');
			}
			return;
		}

		// 2. Captured State
		if (this.team === attackerTeam) {
			// Friendly fire heals the turret
			if (this.hp < TURRET_HP) {
				this.hp = Math.min(TURRET_HP, this.hp + damage);
			} else {
				this.itemDamage += damage;
				if (this.itemDamage >= TURRET_ITEM_DAMAGES) {
					this.pauseTimer = TURRET_PAUSE;
					this.itemDamage = 0;
					this.hp -= damage; // Apply the damage causing it to lose full HP
				}
			}
		} else {
			// Enemy fire logic
			this.hp -= damage;
			this.itemDamage = 0;

			// Change team if destroyed
			if (this.hp <= 0) {
				this.capture(attackerTeam);
			}
		}
	}

	/**
	 * Private helper to reset state upon a team capture.
	 */
	private capture(newTeam: 'red' | 'blue') {
		this.team = newTeam;
		this.hp = TURRET_HP;
		this.activation = 0;
		this.itemDamage = 0;
		this.pauseTimer = 0;
		this.startCooldown = TURRET_START_COOLDOWN;
		this.attackCooldown = 0;
		this.itemsToSpawn = 0;
		this.spawnIdx = newTeam === 'red' ? 2 : 6;
	}

	/**
	 * Runs every frame to handle cooldowns and bullet spawning.
	 */
	frame(dt: number, game: GMTurrets) {
		this.spawnPendingItems(game);

		// Do not process logic if the turret is paused
		if (this.pauseTimer > 0) {
			this.pauseTimer -= dt;
			if (this.pauseTimer <= 0) {
				// Timier is finished, let's give items
				this.itemDamage = 0;
				this.itemsToSpawn += TURRET_ITEM_COUNT;
			}

			return;
		}

		// Uncaptured turrets do nothing
		if (this.team === null) return;

		// Initial delay before a newly captured turret starts attacking
		if (this.startCooldown > 0) {
			this.startCooldown -= dt;
			return;
		}

		// EBooster speeds up the turret's fire rate for as long as it
		// keeps re-applying attackSpeedMultiplier this frame.
		this.attackCooldown -= dt * this.attackSpeedMultiplier;
		if (this.attackCooldown <= 0) {
			this.attackCooldown = TURRET_COOLDOWN;
			
			const BULLETS_COUNT = 250;
			const BULLET_SPEED = 5000; 

			// Spawn bullets in a full circle around the turret
			for (let i = 0; i < BULLETS_COUNT; i++) {
				const angle = i * (Math.PI * 2 / BULLETS_COUNT);
				const vx = Math.cos(angle) * BULLET_SPEED;
				const vy = Math.sin(angle) * BULLET_SPEED;
				
				game.bullets.push(Bullet.create(
					this.x, this.y, 
					vx, vy, 
					0, 0, 
					this.team, 
					TURRET_RADIUS,
					BULLET_SPEED,
					true
				));
			}
		}
	}

	/**
	 * Spawns items incrementally at specific angles around the turret's border.
	 */
	private spawnPendingItems(game: GMTurrets) {
		while (this.itemsToSpawn > 0) {
			const angle = this.spawnIdx * (Math.PI / 4);
			
			const itemX = this.x + Math.cos(angle) * TURRET_RADIUS;
			const itemY = this.y + Math.sin(angle) * TURRET_RADIUS;

			// Add a random item (replace Math.random logic according to your needs)
			const randomItemId = 0;
			
			game.itemsInMap.push(new ItemInMap(itemX, itemY, randomItemId));

			this.spawnIdx += 3;
			this.itemsToSpawn--;
		}
	}


	/**
	 * Draw range circle of the turret.
	 */
	drawBackground(ctx: CanvasRenderingContext2D) {
		ctx.beginPath();
		ctx.arc(this.x, this.y, TURRET_RADIUS, 0, Math.PI * 2);

		if (this.team === 'red') {
			ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
			ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
		} else if (this.team === 'blue') {
			ctx.fillStyle = 'rgba(0, 0, 255, 0.15)';
			ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)';
		} else {
			ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
		}

		ctx.fill();

		ctx.lineWidth = 8;
		ctx.stroke();
	}

	/**
	 * Draws the turret, and all related status bars.
	 */
	draw(ctx: CanvasRenderingContext2D, imageLoader: ImageLoader) {
		// Draw Base Turret
		ctx.drawImage(
			imageLoader.get(null),
			this.x - Turret.SIZE / 2,
			this.y - Turret.SIZE / 2,
			Turret.SIZE,
			Turret.SIZE
		);

		// Bar configuration
		const BAR_W = 80;
		const BAR_H = 10;
		let barY = this.y - Turret.SIZE / 2 - 20;

		if (this.team === null) {
			// Draw TURRET_ACTIVATION bar (split left/right)
			ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
			ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W, BAR_H);

			const center = this.x;
			const ratio = Math.abs(this.activation) / TURRET_ACTIVATION;
			const fillW = (BAR_W / 2) * ratio;

			if (this.activation > 0) {
				ctx.fillStyle = 'red';
				ctx.fillRect(center, barY, fillW, BAR_H);
			} else if (this.activation < 0) {
				ctx.fillStyle = 'blue';
				ctx.fillRect(center - fillW, barY, fillW, BAR_H);
			}
		} else {
			// Draw TURRET_HP bar
			ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
			ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W, BAR_H);

			ctx.fillStyle = this.team;
			const hpRatio = Math.max(0, this.hp / TURRET_HP);
			ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W * hpRatio, BAR_H);
			
			barY -= (BAR_H + 4);

			// Draw situational bars above HP
			if (this.pauseTimer > 0) {
				// TURRET_PAUSE (Gray)
				ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
				ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W, BAR_H);

				ctx.fillStyle = 'gray';
				const pauseRatio = this.pauseTimer / TURRET_PAUSE;
				ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W * pauseRatio, BAR_H);
			} else if (this.hp === TURRET_HP && this.itemDamage > 0) {
				// TURRET_ITEM_DAMAGES (Green)
				ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
				ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W, BAR_H);

				ctx.fillStyle = '#22cc22'; 
				const itemRatio = this.itemDamage / TURRET_ITEM_DAMAGES;
				ctx.fillRect(this.x - BAR_W / 2, barY, BAR_W * itemRatio, BAR_H);
			}
		}
	}

	load(obj: Fields) {
		if (!obj.taken) {
			this.team = null;
		} else {
			this.team = obj.redTeam ? 'red' : 'blue';
		}

		this.activation = obj.activation;
		this.hp = obj.hp;
		this.itemDamage = obj.itemDamage;
		this.pauseTimer = obj.pauseTimer;
		this.startCooldown = obj.startCooldown;
		this.attackCooldown = obj.attackCooldown;
		this.itemsToSpawn = obj.itemsToSpawn;
		this.spawnIdx = obj.spawnIdx;
	}
}


class Bullet {
	static readonly RADIUS = 10;

	static readonly PATTERNS = [
		{ count: 5, angle: Math.PI / 64, dist: 1600, initSpeed: 2000 },
		{ count: 5, angle: Math.PI / 8, dist: 600, initSpeed: 1000 },
		{ count: 5, angle: Math.PI / 4, dist: 200, initSpeed: 1000 }
	];

	constructor(
		public x: number,
		public y: number,
		public vx: number,
		public vy: number,
		public readonly a: number,
		public readonly team: 'red' | 'blue',
		public readonly fromTurret: boolean
	) {}

	static create(
		x: number,
		y: number,
		vx0: number,
		vy0: number,
		sx: number,
		sy: number,
		team: 'red' | 'blue',
		dist: number,
		initSpeed: number,
		fromTurret: boolean
	) {
		const length = Math.hypot(vx0, vy0);

		// Direction of the bullet.
		const dx = length > 0 ? vx0 / length : 0;
		const dy = length > 0 ? vy0 / length : 0;

		const vx = dx * initSpeed + sx;
		const vy = dy * initSpeed + sy;

		initSpeed = Math.hypot(vx, vy);

		// v^2 = v0^2 + 2ad
		const a = initSpeed * initSpeed / (2 * dist);

		return new Bullet(x, y, vx, vy, a, team, fromTurret);
	}

	move(dt: number): boolean {
		const norm = Math.hypot(this.vx, this.vy);
		const nextNorm = norm - this.a * dt;

		if (nextNorm <= 0)
			return true;

		const r = nextNorm / norm;
		this.vx = this.vx * r;
		this.vy = this.vy * r;

		this.x += this.vx * dt;
		this.y += this.vy * dt;

		// Check OOB
		return (
			Math.abs(this.x) > FULL_ROOM_SIZE * 3 ||
			Math.abs(this.y) > FULL_ROOM_SIZE * 3
		);
	}

	attack(game: GMTurrets) {
		// EWall blocks bullets outright while it stands.
		if (game.isBlockedByWall(this.x, this.y)) {
			return true;
		}

		const SR = Player.RADIUS + Bullet.RADIUS;
		const SR2 = SR * SR;

		// Check player collisions
		for (const p of game.players) {
			if (p.isAlive() && p.team !== this.team) {
				const dx = p.x - this.x;
				const dy = p.y - this.y;
				if (dx * dx + dy * dy < SR2) {
					// ELifeSlider/EShieldSlider no-damage zones stop the
					// bullet from ever reaching the player.
					if (game.isInsideNoDamageZone(p.x, p.y, p.team)) {
						return true;
					}
					p.hit(BULLET_DAMAGE);
					return true;
				}
			}
		}

		// Check turret collisions
		if (this.fromTurret)
			return false;

		const TR = Turret.SIZE / 2 + Bullet.RADIUS;
		const TR2 = TR * TR;
		for (const t of game.turrets) {
			const dx = t.x - this.x;
			const dy = t.y - this.y;
			if (dx * dx + dy * dy < TR2) {
				t.hit(BULLET_DAMAGE, this.team);
				return true;
			}
		}

		return false;
	}
}

// ============================================================================
// Entity system
//
// An "entity" is anything spawned into the world by an item (sliders, walls,
// balloons, troops, traps...) that needs to live and animate across frames -
// as opposed to an ItemInMap, which is a static pickup lying on the ground.
//
// Items create entities directly, e.g. `new ELifeSlider(...)`.
// entityConstructors is only used to build a blank instance when loading a
// snapshot from the network: the constructor's arguments are throwaway
// placeholders, immediately overwritten by load().
// ============================================================================

type EntityType =
	| 'lifeSlider'
	| 'shieldSlider'
	| 'wall'
	| 'ballon'
	| 'tank'
	| 'booster'
	| 'star'
	| 'trapI'
	| 'trapII'
	| 'trapIII'
	| 'pushEveryone'   // pre-existing entity type - implementation out of scope here
	| 'towerFreezer';  // pre-existing entity type - implementation out of scope here

abstract class AbstractEntity {
	x: number;
	y: number;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	// Serializes the entity-specific fields. x/y are handled separately by
	// the caller since every entity has them.
	abstract save(): Fields;

	// Restores entity-specific fields from a plain object produced by save().
	abstract load(data: Fields): void;

	abstract getType(): EntityType;

	// Renders the entity in world space (already translated/scaled by the
	// camera transform - see GMTurrets.draw()).
	abstract draw(ctx: CanvasRenderingContext2D, imageLoader: ImageLoader): void;

	// Advances the entity by dt seconds. Returning false removes the entity
	// from the world on this frame (expired, exploded, died, consumed...).
	abstract run(dt: number, game: GMTurrets): boolean;
}

/**
 * A circle that travels in a straight line until it leaves the map.
 * While a point sits inside it, NO player of ANY team can take damage there.
 */
class ELifeSlider extends AbstractEntity {
	static readonly SPEED = 300;
	static readonly RADIUS = 300;

	vx: number;
	vy: number;
	radius = ELifeSlider.RADIUS;

	constructor(x: number, y: number, dirX: number, dirY: number) {
		super(x, y);
		const len = Math.hypot(dirX, dirY) || 1;
		this.vx = (dirX / len) * ELifeSlider.SPEED;
		this.vy = (dirY / len) * ELifeSlider.SPEED;
	}

	getType(): EntityType { return 'lifeSlider'; }

	save(): Fields {
		return {
			vx: this.vx,
			vy: this.vy,
			radius: this.radius
		};
	}

	load(data: Fields) {
		this.vx = data.vx;
		this.vy = data.vy;
		this.radius = data.radius;
	}

	// LifeSlider protects everyone inside it, whatever their team.
	protects(px: number, py: number, _team: 'red' | 'blue'): boolean {
		return Math.hypot(px - this.x, py - this.y) <= this.radius;
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	run(dt: number, game: GMTurrets): boolean {
		console.log(JSON.stringify(this));
		this.x += this.vx * dt;
		this.y += this.vy * dt;

		// Removed once fully out of bounds.
		return !game.isOOB(this.x, this.y, this.radius);
	}
}

/**
 * Like ELifeSlider, but only protects its own team, and travels faster.
 */
class EShieldSlider extends AbstractEntity {
	static readonly SPEED = 1500; // faster than ELifeSlider
	static readonly RADIUS = 150;

	vx: number;
	vy: number;
	radius = EShieldSlider.RADIUS;
	team: 'red' | 'blue';

	constructor(x: number, y: number, dirX: number, dirY: number, team: 'red' | 'blue') {
		super(x, y);
		const len = Math.hypot(dirX, dirY) || 1;
		this.vx = (dirX / len) * EShieldSlider.SPEED;
		this.vy = (dirY / len) * EShieldSlider.SPEED;
		this.team = team;
	}

	getType(): EntityType { return 'shieldSlider'; }

	save(): Fields {
		return { x: this.x, y: this.y, vx: this.vx, vy: this.vy, radius: this.radius, redTeam: this.team === 'red' };
	}

	load(data: Fields) {
		this.x = data.x;
		this.y = data.y;
		this.vx = data.vx;
		this.vy = data.vy;
		this.radius = data.radius;
		this.team = data.redTeam ? 'red' : 'blue';
	}

	// Only protects players on the same team as the slider's owner.
	protects(px: number, py: number, team: 'red' | 'blue'): boolean {
		return team === this.team && Math.hypot(px - this.x, py - this.y) <= this.radius;
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.fillStyle = this.team === 'red' ? 'rgba(255, 0, 0, 0.15)' : 'rgba(0, 0, 255, 0.15)';
		ctx.strokeStyle = this.team === 'red' ? 'rgba(255, 80, 80, 0.8)' : 'rgba(80, 80, 255, 0.8)';
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	run(dt: number, game: GMTurrets): boolean {
		this.x += this.vx * dt;
		this.y += this.vy * dt;

		return !game.isOOB(this.x, this.y, this.radius);
	}
}

/**
 * A square that blocks bullets (but not players) for 10 * Wall.DURATION.
 */
class EWall extends AbstractEntity {
	static readonly DURATION = 3; // one "unit" of duration, shown to the player
	static readonly TOTAL_DURATION = 10 * EWall.DURATION;
	static readonly SIZE = 180;

	timer = EWall.TOTAL_DURATION;

	constructor(x: number, y: number) {
		super(x, y);
	}

	getType(): EntityType { return 'wall'; }

	save(): Fields {
		return { x: this.x, y: this.y, timer: this.timer };
	}

	load(data: Fields) {
		this.x = data.x;
		this.y = data.y;
		this.timer = data.timer;
	}

	// Used by Bullet.attack() through game.isBlockedByWall().
	blocksBullet(bx: number, by: number): boolean {
		const half = EWall.SIZE / 2;
		return Math.abs(bx - this.x) <= half && Math.abs(by - this.y) <= half;
	}

	draw(ctx: CanvasRenderingContext2D) {
		const half = EWall.SIZE / 2;

		ctx.save();
		ctx.fillStyle = 'rgba(150, 150, 150, 0.6)';
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
		ctx.lineWidth = 4;
		ctx.fillRect(this.x - half, this.y - half, EWall.SIZE, EWall.SIZE);
		ctx.strokeRect(this.x - half, this.y - half, EWall.SIZE, EWall.SIZE);

		// Remaining duration, shown as a countdown in "Wall.DURATION units".
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 32px sans-serif';
		ctx.fillText((this.timer / EWall.DURATION).toFixed(1), this.x, this.y);
		ctx.restore();
	}

	run(dt: number): boolean {
		this.timer -= dt;
		return this.timer > 0;
	}
}

/**
 * Slowly grows until it detects an enemy player/turret, then explodes,
 * damaging enemies (but sparing turrets) within radius + Ballon.PADDING.
 */
class EBallon extends AbstractEntity {
	static readonly GROWTH_SPEED = 60; // px/s
	static readonly PADDING = 120;
	static readonly DAMAGE = 150;
	static readonly DETECTION_RANGE = 400; // how close an enemy must get to be "detected"

	radius = 0;
	team: 'red' | 'blue';
	exploded = false;

	constructor(x: number, y: number, team: 'red' | 'blue') {
		super(x, y);
		this.team = team;
	}

	getType(): EntityType { return 'ballon'; }

	save(): Fields {
		return { x: this.x, y: this.y, radius: this.radius, redTeam: this.team === 'red', exploded: this.exploded };
	}

	load(data: Fields) {
		this.x = data.x;
		this.y = data.y;
		this.radius = data.radius;
		this.team = data.redTeam ? 'red' : 'blue';
		this.exploded = data.exploded;
	}

	private detectsEnemy(game: GMTurrets): boolean {
		const range = this.radius + EBallon.DETECTION_RANGE;

		for (const p of game.players) {
			if (p.isAlive() && p.team !== this.team && Math.hypot(p.x - this.x, p.y - this.y) <= range) return true;
		}
		for (const t of game.turrets) {
			if (t.team !== null && t.team !== this.team && Math.hypot(t.x - this.x, t.y - this.y) <= range) return true;
		}
		return false;
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.fillStyle = this.team === 'red' ? 'rgba(255, 60, 60, 0.5)' : 'rgba(60, 60, 255, 0.5)';
		ctx.strokeStyle = this.team === 'red' ? '#ff3333' : '#3333ff';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	run(dt: number, game: GMTurrets): boolean {
		// Removed the frame after exploding, once damage has been applied.
		if (this.exploded) return false;

		this.radius += EBallon.GROWTH_SPEED * dt;

		if (this.detectsEnemy(game)) {
			// Turrets are spared from the explosion.
			game.damageAllInRadius(this.x, this.y, this.radius + EBallon.PADDING, this.team, EBallon.DAMAGE, { spareTurrets: true });
			this.exploded = true;
		}

		return true;
	}
}

/**
 * A high-HP troop that walks toward the nearest enemy turret and dies on
 * contact, dealing damage to it.
 */
class ETank extends AbstractEntity {
	static readonly MAX_HP = 4000;
	static readonly SPEED = 250;
	static readonly TOUCH_RADIUS = Turret.SIZE / 2 + 40;
	static readonly TURRET_DAMAGE = 1000;

	hp = ETank.MAX_HP;
	team: 'red' | 'blue';

	constructor(x: number, y: number, team: 'red' | 'blue') {
		super(x, y);
		this.team = team;
	}

	getType(): EntityType { return 'tank'; }

	save(): Fields {
		return { x: this.x, y: this.y, hp: this.hp, redTeam: this.team === 'red' };
	}

	load(data: Fields) {
		this.x = data.x;
		this.y = data.y;
		this.hp = data.hp;
		this.team = data.redTeam ? 'red' : 'blue';
	}

	// Can take bullet damage - surfaced through game.damageableEntities().
	takeDamage(amount: number) {
		this.hp -= amount;
	}

	draw(ctx: CanvasRenderingContext2D) {
		const RADIUS = 50;
		const BAR_W = 80;
		const BAR_H = 10;

		ctx.save();
		ctx.fillStyle = this.team;
		ctx.beginPath();
		ctx.arc(this.x, this.y, RADIUS, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = '#000000';
		ctx.lineWidth = 3;
		ctx.stroke();

		// HP bar.
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.fillRect(this.x - BAR_W / 2, this.y - RADIUS - 15, BAR_W, BAR_H);
		ctx.fillStyle = '#22cc22';
		ctx.fillRect(this.x - BAR_W / 2, this.y - RADIUS - 15, BAR_W * (this.hp / ETank.MAX_HP), BAR_H);
		ctx.restore();
	}

	run(dt: number, game: GMTurrets): boolean {
		if (this.hp <= 0) return false;

		const target = game.nearestEnemyTurret(this.x, this.y, this.team);
		if (!target) return true; // no enemy turret standing - stay put

		const dx = target.x - this.x;
		const dy = target.y - this.y;
		const dist = Math.hypot(dx, dy) || 1;

		if (dist <= ETank.TOUCH_RADIUS) {
			target.hit(ETank.TURRET_DAMAGE, this.team);
			return false; // the tank dies on contact
		}

		this.x += (dx / dist) * ETank.SPEED * dt;
		this.y += (dy / dist) * ETank.SPEED * dt;
		return true;
	}
}

/**
 * A low-HP troop that walks toward the nearest friendly turret and, on
 * contact, grants it a fast-attack buff for a limited duration.
 */
class EBooster extends AbstractEntity {
	static readonly MAX_HP = 300;
	static readonly SPEED = 350;
	static readonly TOUCH_RADIUS = Turret.SIZE / 2 + 40;
	static readonly BUFF_DURATION = 8;
	static readonly BUFF_MULTIPLIER = 2.5;

	hp = EBooster.MAX_HP;
	team: 'red' | 'blue';
	attachedTurret: Turret | null = null;
	buffTimer = 0;

	constructor(x: number, y: number, team: 'red' | 'blue') {
		super(x, y);
		this.team = team;
	}

	getType(): EntityType { return 'booster'; }

	save(): Fields {
		return { x: this.x, y: this.y, hp: this.hp, redTeam: this.team === 'red', buffTimer: this.buffTimer };
	}

	load(data: Fields) {
		this.x = data.x;
		this.y = data.y;
		this.hp = data.hp;
		this.team = data.redTeam ? 'red' : 'blue';
		this.buffTimer = data.buffTimer;
		// The attached turret (if any) is re-resolved on the next run() from
		// this entity's position rather than serialized directly.
	}

	takeDamage(amount: number) {
		this.hp -= amount;
	}

	draw(ctx: CanvasRenderingContext2D) {
		const RADIUS = 30;
		const BAR_W = 60;
		const BAR_H = 8;

		ctx.save();
		ctx.fillStyle = this.team;
		ctx.beginPath();
		ctx.arc(this.x, this.y, RADIUS, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = '#ffcc00';
		ctx.lineWidth = 3;
		ctx.stroke();

		// While attached, show the remaining buff duration instead of an HP bar.
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.fillRect(this.x - BAR_W / 2, this.y - RADIUS - 13, BAR_W, BAR_H);
		ctx.fillStyle = '#ffcc00';
		const ratio = this.attachedTurret
			? this.buffTimer / EBooster.BUFF_DURATION
			: this.hp / EBooster.MAX_HP;
		ctx.fillRect(this.x - BAR_W / 2, this.y - RADIUS - 13, BAR_W * ratio, BAR_H);
		ctx.restore();
	}

	private nearestFriendlyTurret(game: GMTurrets): Turret | null {
		let best: Turret | null = null;
		let bestDist = Infinity;

		for (const t of game.turrets) {
			if (t.team !== this.team) continue;
			const d = Math.hypot(t.x - this.x, t.y - this.y);
			if (d < bestDist) {
				bestDist = d;
				best = t;
			}
		}

		return best;
	}

	run(dt: number, game: GMTurrets): boolean {
		if (this.hp <= 0) return false;

		if (this.attachedTurret) {
			// Already attached: keep re-applying the buff every frame,
			// since turret.resetEffects() wipes it at the start of each one.
			if (this.attachedTurret.team === null || this.buffTimer <= 0) return false;
			this.attachedTurret.applyFastAttackEffect(EBooster.BUFF_MULTIPLIER);
			this.buffTimer -= dt;
			return this.buffTimer > 0;
		}

		const target = this.nearestFriendlyTurret(game);
		if (!target) return true;

		const dx = target.x - this.x;
		const dy = target.y - this.y;
		const dist = Math.hypot(dx, dy) || 1;

		if (dist <= EBooster.TOUCH_RADIUS) {
			this.attachedTurret = target;
			this.buffTimer = EBooster.BUFF_DURATION;
			return true;
		}

		this.x += (dx / dist) * EBooster.SPEED * dt;
		this.y += (dy / dist) * EBooster.SPEED * dt;
		return true;
	}
}

/**
 * Attached to the player who threw it. Grants invincibility and a speed
 * boost for Star.DURATION, re-applied every frame like a Booster buff.
 */
class EStar extends AbstractEntity {
	static readonly DURATION = 6;
	static readonly SPEED_MULTIPLIER = 1.6;

	playerIdx: number;
	timer = EStar.DURATION;

	constructor(x: number, y: number, playerIdx: number) {
		super(x, y);
		this.playerIdx = playerIdx;
	}

	getType(): EntityType { return 'star'; }

	draw(ctx: CanvasRenderingContext2D) {
		const POINTS = 5;
		const OUTER = 30;
		const INNER = 13;

		ctx.save();
		ctx.translate(this.x, this.y - Player.RADIUS - 45);
		ctx.fillStyle = '#ffdd00';
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.beginPath();

		for (let i = 0; i < POINTS * 2; i++) {
			const r = i % 2 === 0 ? OUTER : INNER;
			const a = (Math.PI / POINTS) * i - Math.PI / 2;
			const px = Math.cos(a) * r;
			const py = Math.sin(a) * r;
			if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
		}

		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	save(): Fields {
		return { x: this.x, y: this.y, playerIdx: this.playerIdx, timer: this.timer };
	}

	load(data: Fields) {
		this.x = data.x;
		this.y = data.y;
		this.playerIdx = data.playerIdx;
		this.timer = data.timer;
	}

	run(dt: number, game: GMTurrets): boolean {
		const player = game.players[this.playerIdx];
		if (!player || !player.isAlive() || this.timer <= 0) return false;

		// Wiped by player.resetEffects() at the top of the frame, then
		// re-applied here every frame while the star is still active.
		player.invincible = true;
		player.speedMultiplier = Math.max(player.speedMultiplier, EStar.SPEED_MULTIPLIER);

		this.x = player.x;
		this.y = player.y;
		this.timer -= dt;
		return this.timer > 0;
	}
}

/**
 * A visible trap zone. If touched by an enemy it explodes, damaging enemies
 * in a wider radius. Shared implementation for TrapI/TrapII/TrapIII, which
 * only differ by their `level` (used by the matching item to know which
 * item to hand back once used - see ItemTrapIII/II/I).
 */
class ETrap extends AbstractEntity {
	static readonly TRIGGER_RADIUS = 70;   // zone that must be touched to trigger
	static readonly EXPLOSION_RADIUS = 260; // wider damage radius once triggered
	static readonly DAMAGE = 250;

	team: 'red' | 'blue';
	level: 1 | 2 | 3;
	triggered = false;

	constructor(x: number, y: number, team: 'red' | 'blue', level: 1 | 2 | 3) {
		super(x, y);
		this.team = team;
		this.level = level;
	}

	getType(): EntityType {
		return this.level === 3 ? 'trapIII' : this.level === 2 ? 'trapII' : 'trapI';
	}

	save(): Fields {
		return { x: this.x, y: this.y, redTeam: this.team === 'red', level: this.level, triggered: this.triggered };
	}

	load(data: Fields) {
		this.x = data.x;
		this.y = data.y;
		this.team = data.redTeam ? 'red' : 'blue';
		this.level = data.level;
		this.triggered = data.triggered;
	}

	private touchedByEnemy(game: GMTurrets): boolean {
		for (const p of game.players) {
			if (p.isAlive() && p.team !== this.team && Math.hypot(p.x - this.x, p.y - this.y) <= ETrap.TRIGGER_RADIUS) {
				return true;
			}
		}
		return false;
	}

	draw(ctx: CanvasRenderingContext2D) {
		const color = this.team === 'red' ? '#ff5555' : '#5555ff';

		ctx.save();

		// Wider explosion radius, shown as a faint dashed guide.
		ctx.strokeStyle = color;
		ctx.globalAlpha = 0.35;
		ctx.setLineDash([10, 10]);
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(this.x, this.y, ETrap.EXPLOSION_RADIUS, 0, Math.PI * 2);
		ctx.stroke();

		// Visible trigger zone.
		ctx.setLineDash([]);
		ctx.globalAlpha = 0.6;
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(this.x, this.y, ETrap.TRIGGER_RADIUS, 0, Math.PI * 2);
		ctx.fill();

		ctx.globalAlpha = 1;
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 22px sans-serif';
		ctx.fillText(`${this.level}`, this.x, this.y);

		ctx.restore();
	}

	run(dt: number, game: GMTurrets): boolean {
		// Removed the frame after exploding, once damage has been applied.
		if (this.triggered) return false;

		if (this.touchedByEnemy(game)) {
			// Unlike Ballon, the trap does NOT spare turrets.
			game.damageAllInRadius(this.x, this.y, ETrap.EXPLOSION_RADIUS, this.team, ETrap.DAMAGE, { spareTurrets: false });
			this.triggered = true;
		}

		return true;
	}
}

/**
 * Maps every EntityType to a factory producing a blank instance, used only
 * when loading a snapshot from the network (see GMTurrets.load()). The
 * constructor arguments are throwaway placeholders, immediately overwritten
 * by the instance's load().
 */
const entityConstructors: Record<EntityType, (x: number, y: number) => AbstractEntity> = {
	lifeSlider: (x, y) => new ELifeSlider(x, y, 1, 0),
	shieldSlider: (x, y) => new EShieldSlider(x, y, 1, 0, 'red'),
	wall: (x, y) => new EWall(x, y),
	ballon: (x, y) => new EBallon(x, y, 'red'),
	tank: (x, y) => new ETank(x, y, 'red'),
	booster: (x, y) => new EBooster(x, y, 'red'),
	star: (x, y) => new EStar(x, y, 0),
	trapI: (x, y) => new ETrap(x, y, 'red', 1),
	trapII: (x, y) => new ETrap(x, y, 'red', 2),
	trapIII: (x, y) => new ETrap(x, y, 'red', 3),

	// Pre-existing entity types - factories intentionally left unimplemented,
	// out of scope for this change set.
	pushEveryone: () => { throw new Error('pushEveryone entity constructor not implemented'); },
	towerFreezer: () => { throw new Error('towerFreezer entity constructor not implemented'); },
};

/**
 * Converts a runtime entity into the wire shape described by the `Entity`
 * message (x/y plus a oneof `etype` holding the type-specific payload).
 */
function serializeEntity(e: AbstractEntity): Fields {
	const base = { x: e.x, y: e.y };
	const type = e.getType();

	switch (type) {
		case 'lifeSlider': return { ...base, lifeSlider: e.save() };
		case 'shieldSlider': return { ...base, shieldSlider: e.save() };
		case 'wall': return { ...base, wall: e.save() };
		case 'ballon': return { ...base, ballon: e.save() };
		case 'tank': return { ...base, tank: e.save() };
		case 'booster': return { ...base, booster: e.save() };
		case 'star': return { ...base, star: e.save() };
		case 'trapI': case 'trapII': case 'trapIII':
			return { ...base, trap: e.save() };
		default:
			throw new Error(`serializeEntity: unhandled entity type "${type}"`);
	}
}

/**
 * Rebuilds a runtime entity from a decoded `Entity` protobuf message. Which
 * `etype` field is set determines the concrete class to instantiate.
 */
function deserializeEntity(msg: Fields): AbstractEntity {
	if (msg.lifeSlider) {
		const e = entityConstructors.lifeSlider(msg.x, msg.y);
		e.load(msg.lifeSlider);
		return e;
	}
	if (msg.shieldSlider) {
		const e = entityConstructors.shieldSlider(msg.x, msg.y);
		e.load(msg.shieldSlider);
		return e;
	}
	if (msg.wall) {
		const e = entityConstructors.wall(msg.x, msg.y);
		e.load(msg.wall);
		return e;
	}
	if (msg.ballon) {
		const e = entityConstructors.ballon(msg.x, msg.y);
		e.load(msg.ballon);
		return e;
	}
	if (msg.tank) {
		const e = entityConstructors.tank(msg.x, msg.y);
		e.load(msg.tank);
		return e;
	}
	if (msg.booster) {
		const e = entityConstructors.booster(msg.x, msg.y);
		e.load(msg.booster);
		return e;
	}
	if (msg.star) {
		const e = entityConstructors.star(msg.x, msg.y);
		e.load(msg.star);
		return e;
	}
	if (msg.trap) {
		// `level` picks the concrete entity type on the way in, so any of
		// the three trap constructors works as the starting blank instance.
		const e = entityConstructors.trapI(msg.x, msg.y);
		e.load(msg.trap);
		return e;
	}

	throw new Error('deserializeEntity: message has no recognized etype set');
}

class ItemInMap {
	static readonly RADIUS = 40;

	constructor(
		public x: number,
		public y: number,
		public id: number
	) {}

	/**
	 * Draws the item on the map using its icon or a fallback shape.
	 */
	draw(ctx: CanvasRenderingContext2D, imageLoader: ImageLoader) {
		const itemDef = ITEMS[this.id];
		if (!itemDef) return;

		const img = imageLoader.get(itemDef.iconMap);

		ctx.save();
		ctx.translate(this.x, this.y);

		if (img) {
			ctx.drawImage(
				img,
				-ItemInMap.RADIUS,
				-ItemInMap.RADIUS,
				ItemInMap.RADIUS * 2,
				ItemInMap.RADIUS * 2
			);
		} else {
			// Fallback placeholder if texture is not yet loaded
			ctx.fillStyle = '#ffaa00';
			ctx.beginPath();
			ctx.arc(0, 0, ItemInMap.RADIUS, 0, Math.PI * 2);
			ctx.fill();

			ctx.fillStyle = '#ffffff';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = 'bold 20px sans-serif';
			ctx.fillText(`${this.id}`, 0, 0);
		}

		ctx.restore();
	}
}



// Stable indices into ITEMS, used by the Trap chain to hand back the next
// item in the sequence (TrapIII -> TrapII -> TrapI -> nothing).
const ITEM_IDS = {
	LifeSlider: 0,
	ShieldSlider: 1,
	Wall: 2,
	Ballon: 3,
	Tank: 4,
	Booster: 5,
	Star: 6,
	TrapIII: 7,
	TrapII: 8,
	TrapI: 9,
} as const;

const ITEMS = [
	// 0 - LifeSlider: sends off a no-damage-for-everyone slider in the aimed direction.
	{
		iconMap: "none",
		iconHand: "none",
		name: "LifeSlider",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			game.entities.push(new ELifeSlider(owner.x, owner.y, dx, dy));
			return null;
		}
	},

	// 1 - ShieldSlider: like LifeSlider, faster, only protects the owner's team.
	{
		iconMap: "none",
		iconHand: "none",
		name: "ShieldSlider",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			game.entities.push(new EShieldSlider(owner.x, owner.y, dx, dy, owner.team));
			return null;
		}
	},

	// 2 - Wall: drops a bullet-blocking square at the owner's feet.
	{
		iconMap: "none",
		iconHand: "none",
		name: "Wall",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			game.entities.push(new EWall(owner.x, owner.y));
			return null;
		}
	},

	// 3 - Ballon: drops a growing balloon that explodes on detecting an enemy.
	{
		iconMap: "none",
		iconHand: "none",
		name: "Ballon",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			game.entities.push(new EBallon(owner.x, owner.y, owner.team));
			return null;
		}
	},

	// 4 - Tank: spawns a high-HP troop that charges the nearest enemy turret.
	{
		iconMap: "none",
		iconHand: "none",
		name: "Tank",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			game.entities.push(new ETank(owner.x, owner.y, owner.team));
			return null;
		}
	},

	// 5 - Booster: spawns a troop that buffs the nearest friendly turret on contact.
	{
		iconMap: "none",
		iconHand: "none",
		name: "Booster",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			game.entities.push(new EBooster(owner.x, owner.y, owner.team));
			return null;
		}
	},

	// 6 - Star: grants the owner invincibility + speed for a limited time.
	{
		iconMap: "none",
		iconHand: "none",
		name: "Star",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			const ownerIdx = game.players.indexOf(owner);
			game.entities.push(new EStar(owner.x, owner.y, ownerIdx));
			return null;
		}
	},

	// 7 - TrapIII: strongest trap, downgrades to TrapII once used.
	{
		iconMap: "none",
		iconHand: "none",
		name: "TrapIII",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			game.entities.push(new ETrap(owner.x, owner.y, owner.team, 3));
			return ITEM_IDS.TrapII;
		}
	},

	// 8 - TrapII: downgrades to TrapI once used.
	{
		iconMap: "none",
		iconHand: "none",
		name: "TrapII",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			game.entities.push(new ETrap(owner.x, owner.y, owner.team, 2));
			return ITEM_IDS.TrapI;
		}
	},

	// 9 - TrapI: weakest trap, last of the chain - nothing given back once used.
	{
		iconMap: "none",
		iconHand: "none",
		name: "TrapI",

		run: (game: GMTurrets, owner: Player, dx: number, dy: number): number | null => {
			game.entities.push(new ETrap(owner.x, owner.y, owner.team, 1));
			return null;
		}
	},
];



class Camera {
	x = 0;
	y = 0;

	static readonly SCALE = 0.8;
	static readonly DURATION = 0.3;

	// Transition state variables
	private startX = 0;
	private startY = 0;

	// The target position represents the center of the current chunk
	private targetX = 0;
	private targetY = 0;

	private isTransitioning = false;
	private t = 0;

	/**
	 * Smooth easing function mapping [0, 1] to [0, 1].
	 */
	private easing(t: number): number {
		const clampedT = Math.max(0, Math.min(1, t));
		return clampedT * clampedT * (3 - 2 * clampedT);
	}

	/**
	 * Returns the center coordinates of the zone containing the given position.
	 */
	private getZoneCenter(px: number, py: number) {
		let zx = Math.round(px / FULL_ROOM_SIZE);
		let zy = Math.round(py / FULL_ROOM_SIZE);

		// Clamp the zone coordinates to the valid map range
		zx = Math.max(-2, Math.min(2, zx));
		zy = Math.max(-2, Math.min(2, zy));

		return {
			cx: zx * FULL_ROOM_SIZE,
			cy: zy * FULL_ROOM_SIZE
		};
	}

	/**
	 * Clamps a value between a minimum and maximum value.
	 */
	private clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	update(px: number, py: number, dt: number) {
		const { cx, cy } = this.getZoneCenter(px, py);

		// Detect a change of chunk
		if (cx !== this.targetX || cy !== this.targetY) {
			this.startX = this.x;
			this.startY = this.y;

			// Update the target chunk
			this.targetX = cx;
			this.targetY = cy;

			this.t = 0;
			this.isTransitioning = true;
		}

		// Calculate the camera bounds for the current target chunk.
		// SCALE affects the size of the visible area in world coordinates.
		const viewHalfW = WIDTH / (2 * Camera.SCALE);
		const viewHalfH = HEIGHT / (2 * Camera.SCALE);

		// The camera cannot move beyond the chunk boundaries.
		// The screen half-size is taken into account so that the camera
		// stops when reaching the edge of the chunk.
		const minX = this.targetX - (FULL_ROOM_SIZE / 2) + viewHalfW;
		const maxX = this.targetX + (FULL_ROOM_SIZE / 2) - viewHalfW;

		// If rooms have a different height, replace FULL_ROOM_SIZE
		// with the appropriate room height here.
		const minY = this.targetY - (FULL_ROOM_SIZE / 2) + viewHalfH;
		const maxY = this.targetY + (FULL_ROOM_SIZE / 2) - viewHalfH;

		// The dynamic camera target is the player position,
		// clamped to the current chunk boundaries.
		const desiredX = this.clamp(px, minX, maxX);
		const desiredY = this.clamp(py, minY, maxY);

		// Apply camera movement
		if (this.isTransitioning) {
			this.t += dt;

			if (this.t >= Camera.DURATION) {
				this.isTransitioning = false;
				this.x = desiredX;
				this.y = desiredY;
			} else {
				const progress = this.easing(this.t / Camera.DURATION);

				// Interpolate towards the player's clamped position.
				// Since desiredX/Y can change while the player moves,
				// the camera will smoothly catch up to the player.
				this.x = this.startX + (desiredX - this.startX) * progress;
				this.y = this.startY + (desiredY - this.startY) * progress;
			}
		} else {
			// Outside of a transition, directly follow the clamped player position.
			this.x = desiredX;
			this.y = desiredY;
		}
	}

	teleport(px: number, py: number) {
		const { cx, cy } = this.getZoneCenter(px, py);

		this.targetX = cx;
		this.targetY = cy;

		// Recalculate the camera bounds for the instant teleport.
		const viewHalfW = WIDTH / (2 * Camera.SCALE);
		const viewHalfH = HEIGHT / (2 * Camera.SCALE);

		const minX = cx - (FULL_ROOM_SIZE / 2) + viewHalfW;
		const maxX = cx + (FULL_ROOM_SIZE / 2) - viewHalfW;
		const minY = cy - (FULL_ROOM_SIZE / 2) + viewHalfH;
		const maxY = cy + (FULL_ROOM_SIZE / 2) - viewHalfH;

		// Place the camera directly at the player's clamped position.
		this.x = this.clamp(px, minX, maxX);
		this.y = this.clamp(py, minY, maxY);

		// Cancel any ongoing transition.
		this.isTransitioning = false;
		this.t = 0;
	}

	getCoords() {
		return { x: this.x, y: this.y };
	}
}

class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;

	readonly html: HTMLDivElement;
	readonly time: HTMLDivElement;
	readonly camera = new Camera();

	private clientWasDead = true;

	// Last direction sent to the server for each axis, used to avoid re-sending
	// the same movement action every single frame when using an analog joystick
	// (keyboard already handles this naturally via first()/killed()).
	lastDirX = 0;
	lastDirY = 0;

	// Attack joystick state, used to distinguish a quick tap (-> auto throw)
	// from holding + aiming (-> throwDir).
	attackPressStart: number | null = null;
	attackHasAimed = false;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-turrets-client-data");

		this.time = document.createElement("div");
		this.time.classList.add("game-turrets-time");

		this.html.appendChild(this.time);
	}

	static showTime(time: number) {
		const minutes = Math.floor(time / 60);
		const seconds = (time % 60).toFixed(1);

		return `${minutes}:${seconds.padStart(4, "0")}`;
	}

	update(game: GMTurrets, playerIdx: number) {
		this.time.innerText =
			ClientData.showTime(game.time);

		const player = game.players[playerIdx];
		if (this.clientWasDead && player.alive < 0) {
			this.camera.teleport(player.x, player.y)
		}
		this.clientWasDead = (player.alive >= 0);

		this.camera.update(player.x, player.y, 1 / 60);
	}
}


class TutorialData {
	private step = 0;
	private wakeUp = 0;

	constructor(private readonly game: GMTurrets) {}

	frame(dt: number, clock: number) {
		const player = this.game.players[0];
		const bot = this.game.players[1];

		return "Placeholder";
	}
}



function generateClientDom() {
	return {
		skin: 0,
		preferTeam: 0,

		produce() {
			const {StartData} = protocols.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		}
	};
}

/**
 * Renders a single inventory slot card in the HUD.
 *
 * @param ctx - The 2D rendering context.
 * @param x - Top-left X coordinate of the slot card.
 * @param y - Top-left Y coordinate of the slot card.
 * @param size - Size (width and height) of the slot card.
 * @param itemId - The ID of the item inside this slot (-1 if empty).
 * @param slotIndex - Display number for keybinding (1, 2, 3).
 * @param isSelected - True if the player currently selected this slot.
 * @param imageLoader - Image assets container.
 */
function drawItemHand(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	itemId: number,
	slotIndex: number,
	isSelected: boolean,
	imageLoader: ImageLoader
) {
	ctx.save();

	// 1. Slot Background
	ctx.fillStyle = isSelected ? '#ffcc00' : 'rgba(30, 30, 30, 0.75)';
	ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
	ctx.lineWidth = isSelected ? 4 : 2;

	ctx.fillRect(x, y, size, size);
	ctx.strokeRect(x, y, size, size);

	// 2. Draw Item Icon (if slot is occupied)
	if (itemId !== -1 && ITEMS[itemId]) {
		const itemDef = ITEMS[itemId];
		const img = imageLoader.get(itemDef.iconHand);

		const padding = size * 0.15;
		const imgSize = size - padding * 2;

		if (img) {
			ctx.drawImage(img, x + padding, y + padding, imgSize, imgSize);
		} else {
			// Fallback text icon
			ctx.fillStyle = isSelected ? '#000000' : '#ffffff';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = 'bold 18px sans-serif';
			ctx.fillText(itemDef.name.charAt(0), x + size / 2, y + size / 2);
		}
	}

	// 3. Slot Key Binding Label (top-left inside box)
	ctx.fillStyle = isSelected ? '#000000' : '#ffffff';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.font = 'bold 16px sans-serif';
	ctx.fillText(`${slotIndex}`, x + 6, y + 4);

	ctx.restore();
}


interface Floor {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

export class GMTurrets extends GameMode {
	static readonly types = {Player, Turret};

	static readonly DATA = {
		GRAVITY,
		WIDTH,
		HEIGHT,
	};

	readonly players: Player[];
	readonly turrets: Turret[] = [];
	readonly floors: Floor[] = [];
	readonly bullets: Bullet[] = [];
	readonly itemsInMap: ItemInMap[] = [];
	readonly entities: AbstractEntity[] = [];


	time = 600;

	finished = false;
	internalFrameTick = 0;



	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0)
		);

		// for (let x = -2; x <= 2; x++) {
			// for (let y = -2; y <= 2; y++) {
		for (let x = 0; x <= 0; x++) {
			for (let y = 0; y <= 0; y++) {
				this.turrets.push(new Turret(
					x * FULL_ROOM_SIZE,
					y * FULL_ROOM_SIZE
				));

				const floorX = x * FULL_ROOM_SIZE;
				const floorY = y * FULL_ROOM_SIZE;

				// Create the main floor of the room
				this.floors.push(
					{
						x0: floorX - ROOM_SIZE/2,
						y0: floorY - ROOM_SIZE/2,
						x1: floorX + ROOM_SIZE/2,
						y1: floorY + ROOM_SIZE/2
					}
				);

				// Create a horizontal bridge to the room on the right
				if (x < 2) {
					this.floors.push(
						{
							x0: floorX + ROOM_SIZE / 2,
							y0: floorY - BRIDGE_SIZE / 2,
							x1: floorX + FULL_ROOM_SIZE - ROOM_SIZE / 2,
							y1: floorY + BRIDGE_SIZE / 2
						}
					);
				}


				// Create a vertical bridge to the room above
				if (y < 2) {
					this.floors.push(
						{
							x0: floorX - BRIDGE_SIZE / 2,
							y0: floorY + ROOM_SIZE / 2,
							x1: floorX + BRIDGE_SIZE / 2,
							y1: floorY + FULL_ROOM_SIZE - ROOM_SIZE / 2
						}
					);
				}
			}
		}
	}

	static createServ(players: PlayerInput[], total: number) {
		const {StartData, StartDataClient} = protocols.get();

		const game = new GMTurrets(total);


		function decode(i: number) {
			if (i < players.length)
				return decodeFullMessage(StartData.decode(players[i].data));

			return generateClientDom();
		}

		// Pre-decode all player messages once for performance
		const playerInfos = game.players.map((p, i) => ({
			player: p,
			index: i,
			pref: decode(i).preferTeam ?? 0
		}));

		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);

		const assigned = new Array(totalPlayers);
		let redCount = 0;
		let blueCount = 0;

		// Phase 1: Assign players with explicit valid preferences if team capacity allows
		for (let i = 0; i < totalPlayers; i++) {
			const info = playerInfos[i];
			if (info.pref === 1 && redCount < maxPerTeam) {
				assigned[info.index] = true; // Red
				redCount++;
			} else if (info.pref === -1 && blueCount < maxPerTeam) {
				assigned[info.index] = false; // Blue
				blueCount++;
			}
		}

		// Phase 2: Fill remaining slots by alternating to maintain balanced team sizes
		for (let i = 0; i < totalPlayers; i++) {
			if (assigned[i] !== undefined) continue;

			// Assign to the team that currently has fewer players
			const isRed = redCount < blueCount || (redCount === blueCount && i % 2 === 0);
			if (isRed && redCount < maxPerTeam) {
				assigned[i] = true;
				redCount++;
			} else {
				assigned[i] = false;
				blueCount++;
			}
		}

		// Phase 3: Initialize spawn points based on final team assignments
		for (const [i, p] of game.players.entries()) {
			const redTeam = assigned[i];
			p.initSpawn(
				0,
				redTeam ? -FULL_ROOM_SIZE * 2 : FULL_ROOM_SIZE * 2,
				redTeam ? 'red' : 'blue'
			);
		}



		const data = StartDataClient.encode({
			players: game.players.map(p => ({
				x: p.spawnX,
				y: p.spawnY,
				isRed: p.team === 'red'
			}))
		}).finish();

		return {
			game,
			data
		}
	}

	static createClient(data: Uint8Array | null, total: number) {
		const game = new GMTurrets(total);
		const {StartDataClient} = protocols.get();

		if (data) {
			const {players} = decodeFullMessage(StartDataClient.decode(data));
	
			for (const [idx, p] of players.entries()) {
				game.players[idx].initSpawn(p.x, p.y, p.isRed ? 'red' : 'blue');
			}
		} else {
			game.players[0].initSpawn(
				0,
				-100 * 2,
				'red'
			);

			game.players[1].initSpawn(
				0,
				100 * 2,
				'blue'
			);
		}


		const clientData = new ClientData();
		return {game, data: clientData, html: clientData.html};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly TEXTURES = {};


	override init(): void {
		
	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
	}

	override run(
		dt: number,
		produceFinish: boolean
	): FinishGame | null {
		this.time -= dt;

		if (this.time <= 0) {
			this.finished = true;
		}


		// 1. Wipe every per-frame effect (invincibility, speed, fast-attack...).
		this.resetEffects();

		// 2. Advance entities. Any effect an entity grants (EStar, EBooster)
		//    is re-applied here, right after being wiped above.
		this.runEntities(dt);

		// 3. Turret cooldowns / bullet & item spawning.
		for (const turret of this.turrets) {
			turret.frame(dt, this);
		}

		// 4. Player movement and attack logic.
		for (const p of this.players) {
			p.move(dt);
			p.attackLogic(dt, this);
		}

		for (let i = this.bullets.length - 1; i >= 0; i--) {
			const b = this.bullets[i];
			if (b.move(dt) || b.attack(this)) {
				this.bullets.splice(i, 1);
			}
		}

		if (produceFinish && this.finished) {
			return this.produceFinish();
		}

		return null;
	}

	/**
	 * Wipes the per-frame effects of every player and turret. Must run
	 * before runEntities(), so that active entities can re-apply theirs.
	 */
	private resetEffects() {
		for (const p of this.players) p.resetEffects();
		for (const t of this.turrets) t.resetEffects();
	}

	/**
	 * Advances every entity by dt, dropping the ones whose run() returns
	 * false (expired, exploded, consumed, died...).
	 */
	private runEntities(dt: number) {
		for (let i = this.entities.length - 1; i >= 0; i--) {
			if (!this.entities[i].run(dt, this)) {
				this.entities.splice(i, 1);
			}
		}
	}

	/**
	 * True once (x, y) - inflated by `margin` - has fully left the map.
	 * Used by the sliders to know when to disappear.
	 */
	isOOB(x: number, y: number, margin = 0): boolean {
		const limit = FULL_ROOM_SIZE * 3;
		return (
			x < -limit - margin || x > limit + margin ||
			y < -limit - margin || y > limit + margin
		);
	}

	/**
	 * True if (x, y) currently sits inside an ELifeSlider (protects
	 * everyone) or an EShieldSlider of the given team (protects only its
	 * own team). Checked by Bullet.attack() before applying player damage.
	 */
	isInsideNoDamageZone(x: number, y: number, team: 'red' | 'blue'): boolean {
		for (const e of this.entities) {
			if (e instanceof ELifeSlider && e.protects(x, y, team)) return true;
			if (e instanceof EShieldSlider && e.protects(x, y, team)) return true;
		}
		return false;
	}

	/**
	 * True if (x, y) sits inside an EWall's square. Checked by
	 * Bullet.attack() to stop bullets outright.
	 */
	isBlockedByWall(x: number, y: number): boolean {
		for (const e of this.entities) {
			if (e instanceof EWall && e.blocksBullet(x, y)) return true;
		}
		return false;
	}

	/**
	 * Closest captured turret NOT belonging to `team`, or null if none.
	 * Used by ETank to find where to charge.
	 */
	nearestEnemyTurret(x: number, y: number, team: 'red' | 'blue'): Turret | null {
		let best: Turret | null = null;
		let bestDist = Infinity;

		for (const t of this.turrets) {
			if (t.team === null || t.team === team) continue;
			const d = Math.hypot(t.x - x, t.y - y);
			if (d < bestDist) {
				bestDist = d;
				best = t;
			}
		}

		return best;
	}

	/**
	 * Iterator over every player / turret / entity that can currently take
	 * damage - used by damageAllInRadius() for area-effect entities
	 * (EBallon, ETrap).
	 */
	*damageableEntities(): IterableIterator<{ x: number; y: number; team: 'red' | 'blue'; isTurret: boolean; hit(damage: number, attackerTeam?: 'red' | 'blue'): void }> {
		for (const p of this.players) {
			if (!p.isAlive()) continue;
			yield { x: p.x, y: p.y, team: p.team, isTurret: false, hit: (d) => p.hit(d) };
		}

		for (const t of this.turrets) {
			if (t.team === null) continue;
			yield { x: t.x, y: t.y, team: t.team, isTurret: true, hit: (d, attacker) => t.hit(d, attacker ?? t.team!) };
		}

		for (const e of this.entities) {
			if (e instanceof ETank || e instanceof EBooster) {
				yield { x: e.x, y: e.y, team: e.team, isTurret: false, hit: (d) => e.takeDamage(d) };
			}
		}
	}

	/**
	 * Applies `damage` to every damageable thing of the opposite team to
	 * `sourceTeam` within `radius` of (x, y). Respects no-damage zones.
	 * Used by EBallon (spareTurrets: true) and ETrap (spareTurrets: false).
	 */
	damageAllInRadius(
		x: number,
		y: number,
		radius: number,
		sourceTeam: 'red' | 'blue',
		damage: number,
		options: { spareTurrets: boolean }
	) {
		for (const target of this.damageableEntities()) {
			if (target.team === sourceTeam) continue; // enemies only
			if (options.spareTurrets && target.isTurret) continue;
			if (Math.hypot(target.x - x, target.y - y) > radius) continue;
			if (this.isInsideNoDamageZone(target.x, target.y, target.team)) continue;

			target.hit(damage, sourceTeam);
		}
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];

		switch (input.action) {
			case 'dirX':
				player.dirX = input.dirX;
				break;

			case 'dirY':
				player.dirY = input.dirY;
				break;

			case 'throwTarget':
				player.target = {
					type: 'fixed',
					x: input.throwTarget.x,
					y: input.throwTarget.y,
				};
				break;

			case 'throwDir':
				player.target = {
					type: 'delta',
					dx: input.throwDir.x,
					dy: input.throwDir.y,
				};
				break;

			case 'throwAuto':
				player.target = { type: 'auto' };
				break;

			case 'throwOff':
				player.target = null;
				break;

			case 'useItem':
				if (input.useItem && input.useItem.slot !== undefined) {
					player.interactWithSlot(input.useItem.slot, this);
				}
				break;

		}
	}

	override collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		const throwTarget = mouse.getCoords();
		data.mouseX = throwTarget.x;
		data.mouseY = throwTarget.y;

		const inputs: Fields[] = [];

		

		// --- Movement: ZQSD/arrows on desktop, joystick on mobile ---
		if (mobile) {
			const move = mobile.getJoystick('move');

			// Only send an action when the discretized direction actually changes,
			// to avoid flooding the server every frame.
			if (move.x !== data.lastDirX) {
				inputs.push({
					action: 'dirX',
					dirX: move.x
				});
				data.lastDirX = move.x;
			}
			
			if (move.y !== data.lastDirY) {
				inputs.push({
					action: 'dirY',
					dirY: move.y
				});
				data.lastDirY = move.y;
			}

			// --- Aiming: mobile joystick (tap = auto, hold+aim = throwDir) ---
			const attack = mobile.getJoystick('attack');
			const AIM_DEADZONE = 0.15;
			const QUICK_TAP_MS = 180;

			if (mobile.first('attack')) {
				if (data.attackPressStart === null) {
					data.attackPressStart = performance.now();
					data.attackHasAimed = false;
				}

				const magnitude = Math.hypot(attack.x, attack.y);
				if (magnitude > AIM_DEADZONE) {
					data.attackHasAimed = true;
					inputs.push({
						throwTarget: { x: attack.x, y: attack.y },
						action: 'throwDir'
					});
				}
			} else if (data.attackPressStart !== null) {
				const heldFor = performance.now() - data.attackPressStart;

				if (!data.attackHasAimed && heldFor < QUICK_TAP_MS) {
					inputs.push({ throwAuto: {}, action: 'throwAuto' });
				} else {
					inputs.push({ throwOff: {}, action: 'throwOff' });
				}

				data.attackPressStart = null;
				data.attackHasAimed = false;
			}


			for (let slot = 0; slot < ITEM_COUNT; slot++) {
				if (mobile.first(String(slot+1))) {
					inputs.push({ useItem: { slot }, action: 'useItem' });
				}
			}




		} else {
			if (keyboard.press('right')) {
				if (data.lastDirX !== 1) {
					inputs.push({
						action: 'dirX',
						dirX: 1
					});
					data.lastDirX = 1;
				}
	
			} else if (keyboard.press('left')) {
				if (data.lastDirX !== -1) {
					inputs.push({
						action: 'dirX',
						dirX: -1
					});
					data.lastDirX = -1;
				}
	
			} else if (data.lastDirX !== 0) {
				inputs.push({
					action: 'dirX',
					dirX: 0
				});
				data.lastDirX = 0;
			}
	
			if (keyboard.press('down')) {
				if (data.lastDirY !== 1) {
					inputs.push({
						action: 'dirY',
						dirY: 1
					});
					data.lastDirY = 1;
				}
	
			} else if (keyboard.press('up')) {
				if (data.lastDirY !== -1) {
					inputs.push({
						action: 'dirY',
						dirY: -1
					});
					data.lastDirY = -1;
				}
	
			} else if (data.lastDirY !== 0) {
				inputs.push({
					action: 'dirY',
					dirY: 0
				});
				data.lastDirY = 0;
			}

			// --- Aiming: mouse (desktop) ---
			if (mouse.press(0)) {
				inputs.push({ throwTarget, action: 'throwTarget' });
			} else if (mouse.killed(0)) {
				inputs.push({ throwOff: {}, action: 'throwOff' });
			}


			// --- Aiming: shift held (desktop) ---
			if (keyboard.first('shift')) {
				inputs.push({ throwAuto: {}, action: 'throwAuto' });
			}


			// Use items
			for (let slot = 0; slot < ITEM_COUNT; slot++) {
				if (keyboard.first(String(slot+1))) {
					inputs.push({ useItem: { slot }, action: 'useItem' });
				}
			}
		}




		return inputs;
	}

	private drawMinimap(
		ctx: CanvasRenderingContext2D,
		playerIdx: number
	) {
		const mapWidth = FULL_ROOM_SIZE * 5;
		const mapHeight = FULL_ROOM_SIZE * 5;

		const MINIMAP_SIZE = WIDTH * MINIMAP_RATIO;

		ctx.save();

		// Move to the minimap origin
		ctx.translate(
			MINIMAP_X,
			MINIMAP_Y
		);

		// Scale world coordinates to minimap coordinates
		ctx.scale(
			MINIMAP_SIZE / mapWidth,
			MINIMAP_SIZE / mapHeight
		);

		// Move the world origin to the center of the minimap
		ctx.translate(
			mapWidth / 2,
			mapHeight / 2
		);

		// Draw the minimap background
		ctx.fillStyle = "rgba(50, 50, 50, 0.7)";
		ctx.fillRect(
			-mapWidth / 2,
			-mapHeight / 2,
			mapWidth,
			mapHeight
		);


		// Draw the 5x3 grid
		ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
		ctx.lineWidth = 1 / (MINIMAP_SIZE / mapWidth);

		for (let x = 1; x < 5; x++) {
			const px = -mapWidth / 2 + x * FULL_ROOM_SIZE;

			ctx.beginPath();
			ctx.moveTo(px, -mapHeight / 2);
			ctx.lineTo(px, mapHeight / 2);
			ctx.stroke();
		}

		for (let y = 1; y < 5; y++) {
			const py = -mapHeight / 2 + y * FULL_ROOM_SIZE;

			ctx.beginPath();
			ctx.moveTo(-mapWidth / 2, py);
			ctx.lineTo(mapWidth / 2, py);
			ctx.stroke();
		}

		// Draw remaining buckets
		for (const turret of this.turrets) {
			ctx.fillStyle = turret.team ?? "green";

			ctx.beginPath();
			ctx.arc(
				turret.x,
				turret.y,
				75,
				0,
				Math.PI * 2
			);
			ctx.fill();
		}

		// Draw all players
		for (const [idx, player] of this.players.entries()) {
			ctx.fillStyle =
				idx === playerIdx
					? "yellow"
					: player.team === "red"
						? "red"
						: "blue";

			ctx.beginPath();
			ctx.arc(
				player.x,
				player.y,
				idx === playerIdx ? 150 : 100,
				0,
				Math.PI * 2
			);
			ctx.fill();
		}

		ctx.restore();

		// Draw the minimap border in screen coordinates
		ctx.strokeStyle = "white";
		ctx.lineWidth = 2;
		ctx.strokeRect(
			MINIMAP_X,
			MINIMAP_Y,
			MINIMAP_SIZE,
			MINIMAP_SIZE
		);
	}

	/**
	 * Draws the inventory bar at the top-left corner of the screen.
	 */
	private drawInventoryHUD(
		ctx: CanvasRenderingContext2D,
		player: Player,
		imageLoader: ImageLoader
	) {
		const startX = 30;
		const startY = 30;
		const slotSize = 70;
		const spacing = 15;

		for (let i = 0; i < ITEM_COUNT; i++) {
			const x = startX + i * (slotSize + spacing);
			const itemId = player.items[i] ?? -1;
			const isSelected = player.selectedItem === i;

			drawItemHand(
				ctx,
				x,
				startY,
				slotSize,
				itemId,
				i + 1,
				isSelected,
				imageLoader
			);
		}
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		imageLoader: ImageLoader
	) {
		const data = _data as ClientData;
		if (data.firstFrame) {
			data.firstFrame = false;
		}

		data.update(this, playerIdx);

		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		// Center the camera on the current player
		const cameraCoords = data.camera.getCoords();
		ctx.save();
		ctx.translate(WIDTH / 2, HEIGHT / 2);
		ctx.scale(Camera.SCALE, Camera.SCALE);
		ctx.translate(-cameraCoords.x, -cameraCoords.y);

		// Draw floors
		ctx.fillStyle = "#777";
		for (const f of this.floors) {
			ctx.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
		}

		// Draw turret backgrounds
		for (const turret of this.turrets) {
			turret.drawBackground(ctx);
		}

		// Draw items
		for (const item of this.itemsInMap) {
			item.draw(ctx, imageLoader);
		}

		// Draw entities (sliders, walls, balloons, troops, traps...)
		for (const entity of this.entities) {
			entity.draw(ctx, imageLoader);
		}
		
		// Draw bullets
		for (const b of this.bullets) {
			ctx.fillStyle = b.team === 'red' ? '#ff6666' : '#6666ff';
			ctx.beginPath();
			ctx.arc(b.x, b.y, Bullet.RADIUS, 0, Math.PI * 2);
			ctx.fill();
		}

		// Draw turrets
		for (const turret of this.turrets) {
			turret.draw(ctx, imageLoader);
		}

		// Draw all players
		for (const [idx, p] of this.players.entries()) {
			p.draw(ctx, idx === playerIdx);
		}

		// Restore the canvas state after leaving the camera coordinate space
		ctx.restore();

		// Draw top-left Inventory HUD
		const localPlayer = this.players[playerIdx];
		this.drawInventoryHUD(ctx, localPlayer, imageLoader);

		// Display the death screen when the local player is dead
		if (!localPlayer.isAlive()) {
			// Draw a semi-transparent black overlay over the entire screen
			ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
			ctx.fillRect(0, 0, WIDTH, HEIGHT);

			// Configure text rendering
			ctx.fillStyle = 'white';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';

			// Draw the death message
			ctx.font = 'bold 80px sans-serif';
			ctx.fillText("YOU DIED", WIDTH / 2, HEIGHT / 2 - 40);

			// Draw the remaining respawn time
			ctx.font = '40px sans-serif';
			ctx.fillText(
				`Respawn in ${localPlayer.alive.toFixed(1)}s`,
				WIDTH / 2,
				HEIGHT / 2 + 40
			);
		}

		this.drawMinimap(ctx, playerIdx);
	}




	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const {State} = protocols.get();
		
		const object: Fields = {
			players: this.players,
			
			turrets: this.turrets.map(t => ({
				taken: t.team !== null,
				redTeam: t.team === 'red',
				activation: t.activation,
				hp: t.hp,
				itemDamage: t.itemDamage,
				pauseTimer: t.pauseTimer,
				startCooldown: t.startCooldown,
				attackCooldown: t.attackCooldown,
				itemsToSpawn: t.itemsToSpawn,
				spawnIdx: t.spawnIdx,
			})),

			time: this.time,

			bullets: this.bullets.map(b => ({
				x: b.x,
				y: b.y,
				vx: b.vx,
				vy: b.vy,
				a: b.a,
				fromTurret: b.fromTurret,
				isRed: b.team === 'red'
			})),

			items: this.itemsInMap,

			entities: this.entities.map(serializeEntity),
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array): void {
		const {State} = protocols.get();
		const obj = State.decode(data);
		
		for (const [idx, player] of obj.players.entries()) {
			this.players[idx].load(player);
		}

		for (const [idx, turret] of obj.turrets.entries()) {
			this.turrets[idx].load(turret);
			
		}

		// Rebuild the bullets array from state
		this.bullets.length = 0;
		if (obj.bullets) {
			for (const b of obj.bullets) {
				this.bullets.push(
					new Bullet(
						b.x,
						b.y,
						b.vx,
						b.vy,
						b.a,
						b.isRed ? 'red' : 'blue',
						b.fromTurret
					)
				);
			}
		}

		// Rebuild items in map array
		this.itemsInMap.length = 0;
		if (obj.items) {
			for (const item of obj.items) {
				this.itemsInMap.push(new ItemInMap(item.x, item.y, item.id));
			}
		}

		// Rebuild entities from state
		this.entities.length = 0;
		if (obj.entities) {
			for (const e of obj.entities) {
				this.entities.push(deserializeEntity(e));
			}
		}

		this.time = obj.time;
	}


	override getSize() {
		return {width: WIDTH, height: HEIGHT};
	}

	override evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;
		const cameraCoords = clientData.camera.getCoords();

		const ret = {
			x: (x - WIDTH / 2) / Camera.SCALE + cameraCoords.x,
			y: (y - HEIGHT / 2) / Camera.SCALE + cameraCoords.y
		};

		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;

		return ret;
	}

	override getMobileDesc(): MobileDescriptor {
		return {
			buttons: {

			},

			joysticks: {
				move: {
					x: 100,
					xp: 'left',
					y: 120,
					yp: 'bottom',
					size: 100,
					color: "#00ff00"
				}
			}
		};
	}



	override createTutorial() {
		return new TutorialData(this);
	}

	private produceFinish(): FinishGame {
		const redTeam: number[] = [];
		const blueTeam: number[] = [];
		const playerEqualities: number[] = [];

		// Fill teams
		for (const [idx, player] of this.players.entries()) {
			if (player.team === 'red') {
				redTeam.push(idx);
			} else {
				blueTeam.push(idx);
			}
		}

		// Internal sort
		for (const team of [redTeam, blueTeam]) {
			// Sort
			team.sort((a, b) => this.players[b].score - this.players[a].score);

			// Detect equalities
			for (let i = 0; i < team.length - 2; i++) {
				const a = this.players[team[i]].score;
				const b = this.players[team[i+1]].score;
				if (a === b) {
					playerEqualities.push(team[i]);
				}
			}
		}


		let teams: number[][];
		const teamEqualities: number[] = [];
		/// TODO: Sort teams
		{
			teams = [redTeam, blueTeam];
		}

		return {
			results: teams,
			teamEqualities,
			playerEqualities
		};
	}

}

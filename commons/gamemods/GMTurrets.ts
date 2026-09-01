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
const WORLD_LIMIT = FULL_ROOM_SIZE * 2.5;

const TURRET_RADIUS = WIDTH * 0.6;
const TURRET_ACTIVATION = 1000;
const TURRET_COOLDOWN = 2.0; 
const TURRET_HP = 2000;
const TURRET_START_COOLDOWN = 5.0;
const TURRET_ITEM_DAMAGES = 500;
const TURRET_PAUSE = 12.5;

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
	static readonly SPEED = 1500;
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

	private static applyMovement(
		dirX: number,
		dirY: number,
		vx: number,
		vy: number,
		dt: number
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
		const targetSpeed = Player.SPEED * dirLength;

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
			dt
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
		this.attackMunitions =
			obj.attackMunitions ?? Player.ATTACK_FULL;

		this.attackFullyReloading =
			obj.attackReloading ?? false;

		this.items = obj.items && obj.items.length === ITEM_COUNT 
			? [...obj.items] 
			: Array(ITEM_COUNT).fill(-1);

	}

	avoidOOB() {
		this.x = Math.max(
			-WORLD_LIMIT + Player.RADIUS,
			Math.min(WORLD_LIMIT - Player.RADIUS, this.x)
		);

		this.y = Math.max(
			-WORLD_LIMIT + Player.RADIUS,
			Math.min(WORLD_LIMIT - Player.RADIUS, this.y)
		);
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

		// Run item logic and apply replacement logic (consumed if null)
		const nextItemId = itemDef.run(game, dx, dy);
		this.items[this.selectedItem] = nextItemId !== null ? nextItemId : -1;
		
		// Reset selection and apply a generic cooldown for item usage
		this.selectedItem = -1;
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


	static readonly SIZE = 100;

	constructor(
		public readonly x: number,
		public readonly y: number
	) {}

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

		this.attackCooldown -= dt;
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
			Math.abs(this.x) > WORLD_LIMIT ||
			Math.abs(this.y) > WORLD_LIMIT
		);
	}

	attack(game: GMTurrets) {
		const SR = Player.RADIUS + Bullet.RADIUS;
		const SR2 = SR * SR;

		// Check player collisions
		for (const p of game.players) {
			if (p.isAlive() && p.team !== this.team) {
				const dx = p.x - this.x;
				const dy = p.y - this.y;
				if (dx * dx + dy * dy < SR2) {
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



const ITEMS = [
	{
		iconMap: "none",
		iconHand: "none",
		name: "Test",

		run: (game: GMTurrets, dx: number, dy: number): number | null => {
			console.log(`Used item with direction vector (${dx}, ${dy})`);
			return null; 
		}
	}
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

		for (const p of this.players) {
			p.move(dt);
			p.attackLogic(dt, this); 
		}

		for (const turret of this.turrets) {
			turret.frame(dt, this);
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
				attackCooldown: t.attackCooldown
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
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array): void {
		const {State} = protocols.get();
		const obj = State.decode(data);
		
		for (const [idx, player] of obj.players.entries()) {
			this.players[idx].load(player);
		}

		for (const [idx, bucket] of obj.turrets.entries()) {
			const t = this.turrets[idx];
			if (!bucket.taken) {
				t.team = null;
			} else {
				t.team = bucket.redTeam ? 'red' : 'blue';
			}
			t.activation = bucket.activation;
			t.hp = bucket.hp;
			t.itemDamage = bucket.itemDamage;
			t.pauseTimer = bucket.pauseTimer;
			t.startCooldown = bucket.startCooldown;
			t.attackCooldown = bucket.attackCooldown;
			t.itemsToSpawn = bucket.itemsToSpawn;
			t.spawnIdx = bucket.spawnIdx;
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



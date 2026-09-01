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
const TURRET_RADIUS = WIDTH * 0.6;

const MINIMAP_X = WIDTH * 0.79;
const MINIMAP_Y = HEIGHT * 0.01;
const MINIMAP_RATIO = 0.2;

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
	static readonly COOLDOWN = 1.5;
	static readonly RADIUS = 60;
	static readonly PUSH_DOWN = 1000;
	static readonly THROW = 1200;
	static readonly BOUNCE_X = 1000;
	static readonly BOUNCE_Y = 100;

	// --- Attack System Constants ---
	static readonly ATTACK_FULL = 5.0;
	static readonly ATTACK_RELOAD = 3.0;
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

	target: FixedTarget | DeltaTarget | AutoTarget | null = null;
	team: 'red' | 'blue' = 'red';

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

	// Generic acceleration/deceleration for 2D movement.
	// The input direction must have a length <= 1.
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

		// The desired speed scales with the input length.
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

		// Decelerate if the current velocity exceeds the target speed.
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

			if (this.spawnX !== null) {
				this.x = this.spawnX;
			}

			if (this.spawnY !== null) {
				this.y = this.spawnY;
			}
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

		// Attack cooldown
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

		// Attack state.
		this.attackMunitions =
			obj.attackMunitions ?? Player.ATTACK_FULL;

		this.attackFullyReloading =
			obj.attackReloading ?? false;
	}

	avoidOOB() {
		/// TODO: edit this.x, y if oob
	}

	die() {
		this.vx = 0;
		this.vy = 0;
		this.alive = Player.COOLDOWN;
	}


	attackLogic(dt: number, game: GMTurrets) {
		/*
		* The magazine has been emptied.
		*
		* The player must wait until the magazine is completely
		* reloaded before being allowed to attack again.
		*/
		if (this.attackFullyReloading) {
			this.attackMunitions = Math.min(
				Player.ATTACK_FULL,
				this.attackMunitions + dt * Player.ATTACK_RELOAD
			);

			if (this.attackMunitions >= Player.ATTACK_FULL) {
				this.attackMunitions = Player.ATTACK_FULL;
				this.attackFullyReloading = false;
				this.attackTimer = Player.ATTACK_DELAY;
			}

			return;
		}

		// Attack logic.
		if (this.target !== null && this.isAlive()) {
			if (this.attackMunitions > 0) {
				// Drain munitions while attacking.
				this.attackMunitions = Math.max(
					0,
					this.attackMunitions - dt
				);

				this.attackCooldown = Player.ATTACK_COOLDOWN;
				this.attackTimer += dt;

				/*
				* The magazine has just been emptied.
				* Start the mandatory full reload.
				*/
				if (this.attackMunitions <= 0) {
					this.attackMunitions = 0;
					this.attackFullyReloading = true;
					this.attackTimer = 0;
					return;
				}

				// Fire bullets every ATTACK_DELAY seconds.
				if (this.attackTimer >= Player.ATTACK_DELAY) {
					this.attackTimer = 0;

					// Determine base shooting angle.
					let baseAngle = 0;

					if (this.target.type === 'fixed') {
						baseAngle = Math.atan2(
							this.target.y - this.y,
							this.target.x - this.x
						);
					} else if (this.target.type === 'delta') {
						baseAngle = Math.atan2(
							this.target.dy,
							this.target.dx
						);
					} else if (this.target.type === 'auto') {
						// Find the closest alive enemy.
						let closestDist = Infinity;
						let closestEnemy: Player | null = null;

						for (const other of game.players) {
							if (
								other.team !== this.team &&
								other.isAlive()
							) {
								const dist = Math.hypot(
									other.x - this.x,
									other.y - this.y
								);

								if (dist < closestDist) {
									closestDist = dist;
									closestEnemy = other;
								}
							}
						}

						if (closestEnemy) {
							baseAngle = Math.atan2(
								closestEnemy.y - this.y,
								closestEnemy.x - this.x
							);
						} else {
							// Default forward direction.
							baseAngle =
								this.team === 'red'
									? Math.PI / 2
									: -Math.PI / 2;
						}
					}

					// Create bullets for every pattern.
					for (const pat of Bullet.PATTERNS) {
						const startAngle =
							baseAngle - pat.angle / 2;

						const step =
							pat.count > 1
								? pat.angle / (pat.count - 1)
								: 0;

						for (let i = 0; i < pat.count; i++) {
							const a =
								startAngle + i * step;

							const dx = Math.cos(a);
							const dy = Math.sin(a);

							game.bullets.push(
								Bullet.create(
									this.x,
									this.y,
									dx,
									dy,
									this.team,
									pat.dist,
									pat.initSpeed
								)
							);
						}
					}
				}
			}
			
		} else {
			/*
			* Not attacking.
			*
			* The firing timer is kept ready so that shooting
			* starts immediately when the player attacks.
			*/
			this.attackTimer = Math.min(this.attackTimer + dt, Player.ATTACK_DELAY);

			if (this.attackCooldown > 0) {
				this.attackCooldown = Math.max(
					0,
					this.attackCooldown - dt
				);
			}

			if (this.attackCooldown <= 0) {
				this.attackMunitions = Math.min(
					Player.ATTACK_FULL,
					this.attackMunitions + dt * Player.ATTACK_RELOAD
				);
			}

		}
	}
}


class Turret {
	team: 'red' | 'blue' | null = null;

	static readonly SIZE = 60;

	constructor(
		public readonly x: number,
		public readonly y: number
	) {}
}

class Bullet {
	static readonly RADIUS = 10;

	static readonly PATTERNS = [
		{ count: 5, angle: Math.PI / 16, dist: 1600, initSpeed: 2000 },
		{ count: 5, angle: Math.PI / 8, dist: 600, initSpeed: 1000 },
		{ count: 5, angle: Math.PI / 4, dist: 200, initSpeed: 1000 }
	];

	constructor(
		public x: number,
		public y: number,
		public vx: number,
		public vy: number,
		public readonly ax: number,
		public readonly ay: number,
		public readonly maxDist: number,
		public readonly team: 'red' | 'blue',
		public traveledDist: number
	) {}

	static create(
		x: number,
		y: number,
		vx0: number,
		vy0: number,
		team: 'red' | 'blue',
		dist: number,
		initSpeed: number
	) {
		const length = Math.hypot(vx0, vy0);

		// Direction of the bullet.
		const dx = length > 0 ? vx0 / length : 0;
		const dy = length > 0 ? vy0 / length : 0;

		// v^2 = v0^2 + 2ad
		const acceleration = -initSpeed * initSpeed / (2 * dist);

		const vx = dx * initSpeed;
		const vy = dy * initSpeed;

		const ax = dx * acceleration;
		const ay = dy * acceleration;

		const maxDist = dist;

		return new Bullet(
			x, y, vx, vy,
			ax, ay, maxDist, team, 0
		);
	}

	move(dt: number): boolean {
		const oldVx = this.vx;
		const oldVy = this.vy;

		// Constant acceleration.
		this.vx += this.ax * dt;
		this.vy += this.ay * dt;

		// Don't allow the bullet to start moving backwards.
		const speed = Math.hypot(this.vx, this.vy);
		if (speed <= 0) {
			this.vx = 0;
			this.vy = 0;
		}

		// Distance traveled during this frame.
		const dx = (oldVx + this.vx) * 0.5 * dt;
		const dy = (oldVy + this.vy) * 0.5 * dt;
		const frameDist = Math.hypot(dx, dy);

		this.x += dx;
		this.y += dy;
		this.traveledDist += frameDist;

		return (
			this.traveledDist >= this.maxDist ||
			Math.abs(this.x) > FULL_ROOM_SIZE * 3 || // OOB
			Math.abs(this.y) > FULL_ROOM_SIZE * 3    // OOB

		)
	}
}




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

	time = 600;

	finished = false;
	internalFrameTick = 0;



	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0)
		);

		for (let x = -2; x <= 2; x++) {
			for (let y = -2; y <= 2; y++) {
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
				-FULL_ROOM_SIZE * 2,
				'red'
			);

			game.players[1].initSpawn(
				0,
				+FULL_ROOM_SIZE * 2,
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
		// Time management.
		this.time -= dt;

		if (this.time <= 0) {
			this.finished = true;
		}

		// Move players and handle attacks.
		for (const p of this.players) {
			p.move(dt);
			p.attackLogic(dt, this);
		}

		// Move bullets and handle bounds.
		for (let i = this.bullets.length - 1; i >= 0; i--) {
			const b = this.bullets[i];

			if (b.move(dt)) {
				this.bullets.splice(i, 1);
			}
		}

		// Finish.
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

		const player = this.players[playerIdx];


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
		
		// Draw Turrets
		for (const turret of this.turrets) {
			ctx.drawImage(
				imageLoader.get(null),
				turret.x - Turret.SIZE/2,
				turret.y - Turret.SIZE/2,
				Turret.SIZE,
				Turret.SIZE
			);
		}

		// Draw bullets
		for (const b of this.bullets) {
			ctx.fillStyle = b.team === 'red' ? '#ff6666' : '#6666ff';
			ctx.beginPath();
			ctx.arc(b.x, b.y, Bullet.RADIUS, 0, Math.PI * 2);
			ctx.fill();
		}

		// Draw players
		for (const [idx, p] of this.players.entries()) {
			ctx.fillStyle = p.team;

			ctx.beginPath();
			ctx.arc(p.x, p.y, Player.RADIUS, 0, Math.PI * 2);
			ctx.fill();

			// Draw the attack bar ONLY for the current local player
			if (idx === playerIdx) {
				const BAR_W = 80;
				const BAR_H = 10;

				const ratio =
					p.attackMunitions / Player.ATTACK_FULL;

				// Background.
				ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
				ctx.fillRect(
					p.x - BAR_W / 2,
					p.y - Player.RADIUS - 20,
					BAR_W,
					BAR_H
				);

				/*
				* During a mandatory full reload, the entire bar is grey.
				*/
				if (p.attackFullyReloading) {
					ctx.fillStyle = 'gray';

					ctx.fillRect(
						p.x - BAR_W / 2,
						p.y - Player.RADIUS - 20,
						BAR_W,
						BAR_H
					);
				} else {
					ctx.fillStyle =
						p.attackCooldown > 0
							? 'orange'
							: 'white';

					ctx.fillRect(
						p.x - BAR_W / 2,
						p.y - Player.RADIUS - 20,
						BAR_W * ratio,
						BAR_H
					);
				}
			}
		}

		ctx.restore();

		this.drawMinimap(ctx, playerIdx);
	}


	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const {State} = protocols.get();
		
		const object: Fields = {
			players: this.players, // Protobuf will automatically pick up attackMunitions
			turrets: this.turrets.map(b => ({
				taken: b.team !== null,
				redTeam: b.team === 'red'
			})),
			time: this.time,
			bullets: this.bullets.map(b => ({
				x: b.x,
				y: b.y,
				vx: b.vx,
				vy: b.vy,
				ax: b.ax,
				ay: b.ay,
				maxDist: b.maxDist,
				isRed: b.team === 'red',
				traveledDist: b.traveledDist
			}))
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
			if (!bucket.taken) {
				this.turrets[idx].team = null;
			} else {
				this.turrets[idx].team = bucket.redTeam ? 'red' : 'blue';
			}
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
						b.ax,
						b.ay,
						b.maxDist,
						b.isRed ? 'red' : 'blue',
						b.traveledDist
					)
				);
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



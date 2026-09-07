import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

const protocols = getProtocol('roarsOnGlass', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

namespace collisions {
	export interface Circle { x: number; y: number; r: number; }
	export interface Rect { x: number; y: number; w: number; h: number; }
	
	export function RectCircle(rect: Rect, circle: Circle) {
		const distX = Math.abs(circle.x - rect.x);
		const distY = Math.abs(circle.y - rect.y);
		if (distX > (rect.w/2 + circle.r)) { return false; }
		if (distY > (rect.h/2 + circle.r)) { return false; }
		if (distX <= (rect.w/2)) { return true; } 
		if (distY <= (rect.h/2)) { return true; }
		const dx = distX - rect.w/2;
		const dy = distY - rect.h/2;
		return (dx*dx + dy*dy <= (circle.r*circle.r));
	}
	export function CircleCircle(a: Circle, b: Circle) {
		const dx = a.x - b.x; const dy = a.y - b.y;
		return (dx*dx + dy*dy <= (a.r + b.r)*(a.r + b.r));
	}
	export function RectRect(a: Rect, b: Rect) {
		return (Math.abs(a.x - b.x) * 2 < (a.w + b.w)) &&
			   (Math.abs(a.y - b.y) * 2 < (a.h + b.h));
	}
}
const norm2 = (dx: number, dy: number) => dx*dx + dy*dy;

const WIDTH = 2400;
const HEIGHT = 1350;
const TILE_SIZE = 150;
const GRID_W = Math.floor(WIDTH / TILE_SIZE);
const GRID_H = Math.floor(HEIGHT / TILE_SIZE);
const PLAYER_SIZE = 60; 

// Physics Constants
const SPEED = 400;
const ACCELERATION = 2000;
const SOFT_DECELERATION = 1000;
const QUICK_DECELERATION = 3000;
const MIN_DECELERATION = 500;

// Ability Constants
const ROAR_COOLDOWN = 3.0; // Seconds between roars
const ROAR_CAST_TIME = 1.0; // Immobilized duration
const ROAR_RADIUS = 500;
const ROAR_ARC = Math.PI / 2; // 90 degrees
const PUSH_SPEED = 800; // Initial push velocity
const SPEED_REDUCOR = 800; // Speed reduction per second during push

class Player {
	spawnX: number | null = null;
	spawnY: number | null = null;
	connected = true;
	alive = 1; // 1 = alive, -1 = dead
	team: 'red' | 'blue' = 'red';
	
	// Movement
	vx = 0;
	vy = 0;
	dirX = 0;
	dirY = 0;
	
	// Roar / Push Mechanics
	isRoaring = false;
	roarTimer = 0; // if > 0, player is currently roaring
	roarCooldown = 0;
	pushTimer = 0; // if > 0, player is being pushed
	
	constructor(public x: number, public y: number) {}
	
	initSpawn(x: number, y: number, team: 'red' | 'blue') {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
		this.team = team;
		this.alive = 1;
		this.vx = 0;
		this.vy = 0;
		this.roarTimer = 0;
		this.pushTimer = 0;
	}
	
	isAlive() {
		return this.alive > 0;
	}
	
	load(obj: any) {
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.alive = obj.alive;
		this.connected = obj.connected;
		this.roarTimer = obj.roarTimer;
		this.roarCooldown = obj.roarCooldown;
		this.pushTimer = obj.pushTimer;
		this.team = obj.isRed ? 'red' : 'blue';
	}
	
	save() {
		return {
			x: this.x,
			y: this.y,
			vx: this.vx,
			vy: this.vy,
			alive: this.alive,
			connected: this.connected,
			roarTimer: this.roarTimer,
			roarCooldown: this.roarCooldown,
			pushTimer: this.pushTimer,
			isRed: this.team === 'red'
		};
	}
}

class Camera {
	x = WIDTH/2;
	y = HEIGHT/2;
	static readonly SCALE = 0.8;
	update(px: number, py: number, dt: number) {
		// Simple lerp to player position
		this.x += (px - this.x) * 5 * dt;
		this.y += (py - this.y) * 5 * dt;
	}
	teleport(px: number, py: number) {
		this.x = px;
		this.y = py;
	}
	getCoords() {
		return { x: this.x, y: this.y };
	}
}

class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;
	skins: string[] = [];
	prevX = 0;
	prevY = 0;
	readonly html: HTMLDivElement;
	readonly time: HTMLDivElement;
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;
	readonly camera = new Camera();
	private clientWasDead = true;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-roarsOnGlass-root");
		this.time = document.createElement("div");
		this.time.classList.add("game-roarsOnGlass-time");
		const scores = document.createElement("div");
		scores.classList.add("game-roarsOnGlass-scores");
		this.redScore = document.createElement("div");
		this.blueScore = document.createElement("div");
		this.redScore.classList.add("game-roarsOnGlass-red-score");
		this.blueScore.classList.add("game-roarsOnGlass-blue-score");
		const tiret = document.createElement("div");
		tiret.textContent = "-";
		scores.appendChild(this.redScore);
		scores.appendChild(tiret);
		scores.appendChild(this.blueScore);
		this.html.appendChild(scores);
		this.html.appendChild(this.time);
	}
	static showTime(time: number) {
		const minutes = Math.floor(time / 60);
		const seconds = (time % 60).toFixed(1);
		return `${minutes}:${seconds.padStart(4, "0")}`;
	}
	update(game: GMRoarsOnGlass, playerIdx: number) {
		this.time.innerText = ClientData.showTime(game.time);
		this.redScore.innerText = String(game.redScore).padStart(2, "0");
		this.blueScore.innerText = String(game.blueScore).padStart(2, "0");
		const player = game.players[playerIdx];
		if (this.clientWasDead && player.alive > 0) {
			this.camera.teleport(player.x, player.y);
		}
		this.clientWasDead = (player.alive <= 0);
		if (player.alive > 0) {
			this.camera.update(player.x, player.y, 1/60);
		}
	}
}

function generateClientDom(unlockedSkins: string[]) {
	return {
		skin: Object.keys(GMRoarsOnGlass.SKINS)[0],
		preferTeam: 0,
		SKINS: GMRoarsOnGlass.SKINS,
		unlockedSkins: unlockedSkins,
		produce() {
			const {StartData} = protocols.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		},
		hasSkin(skin: string) {
			return this.unlockedSkins.includes(skin);
		},
		getSkinIconPath: (id: string) => `/assets/games/test/skins/${id}/icon.png`
	};
}

class TutorialData {
    frame(dt: number, clock: number) {
		return "Hello";
	}
}

export class GMRoarsOnGlass extends GameMode {
	static readonly types = {Player};
	readonly players: Player[];
	
	// Game state
	grid: number[][] = [];
	redScore = 0;
	blueScore = 0;
	time = 300; // 5 mins max
	
	roundTimer = 0; // Used for restart delay
	isRoundEnding = false;
	
	private constructor(total: number) {
		super();
		this.players = Array.from({ length: total }, () => new Player(0, 0));
		this.initGrid();
	}

	static readonly TEXTURES = {};
	
	initGrid() {
		this.grid = [];
		for (let y = 0; y < GRID_H; y++) {
			let row = [];
			for (let x = 0; x < GRID_W; x++) {
				row.push(3.0); // 3 = unbroken glass
			}
			this.grid.push(row);
		}
	}
	
	resetRound() {
		this.initGrid();
		for (let p of this.players) {
			if (p.spawnX !== null && p.spawnY !== null) {
				p.initSpawn(p.spawnX, p.spawnY, p.team);
			}
		}
		this.isRoundEnding = false;
		this.roundTimer = 0;
	}

	static async createServ(players: PlayerInput[], total: number, hasSkin: any) {
		const {StartData, StartDataClient} = protocols.get();
		const game = new GMRoarsOnGlass(total);
		
		for (let i = 0; i < total; i++) {
			const team = (i % 2 === 0) ? 'red' : 'blue';
			const spawnX = (team === 'red') ? TILE_SIZE * 2 : WIDTH - TILE_SIZE * 2;
			const spawnY = HEIGHT / 2;
			game.players[i].initSpawn(spawnX, spawnY, team);
		}
		
		const data = StartDataClient.encode({
			players: game.players.map((p) => ({
				x: p.spawnX,
				y: p.spawnY,
				skin: 'default',
				isRed: p.team === 'red'
			}))
		}).finish();
		return { game, data };
	}
	
	static createClient(data: Uint8Array | null, total: number) {
		const game = new GMRoarsOnGlass(total);
		const {StartDataClient} = protocols.get();
		const clientData = new ClientData();
		
		if (data) {
			const decoded = decodeFullMessage(StartDataClient.decode(data));
			for (const [idx, p] of decoded.players.entries()) {
				game.players[idx].initSpawn(p.x, p.y, p.isRed ? 'red' : 'blue');
				clientData.skins.push(p.skin);
			}
		}
		return { game, data: clientData, html: clientData.html, skins: {} };
	}
	
	static readonly generateClientDom = generateClientDom;
	static readonly SKINS = { 'default': "Default" };
	static readonly SKINS_IDS = Object.keys(GMRoarsOnGlass.SKINS);
	
	override init(): void {}
	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}
	
	// Helper to apply velocity physics based on input direction
	private applyPhysics(dt: number, velocity: number, dir: number) {
		let v = velocity;
		if (dir === 0) {
			if (v > 0) {
				v -= SOFT_DECELERATION * dt;
				if (v < 0) v = 0;
			} else if (v < 0) {
				v += SOFT_DECELERATION * dt;
				if (v > 0) v = 0;
			}
		} else if (dir > 0) {
			if (v < 0) {
				v += QUICK_DECELERATION * dt;
				if (v > 0) v = 0;
			} else if (v < SPEED) {
				v += ACCELERATION * dt;
				if (v > SPEED) v = SPEED;
			} else if (v > SPEED) {
				v -= MIN_DECELERATION * dt;
				if (v < SPEED) v = SPEED;
			}
		} else { // dir < 0
			if (v > 0) {
				v -= QUICK_DECELERATION * dt;
				if (v < 0) v = 0;
			} else if (v > -SPEED) {
				v -= ACCELERATION * dt;
				if (v < -SPEED) v = -SPEED;
			} else if (v < -SPEED) {
				v += MIN_DECELERATION * dt;
				if (v > -SPEED) v = -SPEED;
			}
		}
		return v;
	}
	
	override run(dt: number, produceFinish: boolean): FinishGame | null {
		this.time -= dt;
		if (this.time <= 0 && produceFinish) return this.produceFinish();
		
		// Round end logic
		if (this.isRoundEnding) {
			this.roundTimer -= dt;
			if (this.roundTimer <= 0) {
				this.resetRound();
			}
			return null;
		}

		// Update grid and check deaths
		for (let y = 0; y < GRID_H; y++) {
			for (let x = 0; x < GRID_W; x++) {
				let cell = this.grid[y][x];
				if (cell <= 0) continue; // Already broken
				
				let touched = false;
				const tileRect = { x: x*TILE_SIZE + TILE_SIZE/2, y: y*TILE_SIZE + TILE_SIZE/2, w: TILE_SIZE, h: TILE_SIZE };
				
				for (let p of this.players) {
					if (p.isAlive() && collisions.RectCircle(tileRect, {x: p.x, y: p.y, r: PLAYER_SIZE/2})) {
						touched = true;
						break;
					}
				}
				
				if (cell === 3) {
					if (touched) {
						cell -= dt;
					}
				} else if (cell >= 2) {
					cell -= dt;
					if (cell < 2 && !touched) {
						cell = 2;
					}
				} else if (cell < 2 && cell > 0) {
					cell -= dt;
					if (cell < 0) {
						cell = 0;
					}
				}


				this.grid[y][x] = cell;
			}
		}


		// Players roaring
		for (let p of this.players) {
			if (!p.isAlive()) continue;

			if (p.isRoaring && p.roarCooldown <= 0 && p.pushTimer <= 0) {
				// Trigger Roar
				p.roarTimer = ROAR_CAST_TIME;
				p.roarCooldown = ROAR_COOLDOWN;
				
				// Find nearest enemy
				let nearestDist = Infinity;
				let nearestEnemy = null;
				for (let e of this.players) {
					if (e !== p && e.team !== p.team && e.isAlive()) {
						let d = norm2(e.x - p.x, e.y - p.y);
						if (d < nearestDist) { nearestDist = d; nearestEnemy = e; }
					}
				}
				
				if (nearestEnemy) {
					let roarAngle = Math.atan2(nearestEnemy.y - p.y, nearestEnemy.x - p.x);
					// Push enemies in cone
					for (let e of this.players) {
						if (e !== p && e.team !== p.team && e.isAlive()) {
							let dist = Math.sqrt(norm2(e.x - p.x, e.y - p.y));
							if (dist <= ROAR_RADIUS) {
								let angle = Math.atan2(e.y - p.y, e.x - p.x);
								let angleDiff = Math.abs(angle - roarAngle);
								if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
								
								if (angleDiff <= ROAR_ARC / 2) {
									e.pushTimer = 1.0;
									e.vx = Math.cos(angle) * PUSH_SPEED;
									e.vy = Math.sin(angle) * PUSH_SPEED;
								}
							}
						}
					}
				}
			}
		}
		
		// Update Players
		let redAliveCount = 0;
		let blueAliveCount = 0;
		
		for (let p of this.players) {
			if (!p.isAlive()) continue;
			
			// Cooldowns
			if (p.roarCooldown > 0) p.roarCooldown -= dt;
			if (p.roarTimer > 0) p.roarTimer -= dt;
			if (p.pushTimer > 0) p.pushTimer -= dt;
			
			// Check if standing on broken glass (falling)
			let touchesAnyGlass = false;
			for (let y = 0; y < GRID_H; y++) {
				for (let x = 0; x < GRID_W; x++) {
					if (this.grid[y][x] > 0) {
						const tileRect = { x: x*TILE_SIZE + TILE_SIZE/2, y: y*TILE_SIZE + TILE_SIZE/2, w: TILE_SIZE, h: TILE_SIZE };
						if (collisions.RectCircle(tileRect, {x: p.x, y: p.y, r: PLAYER_SIZE/2})) {
							touchesAnyGlass = true;
							break;
						}
					}
				}
				if (touchesAnyGlass) break;
			}
			
			if (!touchesAnyGlass) {
				p.alive = -1; // Fall and die
				continue;
			}
			
			if (p.team === 'red') redAliveCount++;
			else blueAliveCount++;
			
			// Movement handling
			if (p.pushTimer > 0) {
				// Reduce push velocity over time
				let currentSpeed = Math.sqrt(norm2(p.vx, p.vy));
				if (currentSpeed > 0) {
					let newSpeed = currentSpeed - SPEED_REDUCOR * dt;
					if (newSpeed < 0) newSpeed = 0;
					let ratio = newSpeed / currentSpeed;
					p.vx *= ratio;
					p.vy *= ratio;
				}
			} else if (p.roarTimer <= 0) {
				// Normal movement
				p.vx = this.applyPhysics(dt, p.vx, p.dirX);
				p.vy = this.applyPhysics(dt, p.vy, p.dirY);
			} else {
				// Roaring - immobilized
				p.vx = 0;
				p.vy = 0;
			}

			// Apply positions
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			
			// Boundaries
			if (p.x < 0) p.x = 0;
			if (p.x > WIDTH) p.x = WIDTH;
			if (p.y < 0) p.y = 0;
			if (p.y > HEIGHT) p.y = HEIGHT;
		}
		
		// Win conditions for the round
		if ((redAliveCount === 0 || blueAliveCount === 0)) {
			this.isRoundEnding = true;
			this.roundTimer = 3.0; // 3 seconds before next round
			if (redAliveCount > 0 && blueAliveCount === 0) {
				this.redScore++;
			} else if (blueAliveCount > 0 && redAliveCount === 0) {
				this.blueScore++;
			}
			// First to 5 points
			if ((this.redScore >= 5 || this.blueScore >= 5) && produceFinish) {
				return this.produceFinish();
			}
		}
		
		return null;
	}
	
	override runInput(playerIdx: number, input: Fields): void {
		const p = this.players[playerIdx];
		if (!p.isAlive()) return;
		
		if (input.action === 'move') {
			p.dirX = input.move.dx || 0;
			p.dirY = input.move.dy || 0;
		}
		
		if (input.action === 'roar') {
			p.isRoaring = input.roar;
		}
	}
	
	override collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		const inputs: Fields[] = [];
		let dx = 0; let dy = 0;
		if (keyboard.press('right') || keyboard.press('d')) dx += 1;
		if (keyboard.press('left') || keyboard.press('q') || keyboard.press('a')) dx -= 1;
		if (keyboard.press('down') || keyboard.press('s')) dy += 1;
		if (keyboard.press('up') || keyboard.press('z') || keyboard.press('w')) dy -= 1;
		
		if (dx !== data.prevX || dy !== data.prevY) {
			inputs.push({ action: 'move', move: {dx, dy} });
			data.prevX = dx;
			data.prevY = dy;
		}
		
		if (keyboard.first('space')) {
			inputs.push({ action: 'roar' });
		}
		
		return inputs;
	}
	
	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = false;
		const data = _data as ClientData;
		if (data.firstFrame) {
			_imageLoader.setColorRule('player', 0, [{prev: "#ff00ff", next: "#ff4444"}]); // Red
			_imageLoader.setColorRule('player', 1, [{prev: "#ff00ff", next: "#4444ff"}]); // Blue
			data.firstFrame = false;
		}
		data.update(this, playerIdx);
		
		// Fill background (void)
		ctx.fillStyle = "#111";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
		
		const cameraCoords = data.camera.getCoords();
		ctx.save();
		ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
		ctx.scale(Camera.SCALE, Camera.SCALE);
		ctx.translate(-cameraCoords.x, -cameraCoords.y);
		
		// Draw Grid
		for (let y = 0; y < GRID_H; y++) {
			for (let x = 0; x < GRID_W; x++) {
				const cell = this.grid[y][x];
				if (cell <= 0) continue;
				
				// Calculate color based on state
				let alpha = cell / 3.0; // 1.0 down to 0
				if (cell <= 2) {
					// Cracking / breaking color indication
					ctx.fillStyle = `rgba(255, 100, 100, ${alpha})`;
				} else {
					ctx.fillStyle = `rgba(150, 200, 255, ${alpha})`;
				}
				
				ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
			}
		}
		
		// Draw Players
		for (let p of this.players) {
			if (!p.isAlive()) continue;
			
			ctx.fillStyle = p.team === 'red' ? '#ff4444' : '#4444ff';
			ctx.beginPath();
			ctx.arc(p.x, p.y, PLAYER_SIZE/2, 0, 2 * Math.PI);
			ctx.fill();
			
			// Visual indicator for roar
			if (p.roarTimer > 0) {
				ctx.strokeStyle = "rgba(255, 255, 0, 0.5)";
				ctx.lineWidth = 10;
				ctx.beginPath();
				ctx.arc(p.x, p.y, PLAYER_SIZE, 0, 2 * Math.PI);
				ctx.stroke();
			}
		}
		
		ctx.restore();
	}
	
	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}
	
	override save(): Uint8Array {
		const {State} = protocols.get();
		return State.encode({
			players: this.players.map(p => p.save()),
			grid: this.grid.flat(),
			redScore: this.redScore,
			blueScore: this.blueScore,
			time: this.time,
			roundTimer: this.roundTimer,
			isRoundEnding: this.isRoundEnding
		}).finish();
	}
	
	override load(data: Uint8Array) {
		const {State} = protocols.get();
		const obj = State.decode(data);
		for (let i = 0; i < this.players.length; i++) {
			if (obj.players[i]) this.players[i].load(obj.players[i]);
		}
		this.redScore = obj.redScore;
		this.blueScore = obj.blueScore;
		this.time = obj.time;
		this.roundTimer = obj.roundTimer;
		this.isRoundEnding = obj.isRoundEnding;
		
		if (obj.grid && obj.grid.length === GRID_W * GRID_H) {
			for (let y = 0; y < GRID_H; y++) {
				for (let x = 0; x < GRID_W; x++) {
					this.grid[y][x] = obj.grid[y * GRID_W + x];
				}
			}
		}
	}
	
	override getSize() { return {width: WIDTH, height: HEIGHT}; }
	override evalMouseCoords(x: number, y: number, playerIdx: number, _data: any) { return {x, y}; }
	override getMobileDesc(): MobileDescriptor { return { joysticks: {}, buttons: {} }; }
	override createTutorial() { return new TutorialData(); }
	
	private produceFinish(): FinishGame {
		// Team 0 = Red, Team 1 = Blue
		let results: number[][] = [];
		if (this.redScore > this.blueScore) {
			results = [[], []]; // Red wins
			for(let i=0; i<this.players.length; i++) {
				if(this.players[i].team === 'red') results[0].push(i);
				else results[1].push(i);
			}
		} else {
			results = [[], []]; // Blue wins
			for(let i=0; i<this.players.length; i++) {
				if(this.players[i].team === 'blue') results[0].push(i);
				else results[1].push(i);
			}
		}
		return {
			results,
			teamEqualities: this.redScore === this.blueScore ? [0] : [],
			playerEqualities: []
		};
	}
}

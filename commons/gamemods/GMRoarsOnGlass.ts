import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";
import { norm2 } from "../util/norm2";

const protocols = getProtocol('roarsOnGlass', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

const WIDTH = 1600;
const HEIGHT = 2800;
const TILE_SIZE = 150;
const GRID_PADDING = 1.5;
const GRID_W = Math.floor(WIDTH / TILE_SIZE) - GRID_PADDING*2;
const GRID_H = Math.floor(HEIGHT / TILE_SIZE) - GRID_PADDING*2;
const PLAYER_SIZE = 100; 
const PLAYER_ROUND = 20; 

// Physics Constants
const SPEED = 400;
const ACCELERATION = 2000;
const SOFT_DECELERATION = 1000;
const QUICK_DECELERATION = 3000;
const MIN_DECELERATION = 500;

// Ability Constants
const ROAR_COOLDOWN = 3.0; // Seconds between roars
const ROAR_CAST_TIME = 1.0; // Immobilized duration
const ROAR_RADIUS = 200;
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
		this.roarCooldown = 0;
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

class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;
	skins: string[] = [];
	prevX = 0;
	prevY = 0;
	prevRoar = false;
	readonly html: HTMLDivElement;
	readonly time: HTMLDivElement;
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;

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
		if (game.time < 60) {
			this.time.innerText = ClientData.showTime(game.time);
		}
		this.redScore.innerText = String(game.redScore).padStart(2, "0");
		this.blueScore.innerText = String(game.blueScore).padStart(2, "0");
		const player = game.players[playerIdx];
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
		getSkinIconPath: (id: string) => (
			window.IMG_ROOT_PATH + `/assets/games/test/skins/${id}/icon.png`
		)
	};
}

class TutorialData {
	constructor(private readonly game: GMRoarsOnGlass) {}

	private step = 0;
	private wakeUp = 0;

	frame(dt: number, clock: number): string | null {
		this.game.players[1].dirY = -1;
		const player = this.game.players[0];
		if (player.alive < 0) {
			this.step = 0;
			return "You died";
		}

		if (this.step === 0) {
			this.wakeUp = clock + 1.5;
			this.step = 1;
			return "Don't fall on glass";
		}

		if (this.step === 1) {
			if (clock >= this.wakeUp) {
				this.step = 2;
			}
			return "Don't fall on glass";
		}

		if (this.step === 2) {
			return "Use ROAR (or press SPACE) to propulse your opponents out of bounds";
		}

		return null;

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

	static readonly TEXTURES = {
		'broken': "/assets/games/roarsOnGlass/broken-glass.svg",
		'glass':  "/assets/games/roarsOnGlass/glass.svg",
	};
	
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


		function decode(i: number) {
			if (i < players.length)
				return decodeFullMessage(StartData.decode(players[i].data));

			return generateClientDom([]);
		}


		// Pre-decode all player messages once for performance
		const playerInfos = await Promise.all(
			game.players.map(async (p, i) => {
				const d = decode(i);
				let skin: string;
				const pseudo = i < players.length ? players[i].pseudo : null;
				if (pseudo !== null && GMRoarsOnGlass.SKINS_IDS.includes(d.skin)) {
					if (await hasSkin('example', d.skin, pseudo)) {
						skin = d.skin as string;
					} else {
						skin = GMRoarsOnGlass.SKINS_IDS[0];
					}
				} else {
					skin = GMRoarsOnGlass.SKINS_IDS[0];
				}

				return {
					player: p,
					index: i,
					skin: skin,
					pref: d.preferTeam ?? 0
				}
			})
		);

		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);

		const assigned = new Array<boolean>(totalPlayers);
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
			const spawnX = WIDTH/2;
			const spawnY = (
				redTeam ?
				(GRID_PADDING+1) * TILE_SIZE : 
				(GRID_H+GRID_PADDING-1) * TILE_SIZE
			);
			p.initSpawn(spawnX, spawnY, redTeam ? 'red' : 'blue');
		}



		const data = StartDataClient.encode({
			players: game.players.map((p, idx) => ({
				x: p.spawnX,
				y: p.spawnY,
				skin: playerInfos[idx].skin,
				isRed: p.team === 'red'
			}))
		}).finish();

		return {
			game,
			data
		};
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
		} else {
			for (const [i, p] of game.players.entries()) {
			const redTeam = (i % 2) === 0;
			const spawnX = WIDTH/2;
			const spawnY = (
				redTeam ?
				(GRID_PADDING+1) * TILE_SIZE : 
				(GRID_H+GRID_PADDING-1) * TILE_SIZE
			);
			p.initSpawn(spawnX, spawnY, redTeam ? 'red' : 'blue');
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

	private handlePlayerCollisions(): void {
		const halfSize = PLAYER_SIZE / 2;
		const round = PLAYER_ROUND;

		for (let i = 0; i < this.players.length; i++) {
			const a = this.players[i];
			if (!a.isAlive()) continue;

			for (let j = i + 1; j < this.players.length; j++) {
				const b = this.players[j];
				if (!b.isAlive()) continue;

				const dx = b.x - a.x;
				const dy = b.y - a.y;

				// Les deux carrés arrondis sont séparés
				const maxDistance = PLAYER_SIZE;

				if (Math.abs(dx) >= maxDistance || Math.abs(dy) >= maxDistance)
					continue;

				// Centre de la hitbox de A vers B
				const ax = Math.abs(dx);
				const ay = Math.abs(dy);

				// Distance entre les parties "droites" des deux hitbox
				const px = Math.max(0, ax - (PLAYER_SIZE - round * 2));
				const py = Math.max(0, ay - (PLAYER_SIZE - round * 2));

				const dist2 = px * px + py * py;
				const radius = round * 2;

				if (dist2 >= radius * radius)
					continue;

				let nx: number;
				let ny: number;
				let penetration: number;

				if (dist2 === 0) {
					// Collision dans les parties rectangulaires
					if (ax > ay) {
						nx = Math.sign(dx) || 1;
						ny = 0;
						penetration = PLAYER_SIZE - ax;
					} else {
						nx = 0;
						ny = Math.sign(dy) || 1;
						penetration = PLAYER_SIZE - ay;
					}
				} else {
					const dist = Math.sqrt(dist2);

					nx = dx / dist;
					ny = dy / dist;

					penetration = radius - dist;
				}

				const correction = penetration / 2;

				a.x -= nx * correction;
				a.y -= ny * correction;

				b.x += nx * correction;
				b.y += ny * correction;
			}
		}
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
				const tileRect = {
					x: (x + GRID_PADDING + .5) * TILE_SIZE,
					y: (y + GRID_PADDING + .5) * TILE_SIZE,
					w: TILE_SIZE,
					h: TILE_SIZE
				};

				for (let p of this.players) {
					if (p.isAlive() && collisions.RoundedRectRect(
						{
							x: p.x,
							y: p.y,
							w: PLAYER_SIZE,
							h: PLAYER_SIZE,
							radius: PLAYER_ROUND
						},
						tileRect
					)) {
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
				
				// Push enemies in range
				for (let e of this.players) {
					if (e !== p && e.team !== p.team && e.isAlive()) {
						if (collisions.RoundedRectCircle(
							{
								x: e.x,
								y: e.y,
								w: PLAYER_SIZE,
								h: PLAYER_SIZE,
								radius: PLAYER_ROUND
							},
							{
								x: p.x,
								y: p.y,
								r: ROAR_RADIUS
							}
						)) {
							console.log("coll", p.team);
							const dx = e.x - p.x;
							const dy = e.y - p.y;
							const invNorm = PUSH_SPEED / Math.sqrt(dx * dx + dy * dy);
							
							e.vx = dx * invNorm;
							e.vy = dy * invNorm;
							e.pushTimer = 1.0;
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
						const tileRect = {
							x: (x + GRID_PADDING + .5) * TILE_SIZE,
							y: (y + GRID_PADDING + .5) * TILE_SIZE,
							w: TILE_SIZE,
							h: TILE_SIZE
						};

						if (collisions.RoundedRectRect(
							{
								x: p.x,
								y: p.y,
								w: PLAYER_SIZE,
								h: PLAYER_SIZE,
								radius: PLAYER_ROUND
							},
							tileRect
						)) {
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

			this.handlePlayerCollisions();
			
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
		let dx = 0; let dy = 0; let roar = false;
		if (keyboard.press('right') || keyboard.press('d')) dx += 1;
		if (keyboard.press('left') || keyboard.press('q') || keyboard.press('a')) dx -= 1;
		if (keyboard.press('down') || keyboard.press('s')) dy += 1;
		if (keyboard.press('up') || keyboard.press('z') || keyboard.press('w')) dy -= 1;
		
		if (mobile) {
			if (mobile.press('roar')) {roar = true;}

			const joy = mobile.getJoystick('move');
			if (joy.x !== 0 && joy.y !== 0) {
				dx = joy.x;
				dy = joy.y;
			}
		}

		if (keyboard.press('jump')) {
			roar = true;	
		}
		
		if (dx !== data.prevX || dy !== data.prevY) {
			inputs.push({ action: 'move', move: {dx, dy} });
			data.prevX = dx;
			data.prevY = dy;
		}

		if (roar !== data.prevRoar) {
			inputs.push({ action: 'roar', roar });
			data.prevRoar = roar;
		}
		
		return inputs;
	}
	
	private drawRoundedRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		size: number,
		radius: number
	): void {
		const half = size / 2;
		const left = x - half;
		const top = y - half;
		const right = x + half;
		const bottom = y + half;

		ctx.beginPath();
		ctx.moveTo(left + radius, top);
		ctx.lineTo(right - radius, top);
		ctx.arcTo(right, top, right, top + radius, radius);
		ctx.lineTo(right, bottom - radius);
		ctx.arcTo(right, bottom, right - radius, bottom, radius);
		ctx.lineTo(left + radius, bottom);
		ctx.arcTo(left, bottom, left, bottom - radius, radius);
		ctx.lineTo(left, top + radius);
		ctx.arcTo(left, top, left + radius, top, radius);
		ctx.closePath();
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		const imageLoader = _imageLoader.getFolder('roarsOnGlass');

		ctx.imageSmoothingEnabled = false;
		const data = _data as ClientData;
		if (data.firstFrame) {
			data.firstFrame = false;
		}
		data.update(this, playerIdx);
		
		// Fill background (void)
		ctx.fillStyle = "#039";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
		
		ctx.save();
		
		// Draw Grid
		const brokenTexture = imageLoader.get('broken');
		const glassTexture = imageLoader.get('glass');
		for (let y = 0; y < GRID_H; y++) {
			for (let x = 0; x < GRID_W; x++) {
				const cell = this.grid[y][x];
				if (cell <= 0) continue;

				const SPACING = 2;

				let dx = 0;
				let dy = 0;
				let alpha = 1;

				// Shake broken cells
				if (cell < 2) {
					// Generate deterministic pseudo-random offsets from the cell position
					const seedX = Math.sin(cell * 0.1 + x) * 43758.5453;
					const seedY = Math.sin(cell * 0.1 + y) * 43758.5453;

					const randomX = seedX - Math.floor(seedX);
					const randomY = seedY - Math.floor(seedY);

					const SHAKE = 5;

					dx = (randomX * 2 - 1) * SHAKE;
					dy = (randomY * 2 - 1) * SHAKE;

					// Only calculate opacity for cells that are almost destroyed
					if (cell < 0.5) {
						alpha = cell / 0.5;
					}
				}

				// Calculate color based on state
				if (cell < 3) {
					ctx.fillStyle = `rgba(255, 100, 100, ${alpha})`;
				} else {
					ctx.fillStyle = `rgba(150, 200, 255, ${alpha})`;
				}

				ctx.drawImage(
					cell < 3 ? brokenTexture : glassTexture,
					(x + GRID_PADDING) * TILE_SIZE + SPACING + dx,
					(y + GRID_PADDING) * TILE_SIZE + SPACING + dy,
					TILE_SIZE - SPACING * 2,
					TILE_SIZE - SPACING * 2
				);
			}
		}
		
		// Draw Players
		for (let p of this.players) {
			if (!p.isAlive()) continue;
			
			ctx.fillStyle = p.team === 'red' ? '#ff4444' : '#44ff44';

			this.drawRoundedRect(
				ctx,
				p.x,
				p.y,
				PLAYER_SIZE,
				PLAYER_ROUND
			);

			ctx.fill();

			// Visual indicator for roar
			if (p.roarTimer > 0) {
				ctx.strokeStyle = "rgba(255, 255, 0, 0.5)";
				ctx.lineWidth = 10;
				ctx.beginPath();
				ctx.arc(
					p.x,
					p.y,
					ROAR_RADIUS,
					0,
					2 * Math.PI
				);
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
	
	override getMobileDesc(): MobileDescriptor {
		return {
			joysticks: {
				move: {
					x: 100,
					xp: 'left',
					y: 100,
					yp: 'bottom',
					size: 100,
					color: "#007700"
				}
			},

			buttons: {
				roar: {
					x: 100,
					xp: 'right',
					y: 100,
					yp: 'bottom',
					size: 100,
					color: "#ff00ff"
				}
			}
		};
	}
	override createTutorial() { return new TutorialData(this); }
	
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

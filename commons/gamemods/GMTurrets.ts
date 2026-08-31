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
	static readonly GRAB_GRAVITY = 900;
	static readonly SPEED = 1500;
	static readonly ACCELERATION = 10000;
	static readonly MIN_DECELERATION = 1000;
	static readonly SOFT_DECELERATION = 10000;
	static readonly QUICK_DECELERATION = 30000;
	static readonly JUMP = 800;
	static readonly SPAWN_JUMP = 90;
	static readonly COOLDOWN = 1.5;
	static readonly WIDTH = 40;
	static readonly HEIGHT = 80;
	static readonly PUSH_DOWN = 1000;
	static readonly THROW = 1200;
	static readonly BOUNCE_X = 1000;
	static readonly BOUNCE_Y = 100;

	spawnX: number | null = null;
	spawnY: number | null = null
	connected = true;
	alive = -1;
	vx = 0;
	vy = -Player.SPAWN_JUMP;
	dirX = 0;
	dirY = 0;
	score = 0;
	target : FixedTarget | DeltaTarget | AutoTarget | null = null;
	team: 'red' | 'blue' = 'red';

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

	move(dt: number) {
		if (this.alive >= 0) {
			this.alive -= dt;
			if (this.alive >= 0)
				return;

			if (this.spawnX !== null) {this.x = this.spawnX;}
			if (this.spawnY !== null) {this.y = this.spawnY;}
		}

		// Set vx
		if (this.dirX === 0) {
			if (this.vx > 0) {
				this.vx -= Player.SOFT_DECELERATION * dt;
				if (this.vx < 0) this.vx = 0;
			} else if (this.vx < 0) {
				this.vx += Player.SOFT_DECELERATION * dt;
				if (this.vx > 0) this.vx = 0;
			}
		} else if (this.dirX > 0) {
			if (this.vx < 0) {
				this.vx += Player.QUICK_DECELERATION * dt;
				if (this.vx > 0) this.vx = 0;
			} else if (this.vx < Player.SPEED) {
				this.vx += Player.ACCELERATION * dt;
				if (this.vx > Player.SPEED) this.vx = Player.SPEED;
			} else if (this.vx > Player.SPEED) {
				this.vx -= Player.MIN_DECELERATION * dt;
				if (this.vx < Player.SPEED) this.vx = Player.SPAWN_JUMP;
			}
		} else /*if (this.dir < 0)*/ {
			if (this.vx > 0) {
				this.vx -= Player.QUICK_DECELERATION * dt;
				if (this.vx < 0) this.vx = 0;
			} else if (this.vx > -Player.SPEED) {
				this.vx -= Player.ACCELERATION * dt;
				if (this.vx < -Player.SPEED) this.vx = -Player.SPEED;
			} else if (this.vx < -Player.SPEED) {
				this.vx += Player.MIN_DECELERATION * dt;
				if (this.vx > -Player.SPEED) this.vx = -Player.SPAWN_JUMP;
			}
		}
		
		this.x += this.vx * dt;
		this.y += this.vy * dt;

		this.avoidOOB();
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
	}

	avoidOOB() {
		/// TODO: edit this.x, y if oob 
	}

	die() {
		this.vx = 0;
		this.vy = -Player.SPAWN_JUMP;
		this.alive = Player.COOLDOWN;
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







class Camera {
	x = 0;
	y = 0;

	static readonly SCALE = 1;
	static readonly DURATION = 0.3;

	// Transition state variables
	private startX = 0;
	private startY = 0;
	private targetX = 0;
	private targetY = 0;
	private isTransitioning = false;
	private t = 0;

	/**
	 * Easing function: f([0;1]) -> [0;1]
	 * Here we use a standard "Smoothstep" (ease-in-out) function as an example.
	 */
	private easing(t: number): number {
		// Clamp t just in case
		const clampedT = Math.max(0, Math.min(1, t)); 
		return clampedT * clampedT * (3 - 2 * clampedT);
	}

	/**
	 * Calculates the center coordinates of the zone the player is currently in.
	 */
	private getZoneCenter(px: number, py: number) {
		// Calculate the zone index based on the player's position
		// Since zone starts at x*W - W/2, the center is exactly at x*W
		let zx = Math.round(px / FULL_ROOM_SIZE);
		let zy = Math.round(py / FULL_ROOM_SIZE);

		// Clamp indices to your specific bounds: x in [-2, 2] and y in [-1, 1]
		zx = Math.max(-2, Math.min(2, zx));
		zy = Math.max(-1, Math.min(1, zy));

		return {
			cx: zx * FULL_ROOM_SIZE,
			cy: zy * FULL_ROOM_SIZE
		};
	}

	/**
	 * Updates the camera position.
	 * @param px Player X position
	 * @param py Player Y position
	 * @param dt Delta time (time elapsed since last frame, e.g., in milliseconds)
	 */
	update(px: number, py: number, dt: number) {
		const { cx, cy } = this.getZoneCenter(px, py);

		// If the calculated zone center is different from our current target,
		// it means the player has entered a new zone.
		if (cx !== this.targetX || cy !== this.targetY) {
			// Setup the new transition. 
			// We start from the CURRENT camera position to prevent snapping 
			// if the zone changes while another transition is already running.
			this.startX = this.x;
			this.startY = this.y;
			this.targetX = cx;
			this.targetY = cy;
			
			// Reset transition timer
			this.t = 0;
			this.isTransitioning = true;
		}

		if (this.isTransitioning) {
			this.t += dt;

			if (this.t >= Camera.DURATION) {
				// Transition is over
				this.isTransitioning = false;
				this.x = this.targetX;
				this.y = this.targetY;
			} else {
				// Apply the easing function to interpolate the camera's position
				const progress = this.easing(this.t / Camera.DURATION);
				
				this.x = this.startX + (this.targetX - this.startX) * progress;
				this.y = this.startY + (this.targetY - this.startY) * progress;
			}
		} else {
			// Not transitioning, tightly lock to the target
			this.x = this.targetX;
			this.y = this.targetY;
		}
	}

	/**
	 * Instantly moves the camera to the player's current zone, 
	 * breaking any ongoing transition.
	 */
	teleport(px: number, py: number) {
		const { cx, cy } = this.getZoneCenter(px, py);
		
		// Instantly snap coordinates
		this.x = cx;
		this.y = cy;
		
		// Break the transition and update targets
		this.targetX = cx;
		this.targetY = cy;
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
	private lastDirs: Record<number, boolean> = {};

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


		// Player
		const player = game.players[playerIdx];
		if (this.clientWasDead && player.alive < 0) {
			this.camera.teleport(player.x, player.y)
		}
		this.clientWasDead = (player.alive >= 0);

		this.camera.update(player.x, player.y, 1/60);
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

	override run(dt: number, produceFinish: boolean): FinishGame | null {
		// Time
		this.time -= dt;
		if (this.time <= 0) {
			this.finished = true;
		}


		// Move
		for (const [idx, p] of this.players.entries()) {
			p.move(dt);
		}


		// Finish
		if (produceFinish && this.finished) {
			return this.produceFinish();
		}
		return null;
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		switch (input.action) {
			case 'right':
				player.dirX = 1;
				break;

			case 'left':
				player.dirX = -1;
				break;

			case 'stop':
				player.dirX = 0;
				break;

			case 'jump':
				break;

			case 'downOn':
				break;

			case 'downOff':
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
					dx: input.throwTarget.x,
					dy: input.throwTarget.y,
				};
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

		function getMoveInput(): Fields|null {
			const r0 = keyboard.first('right');
			const l0 = keyboard.first('left');

			const right = {right: {}, action: 'right'};
			const left = {left: {}, action: 'left'};
			const stop = {stop: {}, action: 'stop'};
	
			if (r0 && !l0)
				return right;
			
			if (!r0 && l0)
				return left;
			
			if (r0 && l0)
				return stop;
	
			const rK = keyboard.killed('right');
			const lK = keyboard.killed('left');

			if (rK && lK)
				return stop;

			const r = keyboard.press('right');
			const l = keyboard.press('left');

			if (rK) {
				return l ? left : stop;
			}

			if (lK) {
				return r ? right : stop;
			}
			
			return null;
		}


		// Left / Right
		const inputs: Fields[] = [];
		const moveInput = getMoveInput();
		if (moveInput) {
			inputs.push(moveInput);
		}

		// Jump / Down
		if (keyboard.first('up') || keyboard.first('jump')) {
			inputs.push({jump: {}, action: 'jump'});
		}

		if (keyboard.first('down')) {
			inputs.push({downOn: {}, action: 'downOn'});
		}

		if (keyboard.killed('down')) {
			inputs.push({downOff: {}, action: 'downOff'});
		}


		// Target
		if (mouse.press(0)) {
			inputs.push({throwTarget, action: 'throwTarget'});
			
		} else if (mouse.killed(0)) {
			inputs.push({throwOff: {}, action: 'throwOff'});
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
		ctx.fillStyle = "white";
		for (const f of this.floors) {
			ctx.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
		}
		

		// Turrets
		for (const turret of this.turrets) {
			ctx.drawImage(
				imageLoader.get(null),
				turret.x - Turret.SIZE/2,
				turret.y - Turret.SIZE/2,
				Turret.SIZE,
				Turret.SIZE
			);
		}

		// Draw players
		const playerTexture = imageLoader.get('skin-default');
		const w = playerTexture.width / 6;
		const h = playerTexture.height / 4;
		const width = Player.WIDTH * 4 / 3;

		for (const [idx, p] of this.players.entries()) {
			ctx.fillStyle = p.team;

			ctx.fillRect(
				p.x - Player.WIDTH/2,
				p.y - Player.HEIGHT/2,
				Player.WIDTH,
				Player.HEIGHT
			);
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
			players: this.players,
			turrets: this.turrets.map(b => ({
				taken: b.team !== null,
				redTeam: b.team === 'red'
			})),
			time: this.time,
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

	override getMobileDesc() {
		return null;
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


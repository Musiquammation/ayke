import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

// Protocol definitions loader for Popit game mode
const protocols = getProtocol('popit', 'multiplayer');

/**
 * Interface representing input data payload sent by a connected player.
 */
interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

// Global game display constants
const WIDTH = 2400;
const HEIGHT = 1350;
const GRID_ROWS = 6;
const GRID_COLS = 6;
const RESPAWN_COOLDOWN = 2; // Seconds before player respawns
const PLAYER_SIZE = 50;

const X_LIMIT = WIDTH * 2.5;
const Y_LIMIT = HEIGHT * 1.5;

// Rainbow colors for the 6 Pop-It rows
const ROW_COLORS = [
	{ primary: "#FF3B30", dark: "#C0261D", highlight: "#FF6B63" }, // Row 0: Red
	{ primary: "#FF9500", dark: "#C67300", highlight: "#FFB340" }, // Row 1: Orange
	{ primary: "#FFCC00", dark: "#C79F00", highlight: "#FFDC40" }, // Row 2: Yellow
	{ primary: "#34C759", dark: "#248A3D", highlight: "#63DA82" }, // Row 3: Green
	{ primary: "#007AFF", dark: "#0051A8", highlight: "#409CFF" }, // Row 4: Blue
	{ primary: "#AF52DE", dark: "#7B33A0", highlight: "#C97AEF" }  // Row 5: Purple
];

/**
 * Represents a single cell (bubble) on the 6x6 Pop-It board.
 */
class Cell {
	/**
	 * Indicates whether the bubble is popped (off/disabled).
	 * Default state is intact (false = intact / ON, true = popped / OFF).
	 */
	popped = false;

	constructor(public row: number, public col: number) {}

	/**
	 * Reset cell to intact state.
	 */
	reset() {
		this.popped = false;
	}
}

/**
 * Represents a player state in the Popit game.
 * Strictly holds shared server data (no client-only variables).
 */
class Player {
	spawnX: number | null = null;
	spawnY: number | null = null;
	connected = true;
	alive = -1;
	team: 'red' | 'blue' = 'red';
	score = 0;

	constructor(
		public x: number,
		public y: number
	) {}

	/**
	 * Initializes the spawn position and team assignment for this player.
	 * @param x Spawn X coordinate
	 * @param y Spawn Y coordinate
	 * @param team Assigned team ('red' or 'blue')
	 */
	initSpawn(x: number, y: number, team: 'red' | 'blue') {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
		this.team = team;
	}

	/**
	 * Checks if the player is currently alive and active.
	 */
	isAlive(): boolean {
		return this.alive < 0;
	}

	/**
	 * Updates the player position and handle respawn timer if dead.
	 * @param dt Delta time in seconds
	 */
	move(dt: number) {
		if (this.alive >= 0) {
			this.alive -= dt;
			if (this.alive >= 0) return;

			if (this.spawnX !== null) { this.x = this.spawnX; }
			if (this.spawnY !== null) { this.y = this.spawnY; }
		}

		if (this.isOOB()) {
			this.die();
		}
	}

	/**
	 * Hydrates player instance fields from serialized state object.
	 * @param obj Deserialized fields container
	 */
	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.connected = obj.connected ?? true;
		this.alive = obj.alive ?? -1;
		this.team = obj.isRed ? 'red' : 'blue';
		this.score = obj.score ?? 0;
	}

	/**
	 * Checks if the player position is out of bounds.
	 */
	isOOB(): boolean {
		return (
			this.x < -X_LIMIT + PLAYER_SIZE / 2 ||
			this.x > X_LIMIT - PLAYER_SIZE / 2 ||
			this.y < -Y_LIMIT + PLAYER_SIZE / 2 ||
			this.y > Y_LIMIT - PLAYER_SIZE / 2
		);
	}

	/**
	 * Kills the player and starts respawn timer.
	 */
	die() {
		this.alive = RESPAWN_COOLDOWN;
	}
}

/**
 * Camera class tracking viewport center relative to active player.
 */
class Camera {
	x = 0;
	y = 0;

	static readonly SCALE = 0.8;

	/**
	 * Calculates the center coordinates of the zone the player is currently in.
	 */
	private getZoneCenter(px: number, py: number) {
		let zx = Math.round(px / WIDTH);
		let zy = Math.round(py / HEIGHT);

		zx = Math.max(-2, Math.min(2, zx));
		zy = Math.max(-1, Math.min(1, zy));

		return {
			cx: zx * WIDTH,
			cy: zy * HEIGHT
		};
	}

	/**
	 * Updates smooth camera movement towards player position.
	 */
	update(px: number, py: number, dt: number) {
		this.x = px;
		this.y = py;
	}

	/**
	 * Instantly snaps camera position to target coordinates.
	 */
	teleport(px: number, py: number) {
		const { cx, cy } = this.getZoneCenter(px, py);
		this.x = cx;
		this.y = cy;
	}

	/**
	 * Returns current camera coordinates.
	 */
	getCoords() {
		return { x: this.x, y: this.y };
	}
}

/**
 * ClientData manages client-side DOM overlay and non-shared rendering assets.
 * No gameplay logical decisions are stored here.
 */
class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;
	skins: string[] = [];

	readonly html: HTMLDivElement;
	readonly time: HTMLDivElement;
	readonly turnIndicator: HTMLDivElement;
	readonly endTurnBtn: HTMLButtonElement;
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;

	readonly camera = new Camera();
	private clientWasDead = true;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-popit-root");

		this.time = document.createElement("div");
		this.time.classList.add("game-popit-time");

		this.turnIndicator = document.createElement("div");
		this.turnIndicator.classList.add("game-popit-turn-indicator");

		this.endTurnBtn = document.createElement("button");
		this.endTurnBtn.classList.add("game-popit-end-turn-btn");
		this.endTurnBtn.textContent = "FINISH TURN";

		const scores = document.createElement("div");
		scores.classList.add("game-popit-scores");
		this.redScore = document.createElement("div");
		this.blueScore = document.createElement("div");

		this.redScore.classList.add("game-popit-red-score");
		this.blueScore.classList.add("game-popit-blue-score");

		const tiret = document.createElement("div");
		tiret.textContent = "-";

		scores.appendChild(this.redScore);
		scores.appendChild(tiret);
		scores.appendChild(this.blueScore);

		this.html.appendChild(scores);
		this.html.appendChild(this.turnIndicator);
		this.html.appendChild(this.time);
		this.html.appendChild(this.endTurnBtn);
	}

	static showTime(time: number) {
		const minutes = Math.floor(time / 60);
		const seconds = (time % 60).toFixed(1);
		return `${minutes}:${seconds.padStart(4, "0")}`;
	}

	/**
	 * Updates HUD DOM elements on each client render frame.
	 */
	update(game: GMPopit, playerIdx: number) {
		this.time.innerText = ClientData.showTime(game.time);

		this.redScore.innerText = String(game.redScore).padStart(2, "0");
		this.blueScore.innerText = String(game.blueScore).padStart(2, "0");

		const isMyTurn = game.currentTurn === playerIdx;
		if (game.gameOver) {
			this.turnIndicator.innerText = game.loserIndex === playerIdx ? "YOU LOST!" : "YOU WON!";
			this.turnIndicator.style.color = game.loserIndex === playerIdx ? "#FF3B30" : "#34C759";
			this.endTurnBtn.style.display = "none";
		} else {
			this.turnIndicator.innerText = isMyTurn ? "YOUR TURN - POP A BUBBLE!" : `PLAYER ${game.currentTurn + 1}'S TURN`;
			this.turnIndicator.style.color = isMyTurn ? "#34C759" : "#FFFFFF";
			this.endTurnBtn.style.display = (isMyTurn && game.hasPoppedThisTurn) ? "block" : "none";
		}

		// Update camera position based on local player state
		const player = game.players[playerIdx];
		if (player) {
			if (this.clientWasDead && player.alive < 0) {
				this.camera.teleport(player.x, player.y);
			}
			this.clientWasDead = (player.alive >= 0);
			this.camera.update(player.x, player.y, 1 / 60);
		}
	}
}

/**
 * TutorialData manages step-by-step interactive instructions.
 */
class TutorialData {
	private step = 0;

	constructor(private readonly game: GMPopit) {}

	/**
	 * Evaluates tutorial messages based on game state.
	 */
	frame(dt: number, clock: number): string {
		const player = this.game.players[0];

		if (player.alive >= 0) this.step = 0;

		if (this.step === 0) {
			return "Pop at least one bubble in a row. Don't pop the last bubble or you lose!";
		}

		return "";
	}
}

/**
 * Generates initial payload DOM binding structure for skin and team preferences.
 */
function generateClientDom(unlockedSkins: string[]) {
	return {
		skin: Object.keys(GMPopit.SKINS)[0],
		preferTeam: 0,
		SKINS: GMPopit.SKINS,
		unlockedSkins: unlockedSkins,

		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		},

		hasSkin(skin: string) {
			return this.unlockedSkins.includes(skin);
		},

		getSkinIconPath
	};
}

function getSkinTexturePath(id: string) {
	return `/assets/games/popit/skins/${id}/grid.png`;
}

function getSkinIconPath(id: string) {
	return window.IMG_ROOT_PATH + `/assets/games/popit/skins/${id}/icon.png`;
}

/**
 * Main GameMode implementation for GMPopit.
 */
export class GMPopit extends GameMode {
	static readonly types = { Player };

	static readonly DATA = {
		WIDTH,
		HEIGHT,
		GRID_ROWS,
		GRID_COLS,
		X_LIMIT,
		Y_LIMIT
	};

	readonly players: Player[];
	readonly grid: Cell[][];

	redScore = 0;
	blueScore = 0;
	time = 300; // 5 minute total round timer

	currentTurn = 0;            // Player index whose turn it currently is
	turnRow = -1;               // Active row index selected during current turn (-1 = none yet)
	lastPoppedCol = -1;         // Last column popped in the current turn
	hasPoppedThisTurn = false;  // Flag ensuring player pops at least 1 bubble before ending turn

	gameOver = false;
	loserIndex = -1;

	internalFrameTick = 0;

	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0)
		);

		// Initialize 6x6 grid with all cells intact (popped = false)
		this.grid = Array.from({ length: GRID_ROWS }, (_, r) =>
			Array.from({ length: GRID_COLS }, (_, c) => new Cell(r, c))
		);
	}

	/**
	 * Factory method to initialize server game state and player initial parameters.
	 */
	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();

		const game = new GMPopit(total);

		function decode(i: number) {
			if (i < players.length) {
				return decodeFullMessage(StartData.decode(players[i].data));
			}
			return generateClientDom([]);
		}

		// Decode player options safely
		const playerInfos = await Promise.all(
			game.players.map(async (p, i) => {
				const d = decode(i);
				let skin: string;
				const pseudo = i < players.length ? players[i].pseudo : null;
				if (pseudo !== null && GMPopit.SKINS_IDS.includes(d.skin)) {
					if (await hasSkin('popit', d.skin, pseudo)) {
						skin = d.skin as string;
					} else {
						skin = GMPopit.SKINS_IDS[0];
					}
				} else {
					skin = GMPopit.SKINS_IDS[0];
				}

				return {
					player: p,
					index: i,
					skin: skin,
					pref: d.preferTeam ?? 0
				};
			})
		);

		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);

		const assigned = new Array<boolean>(totalPlayers);
		let redCount = 0;
		let blueCount = 0;

		// Team preference balancing phase 1
		for (let i = 0; i < totalPlayers; i++) {
			const info = playerInfos[i];
			if (info.pref === 1 && redCount < maxPerTeam) {
				assigned[info.index] = true;
				redCount++;
			} else if (info.pref === -1 && blueCount < maxPerTeam) {
				assigned[info.index] = false;
				blueCount++;
			}
		}

		// Team preference balancing phase 2
		for (let i = 0; i < totalPlayers; i++) {
			if (assigned[i] !== undefined) continue;

			const isRed = redCount < blueCount || (redCount === blueCount && i % 2 === 0);
			if (isRed && redCount < maxPerTeam) {
				assigned[i] = true;
				redCount++;
			} else {
				assigned[i] = false;
				blueCount++;
			}
		}

		// Initialize player positions
		for (const [i, p] of game.players.entries()) {
			const redTeam = assigned[i];
			p.initSpawn(
				redTeam ? -WIDTH * 0.3 : WIDTH * 0.3,
				0,
				redTeam ? 'red' : 'blue'
			);
		}

		const data = StartDataClient.encode({
			players: game.players.map((p, idx) => ({
				x: p.spawnX,
				y: p.spawnY,
				skin: playerInfos[idx].skin,
				isRed: p.team === 'red'
			}))
		}).finish();

		return { game, data };
	}

	/**
	 * Factory method to construct client instance.
	 */
	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		playerIdx: number
	) {
		const game = new GMPopit(total);
		const { StartData, StartDataClient } = protocols.get();
		const clientData = new ClientData();
		let skins: { [k: string]: string };

		if (origin === 'server') {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
			const skinSet = new Set<string>();

			for (const [idx, p] of players.entries()) {
				game.players[idx].initSpawn(p.x, p.y, p.isRed ? 'red' : 'blue');
				clientData.skins.push(p.skin);
				skinSet.add(p.skin);
			}

			skins = Object.fromEntries(
				[...skinSet].map(key => ['skin-' + key, getSkinTexturePath(key)])
			);
		} else {
			const { skin } = decodeFullMessage(StartData.decode(data));

			game.players[0].initSpawn(-WIDTH * 0.3, 0, 'red');
			if (game.players.length > 1) {
				game.players[1].initSpawn(WIDTH * 0.3, 0, 'blue');
			}

			clientData.skins = Array.from(
				{ length: game.players.length },
				() => GMPopit.SKINS_IDS[0]
			);
			clientData.skins[0] = skin;

			skins = {};
		}

		// Attach event listener for HTML End Turn button
		clientData.endTurnBtn.onclick = () => {
			// Button triggers end turn intent
		};

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins
		};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly SKINS = {
		'default': "Classic Rainbow"
	};
	static readonly SKINS_IDS = Object.keys(GMPopit.SKINS);

	static readonly TEXTURES = {
		'popit': "/assets/games/popit/board.png",
		'skin-default': getSkinTexturePath('default')
	};

	override init(): void {
		this.resetGrid();
	}

	/**
	 * Resets all cells on the board to unpopped.
	 */
	private resetGrid() {
		for (let r = 0; r < GRID_ROWS; r++) {
			for (let c = 0; c < GRID_COLS; c++) {
				this.grid[r][c].reset();
			}
		}
		this.turnRow = -1;
		this.lastPoppedCol = -1;
		this.hasPoppedThisTurn = false;
		this.gameOver = false;
		this.loserIndex = -1;
	}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	/**
	 * Main game loop step execution.
	 */
	override run(dt: number, produceFinish: boolean): FinishGame | null {
		if (this.gameOver) {
			if (produceFinish) {
				return this.produceFinish();
			}
			return null;
		}

		// Advance overall timer
		this.time -= dt;
		let finished = false;

		if (this.time <= 0) {
			this.time = 0;
			this.gameOver = true;
			// Current active player loses if time runs out
			this.loserIndex = this.currentTurn;
			finished = true;
		}

		if (produceFinish && finished) {
			return this.produceFinish();
		}

		return null;
	}

	/**
	 * Checks whether any intact bubbles remain on the board.
	 */
	private countIntactBubbles(): number {
		let count = 0;
		for (let r = 0; r < GRID_ROWS; r++) {
			for (let c = 0; c < GRID_COLS; c++) {
				if (!this.grid[r][c].popped) {
					count++;
				}
			}
		}
		return count;
	}

	/**
	 * Validates whether a move to pop a specific cell is allowed under game rules.
	 * Rule 1: Cell must be intact (!popped).
	 * Rule 2: If bubbles popped this turn, must pop in same row.
	 * Rule 3: Must be adjacent to last popped bubble in this turn on same row.
	 */
	private isValidPop(row: number, col: number): boolean {
		if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return false;
		if (this.grid[row][col].popped) return false; // Must be intact

		if (!this.hasPoppedThisTurn) {
			// First move of the turn can pop any intact cell
			return true;
		}

		// Subsequent moves must stay in the same row
		if (row !== this.turnRow) return false;

		// Must be adjacent to the last popped column in this turn
		return Math.abs(col - this.lastPoppedCol) === 1;
	}

	/**
	 * Advances turn to next player in sequence.
	 */
	private advanceTurn() {
		this.turnRow = -1;
		this.lastPoppedCol = -1;
		this.hasPoppedThisTurn = false;
		this.currentTurn = (this.currentTurn + 1) % this.players.length;
	}

	/**
	 * Processes input command sent by a specific player.
	 */
	override runInput(playerIdx: number, input: Fields): void {
		if (this.gameOver) return;
		if (playerIdx !== this.currentTurn) return; // Only process active player's input

		if (input.action === 'pop') {
			const row = input.row as number;
			const col = input.col as number;

			if (this.isValidPop(row, col)) {
				// Mark cell as popped
				this.grid[row][col].popped = true;

				this.turnRow = row;
				this.lastPoppedCol = col;
				this.hasPoppedThisTurn = true;

				// Check if this was the last bubble on the entire board
				const remaining = this.countIntactBubbles();
				if (remaining === 0) {
					// The player who popped the last bubble LOSES!
					this.gameOver = true;
					this.loserIndex = playerIdx;
				}
			}
		} else if (input.action === 'endTurn') {
			if (this.hasPoppedThisTurn) {
				this.advanceTurn();
			}
		}
	}

	/**
	 * Collects local player inputs on client side.
	 */
	override collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		const mouseCoords = mouse.getCoords();
		data.mouseX = mouseCoords.x;
		data.mouseY = mouseCoords.y;

		const inputs: Fields[] = [];

		// Handle board click detection
		if (mouse.first(0)) {
			// Convert click coordinates to grid row/col
			const boardX = WIDTH / 2 - 300;
			const boardY = HEIGHT / 2 - 300;
			const cellSize = 100;

			if (
				mouseCoords.x >= boardX &&
				mouseCoords.x < boardX + GRID_COLS * cellSize &&
				mouseCoords.y >= boardY &&
				mouseCoords.y < boardY + GRID_ROWS * cellSize
			) {
				const col = Math.floor((mouseCoords.x - boardX) / cellSize);
				const row = Math.floor((mouseCoords.y - boardY) / cellSize);

				inputs.push({
					action: 'pop',
					row,
					col
				});
			}
		}

		// Handle Space or Enter key to end turn
		if (keyboard.first('space') || keyboard.first('enter')) {
			inputs.push({ action: 'endTurn' });
		}

		return inputs;
	}

	/**
	 * Render the complete Pop-It game board, bubbles, players, and UI elements.
	 */
	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = true;

		const data = _data as ClientData;
		if (data.firstFrame) {
			data.firstFrame = false;
		}

		data.update(this, playerIdx);

		// Background fill
		ctx.fillStyle = "#1E1E24";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		const cameraCoords = data.camera.getCoords();
		ctx.save();
		ctx.translate(WIDTH / 2, HEIGHT / 2);
		ctx.scale(Camera.SCALE, Camera.SCALE);
		ctx.translate(-cameraCoords.x, -cameraCoords.y);

		// Draw Pop-It Board frame
		const boardWidth = 680;
		const boardHeight = 680;
		const boardX = WIDTH / 2 - boardWidth / 2;
		const boardY = HEIGHT / 2 - boardHeight / 2;

		// Board shadow & outer frame
		ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
		ctx.beginPath();
		ctx.roundRect(boardX + 10, boardY + 15, boardWidth, boardHeight, 40);
		ctx.fill();

		ctx.fillStyle = "#2C2C34";
		ctx.beginPath();
		ctx.roundRect(boardX, boardY, boardWidth, boardHeight, 40);
		ctx.fill();

		// Draw grid bubbles
		const gridStartX = WIDTH / 2 - 300;
		const gridStartY = HEIGHT / 2 - 300;
		const cellSize = 100;
		const radius = 38;

		for (let r = 0; r < GRID_ROWS; r++) {
			const color = ROW_COLORS[r];
			for (let c = 0; c < GRID_COLS; c++) {
				const cx = gridStartX + c * cellSize + cellSize / 2;
				const cy = gridStartY + r * cellSize + cellSize / 2;
				const cell = this.grid[r][c];

				// Highlight valid moves for active player
				const isValid = this.currentTurn === playerIdx && this.isValidPop(r, c);

				if (cell.popped) {
					// Popped / depressed bubble state
					ctx.fillStyle = color.dark;
					ctx.beginPath();
					ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
					ctx.fill();

					// Inner shadow
					ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
					ctx.beginPath();
					ctx.arc(cx, cy, radius - 8, 0, Math.PI * 2);
					ctx.fill();
				} else {
					// Intact / raised bubble state
					ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
					ctx.beginPath();
					ctx.arc(cx + 2, cy + 4, radius, 0, Math.PI * 2);
					ctx.fill();

					ctx.fillStyle = isValid ? color.highlight : color.primary;
					ctx.beginPath();
					ctx.arc(cx, cy, radius, 0, Math.PI * 2);
					ctx.fill();

					// Highlight glare
					ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
					ctx.beginPath();
					ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
					ctx.fill();

					// Draw glow ring for playable moves
					if (isValid) {
						ctx.strokeStyle = "#FFFFFF";
						ctx.lineWidth = 4;
						ctx.beginPath();
						ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
						ctx.stroke();
					}
				}
			}
		}

		ctx.restore();
	}

	override onDisconnection(id: number): void {
		if (this.players[id]) {
			this.players[id].connected = false;
		}
	}

	/**
	 * Encodes full server state into Protobuf message format for replication/saving.
	 */
	override save(): Uint8Array {
		const { State } = protocols.get();

		const gridData = [];
		for (let r = 0; r < GRID_ROWS; r++) {
			for (let c = 0; c < GRID_COLS; c++) {
				gridData.push({ popped: this.grid[r][c].popped });
			}
		}

		const object: Fields = {
			grid: gridData,
			currentTurn: this.currentTurn,
			turnRow: this.turnRow,
			lastPoppedCol: this.lastPoppedCol,
			hasPoppedThisTurn: this.hasPoppedThisTurn,
			time: this.time,
			gameOver: this.gameOver,
			loserIndex: this.loserIndex,
			players: this.players.map(p => ({
				x: p.x,
				y: p.y,
				connected: p.connected,
				alive: p.alive,
				isRed: p.team === 'red',
				score: p.score
			}))
		};

		return State.encode(object).finish();
	}

	/**
	 * Restores full game state from Protobuf encoded data payload.
	 */
	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = State.decode(data);

		if (obj.grid && obj.grid.length === GRID_ROWS * GRID_COLS) {
			for (let r = 0; r < GRID_ROWS; r++) {
				for (let c = 0; c < GRID_COLS; c++) {
					const idx = r * GRID_COLS + c;
					this.grid[r][c].popped = obj.grid[idx].popped;
				}
			}
		}

		this.currentTurn = obj.currentTurn ?? 0;
		this.turnRow = obj.turnRow ?? -1;
		this.lastPoppedCol = obj.lastPoppedCol ?? -1;
		this.hasPoppedThisTurn = obj.hasPoppedThisTurn ?? false;
		this.time = obj.time ?? 300;
		this.gameOver = obj.gameOver ?? false;
		this.loserIndex = obj.loserIndex ?? -1;

		if (obj.players && Array.isArray(obj.players)) {
			for (let i = 0; i < this.players.length && i < obj.players.length; i++) {
				this.players[i].load(obj.players[i]);
			}
		}
	}

	override getSize() {
		return { width: WIDTH, height: HEIGHT };
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
			joysticks: {},
			buttons: {
				endTurn: {
					x: 100,
					xp: 'right',
					y: 100,
					yp: 'bottom',
					size: 80,
					color: '#34C759'
				}
			}
		};
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	/**
	 * Computes and constructs game results upon match termination.
	 */
	private produceFinish(): FinishGame {
		const numPlayers = this.players.length;
		const winnerIdx = (this.loserIndex === 0) ? 1 : 0;

		const results: number[][] = [
			[winnerIdx],
			[this.loserIndex]
		];

		return {
			results,
			teamEqualities: [],
			playerEqualities: []
		};
	}
}

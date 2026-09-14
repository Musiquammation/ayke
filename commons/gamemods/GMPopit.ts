import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

// Retrieve the protocol definitions dynamically for Popit multiplayer
const protocols = getProtocol('popit', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

// Global dimension constants required for square layout
const WIDTH = 2000;
const HEIGHT = 2000;

// Grid configuration
const GRID_ROWS = 6;
const GRID_COLS = 6;
const TOTAL_CELLS = GRID_ROWS * GRID_COLS;

// Board visual positioning relative to 2000x2000 canvas
const BOARD_SIZE = 1400;
const BOARD_X = (WIDTH - BOARD_SIZE) / 2; // 300
const BOARD_Y = (HEIGHT - BOARD_SIZE) / 2; // 300
const CELL_SIZE = BOARD_SIZE / GRID_COLS; // ~233.33px per cell
const BUBBLE_RADIUS = CELL_SIZE * 0.38; // Radius of each popit bubble

// Turn timer limit in seconds
const TURN_DURATION = 15;

// Rainbow color definitions for each row (Row 0 to 5)
const ROW_COLORS = [
	{ bg: "#FF3B30", popped: "#A0201B", border: "#D72A20" }, // Row 0: Red
	{ bg: "#FF9500", popped: "#A86200", border: "#E08300" }, // Row 1: Orange
	{ bg: "#FFCC00", popped: "#A38200", border: "#E0B300" }, // Row 2: Yellow
	{ bg: "#34C759", popped: "#1F7A37", border: "#2BB04C" }, // Row 3: Green
	{ bg: "#007AFF", popped: "#004EA8", border: "#0068E0" }, // Row 4: Blue
	{ bg: "#AF52DE", popped: "#6F328E", border: "#9A40C4" }  // Row 5: Purple
];

/**
 * Represents a player state in the Popit game.
 * Stores connectivity, spawn parameters, and individual player team status.
 */
class Player {
	spawnX: number | null = null;
	spawnY: number | null = null;
	connected = true;
	team: 'red' | 'blue' = 'red';
	score = 0;

	constructor(
		public x: number,
		public y: number
	) {}

	/**
	 * Initializes spawn coordinates and team membership for the player.
	 */
	initSpawn(x: number, y: number, team: 'red' | 'blue') {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
		this.team = team;
	}

	/**
	 * Restores player attributes from network decoding structure.
	 */
	load(obj: Fields) {
		this.connected = obj.connected ?? true;
		this.score = obj.score ?? 0;
		if (obj.team !== undefined) {
			this.team = obj.team;
		}
	}
}

/**
 * Static Camera helper for viewport transformations.
 */
class Camera {
	x = WIDTH / 2;
	y = HEIGHT / 2;

	static readonly SCALE = 1.0;

	update(px: number, py: number, dt: number) {
		this.x = px;
		this.y = py;
	}

	teleport(px: number, py: number) {
		this.x = px;
		this.y = py;
	}

	getCoords() {
		return { x: this.x, y: this.y };
	}
}

/**
 * UI and Client Data Handler for Popit.
 * Manages HTML elements, turn indicators, local interactions, and camera state.
 */
class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;
	skins: string[] = [];

	readonly html: HTMLDivElement;
	readonly time: HTMLDivElement;
	readonly turnInfo: HTMLDivElement;
	readonly endTurnBtn: HTMLButtonElement;
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;

	readonly camera = new Camera();

	// Local input tracking flags
	selectedRow: number | null = null;
	lastClickedCell: { row: number, col: number } | null = null;
	validateTurn = false;

	constructor() {
		// Root container element
		this.html = document.createElement("div");
		this.html.classList.add("game-popit-root");

		// Header area with game clock and scores
		const header = document.createElement("div");
		header.classList.add("game-popit-header");

		this.time = document.createElement("div");
		this.time.classList.add("game-popit-time");

		const scores = document.createElement("div");
		scores.classList.add("game-popit-scores");
		this.redScore = document.createElement("div");
		this.blueScore = document.createElement("div");

		this.redScore.classList.add("game-popit-red-score");
		this.blueScore.classList.add("game-popit-blue-score");

		const separator = document.createElement("div");
		separator.textContent = "-";

		scores.appendChild(this.redScore);
		scores.appendChild(separator);
		scores.appendChild(this.blueScore);

		header.appendChild(scores);
		header.appendChild(this.time);

		// Current turn display bar
		this.turnInfo = document.createElement("div");
		this.turnInfo.classList.add("game-popit-turn-info");

		// End Turn button overlay
		this.endTurnBtn = document.createElement("button");
		this.endTurnBtn.classList.add("game-popit-end-turn-btn");
		this.endTurnBtn.textContent = "VALIDATE TURN";

		this.html.appendChild(header);
		this.html.appendChild(this.turnInfo);
		this.html.appendChild(this.endTurnBtn);

		this.endTurnBtn.onclick = () => {this.validateTurn = true};
	}

	/**
	 * Formats fractional seconds into MM:SS format.
	 */
	static showTime(time: number) {
		const minutes = Math.floor(Math.max(0, time) / 60);
		const seconds = (Math.max(0, time) % 60).toFixed(1);
		return `${minutes}:${seconds.padStart(4, "0")}`;
	}

	/**
	 * Updates HTML UI state based on current GMState.
	 */
	update(game: GMPopit, playerIdx: number) {
		this.time.innerText = ClientData.showTime(game.turnTimer);

		this.redScore.innerText = String(game.redScore).padStart(2, "0");
		this.blueScore.innerText = String(game.blueScore).padStart(2, "0");

		const isMyTurn = game.currentTurnPlayer === playerIdx;
		if (game.gameOver) {
			this.turnInfo.innerText = game.winnerPlayer === playerIdx ? "VICTORY!" : "GAME OVER";
			this.endTurnBtn.style.display = "none";
		} else {
			if (isMyTurn) {
				this.turnInfo.innerText = "Your turn - Pop bubbles!";
				this.turnInfo.style.color = "#4CD964";
				this.endTurnBtn.style.display = game.turnPoppedCount > 0 ? "block" : "none";
			} else {
				this.turnInfo.innerText = `Opponent's Turn...`;
				this.turnInfo.style.color = "#FF9500";
				this.endTurnBtn.style.display = "none";
			}
		}

		this.camera.update(WIDTH / 2, HEIGHT / 2, 1 / 60);
	}
}

/**
 * Interactive Tutorial Handler for local solo play mode.
 */
class TutorialData {
	private step = 0;

	constructor(private readonly game: GMPopit) {}

	frame(dt: number, clock: number) {
		if (this.game.gameOver) {
			return "Game Over! Click restart to play again.";
		}

		if (this.step === 0) {
			return "Pop 1 or more adjacent bubbles on the same row, then validate your turn!";
		}

		return "";
	}
}

/**
 * Builds data structure for Alpine.js client interface initialization.
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

		getSkinIconPath,

		getIconPath
	};
}

function getSkinTexturePath(id: string) {
	return `/assets/games/popit/skins/${id}/grid.png`;
}

function getIconPath(id: string) {
	return window.IMG_ROOT_PATH + `/assets/games/popit/skins/${id}/icon.png`
}

function getSkinIconPath(id: string) {
	return window.IMG_ROOT_PATH + `/assets/games/popit/skins/${id}/icon.png`;
}

/**
 * Main GameMode implementation for Popit.
 */
export class GMPopit extends GameMode {
	static readonly types = { Player };

	static readonly DATA = {
		WIDTH,
		HEIGHT,
		GRID_ROWS,
		GRID_COLS,
		BOARD_SIZE
	};

	readonly players: Player[];
	redScore = 0;
	blueScore = 0;

	// Grid state: true = ON (unpopped bubble), false = OFF (popped bubble)
	grid: boolean[] = new Array(TOTAL_CELLS).fill(true);

	// Turn control parameters
	currentTurnPlayer = 0;
	turnRow = -1; // -1 indicates no bubble has been popped yet in the current turn
	turnPoppedCols: number[] = []; // Tracks columns popped in current turn
	turnPoppedCount = 0;

	turnTimer = TURN_DURATION;
	globalTime = 300; // 5 minute overall game limit

	gameOver = false;
	loserPlayer = -1;
	winnerPlayer = -1;

	private constructor(total: number) {
		super();
		this.players = Array.from(
			{ length: Math.max(1, total) },
			() => new Player(WIDTH / 2, HEIGHT / 2)
		);
	}

	/**
	 * Server-side instantiation method.
	 */
	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();
		const game = new GMPopit(total);

		function decode(i: number) {
			if (i < players.length)
				return decodeFullMessage(StartData.decode(players[i].data));
			return generateClientDom([]);
		}

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

		for (const [i, p] of game.players.entries()) {
			const isRedTeam = assigned[i];
			p.initSpawn(WIDTH / 2, HEIGHT / 2, isRedTeam ? 'red' : 'blue');
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
	 * Client-side initialization method.
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
				if (game.players[idx]) {
					game.players[idx].initSpawn(p.x, p.y, p.isRed ? 'red' : 'blue');
				}
				clientData.skins.push(p.skin);
				skinSet.add(p.skin);
			}
			skins = Object.fromEntries(
				[...skinSet].map(key => ['skin-' + key, getSkinTexturePath(key)])
			);
		} else {
			const { skin } = decodeFullMessage(StartData.decode(data));
			if (game.players[0]) game.players[0].initSpawn(WIDTH / 2, HEIGHT / 2, 'red');
			if (game.players[1]) game.players[1].initSpawn(WIDTH / 2, HEIGHT / 2, 'blue');

			clientData.skins = Array.from(
				{ length: game.players.length },
				() => GMPopit.SKINS_IDS[0]
			);
			clientData.skins[0] = skin;
			skins = {};
		}

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins
		};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly SKINS = {
		'default': "Classic Rainbow",
		'pastel': "Pastel Pop",
		'neon': "Neon Cyber"
	};
	static readonly SKINS_IDS = Object.keys(GMPopit.SKINS);

	static readonly TEXTURES = {
		'popit-bg': "/assets/games/popit/board_bg.png",
		'bubble-texture': "/assets/games/popit/bubble.png",
		'skin-default': getSkinTexturePath('default')
	};

	override init(): void {
		this.grid.fill(true); // All 36 cells are active/unpopped initially
		this.currentTurnPlayer = 0;
		this.turnRow = -1;
		this.turnPoppedCols = [];
		this.turnPoppedCount = 0;
		this.turnTimer = TURN_DURATION;
		this.gameOver = false;
		this.loserPlayer = -1;
		this.winnerPlayer = -1;
	}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	/**
	 * Main game loop step function.
	 */
	override run(dt: number, produceFinish: boolean): FinishGame | null {
		if (this.gameOver) {
			if (produceFinish) {
				return this.produceFinish();
			}
			return null;
		}

		// Update global clock
		this.globalTime -= dt;

		// Handle turn countdown timer
		this.turnTimer -= dt;
		if (this.turnTimer <= 0) {
			this.handleTurnTimeout();
		}

		if (produceFinish && (this.gameOver || this.globalTime <= 0)) {
			return this.produceFinish();
		}

		return null;
	}

	/**
	 * Automatically pops a random valid bubble and forces turn end if player times out.
	 */
	private handleTurnTimeout() {
		if (this.turnPoppedCount === 0) {
			// Find first available unpopped bubble on the board
			let foundIdx = -1;
			for (let i = 0; i < TOTAL_CELLS; i++) {
				if (this.grid[i]) {
					foundIdx = i;
					break;
				}
			}

			if (foundIdx !== -1) {
				const r = Math.floor(foundIdx / GRID_COLS);
				const c = foundIdx % GRID_COLS;
				this.popBubble(r, c);
			}
		}
		this.advanceTurn();
	}

	/**
	 * Pops a bubble at (row, col) if move is valid according to game rules.
	 */
	private popBubble(row: number, col: number): boolean {
		const idx = row * GRID_COLS + col;

		// Cell must currently be unpopped (true)
		if (!this.grid[idx]) return false;

		// First pop in turn locks the row
		if (this.turnRow === -1) {
			this.turnRow = row;
		} else if (this.turnRow !== row) {
			return false; // Cannot pop bubbles on a different row during the same turn
		}

		// Subsequent pops must be adjacent to already popped bubbles in this turn
		if (this.turnPoppedCols.length > 0) {
			const minCol = Math.min(...this.turnPoppedCols);
			const maxCol = Math.max(...this.turnPoppedCols);
			const isAdjacent = (col === minCol - 1) || (col === maxCol + 1);
			if (!isAdjacent) return false;
		}

		// Execute bubble pop
		this.grid[idx] = false;
		this.turnPoppedCols.push(col);
		this.turnPoppedCount++;

		// Check if this was the last remaining bubble on the whole board
		const remainingCount = this.grid.filter(cell => cell).length;
		if (remainingCount === 0) {
			// The player who pops the last bubble loses!
			this.gameOver = true;
			this.loserPlayer = this.currentTurnPlayer;
			this.winnerPlayer = (this.currentTurnPlayer + 1) % this.players.length;

			// Update team scores
			if (this.players[this.winnerPlayer]?.team === 'red') {
				this.redScore++;
			} else {
				this.blueScore++;
			}
		}

		return true;
	}

	/**
	 * Validates and passes the turn to the next player.
	 */
	private advanceTurn() {
		if (this.gameOver) return;

		this.turnRow = -1;
		this.turnPoppedCols = [];
		this.turnPoppedCount = 0;
		this.turnTimer = TURN_DURATION;

		// Rotate to next connected player
		this.currentTurnPlayer = (this.currentTurnPlayer + 1) % this.players.length;
	}

	/**
	 * Processes network player inputs.
	 */
	override runInput(playerIdx: number, input: Fields): void {
		if (this.gameOver) return;
		if (playerIdx !== this.currentTurnPlayer) return; // Ignore inputs if not player's turn

		switch (input.action) {
			case 'popCell': {
				const r = input.popCell.row;
				const c = input.popCell.col;
				this.popBubble(r, c);
				break;
			}

			case 'endTurn': {
				// Player can only manually end turn if at least one bubble was popped
				if (this.turnPoppedCount > 0) {
					this.advanceTurn();
				}
				break;
			}
		}
	}

	/**
	 * Collects mouse/touch user inputs and formats input payload.
	 */
	override collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		const inputs: Fields[] = [];

		const mousePos = mouse.getCoords();
		data.mouseX = mousePos.x;
		data.mouseY = mousePos.y;

		// Check for left click press (0)
		if (mouse.first(0)) {
			// Convert canvas coordinates to grid indices
			if (
				mousePos.x >= BOARD_X &&
				mousePos.x <= BOARD_X + BOARD_SIZE &&
				mousePos.y >= BOARD_Y &&
				mousePos.y <= BOARD_Y + BOARD_SIZE
			) {
				const col = Math.floor((mousePos.x - BOARD_X) / CELL_SIZE);
				const row = Math.floor((mousePos.y - BOARD_Y) / CELL_SIZE);

				if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
					inputs.push({
						action: 'popCell',
						popCell: {
							row,
							col
						}
					});
				}
			}
		}

		// Handle End Turn button or mobile controller button
		if (keyboard.first('space') || data.validateTurn) {
			data.validateTurn = false;
			inputs.push({ action: 'endTurn', endTurn: {} });
		}

		return inputs;
	}

	/**
	 * Render routine for game state visualization.
	 */
	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = true;

		const imageLoader = _imageLoader.getFolder('popit');
		const data = _data as ClientData;

		if (data.firstFrame) {
			data.firstFrame = false;
			// Apply texture color variations for blue and red highlights
			imageLoader.setColorRule('bubble-texture', 0, [{ prev: "#ff0044", next: "#FF3B30" }]);
			imageLoader.setColorRule('bubble-texture', 1, [{ prev: "#ff0044", next: "#007AFF" }]);
		}

		data.update(this, playerIdx);

		// Background fill
		ctx.fillStyle = "#1E1E24";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		// Draw Popit silicone board base with rounded corners
		const boardRadius = 40;
		ctx.save();
		ctx.fillStyle = "#2A2A36";
		ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
		ctx.shadowBlur = 30;
		ctx.shadowOffsetY = 15;

		ctx.beginPath();
		ctx.roundRect(BOARD_X - 20, BOARD_Y - 20, BOARD_SIZE + 40, BOARD_SIZE + 40, boardRadius);
		ctx.fill();
		ctx.restore();

		// Render rows and bubbles
		for (let r = 0; r < GRID_ROWS; r++) {
			const rowColor = ROW_COLORS[r];
			const rowY = BOARD_Y + r * CELL_SIZE;

			// Draw row strip background
			ctx.fillStyle = rowColor.bg + "22"; // 13% opacity tint
			ctx.fillRect(BOARD_X, rowY, BOARD_SIZE, CELL_SIZE);

			for (let c = 0; c < GRID_COLS; c++) {
				const colX = BOARD_X + c * CELL_SIZE;
				const centerX = colX + CELL_SIZE / 2;
				const centerY = rowY + CELL_SIZE / 2;

				const cellIdx = r * GRID_COLS + c;
				const isUnpopped = this.grid[cellIdx];

				ctx.save();

				if (isUnpopped) {
					// --- UNPOPPED BUBBLE (ON) ---
					// Raised silicone bubble with a soft 3D appearance.

					const radius = BUBBLE_RADIUS;

					ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
					ctx.shadowBlur = 8;
					ctx.shadowOffsetY = 5;

					const gradient = ctx.createRadialGradient(
						centerX - radius * 0.35,
						centerY - radius * 0.4,
						radius * 0.1,
						centerX,
						centerY,
						radius
					);

					gradient.addColorStop(0, "#ffffff");
					gradient.addColorStop(0.18, rowColor.bg);
					gradient.addColorStop(0.75, rowColor.bg);
					gradient.addColorStop(1, rowColor.popped);

					ctx.beginPath();
					ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
					ctx.fillStyle = gradient;
					ctx.fill();

					ctx.shadowColor = "transparent";
					ctx.shadowBlur = 0;
					ctx.shadowOffsetY = 0;

					// Soft inner rim to emphasize the raised shape.
					ctx.beginPath();
					ctx.arc(centerX, centerY, radius * 0.88, 0, Math.PI * 2);
					ctx.lineWidth = 3;
					ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
					ctx.stroke();

					// Small soft highlight.
					const highlight = ctx.createRadialGradient(
						centerX - radius * 0.35,
						centerY - radius * 0.4,
						0,
						centerX - radius * 0.35,
						centerY - radius * 0.4,
						radius * 0.4
					);

					highlight.addColorStop(0, "rgba(255, 255, 255, 0.30)");
					highlight.addColorStop(1, "rgba(255, 255, 255, 0)");

					ctx.beginPath();
					ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
					ctx.fillStyle = highlight;
					ctx.fill();

					// Active turn glow.
					if (this.currentTurnPlayer === playerIdx && !this.gameOver) {
						if (this.turnRow === -1 || this.turnRow === r) {
							ctx.lineWidth = 4;
							ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
							ctx.stroke();
						}
					}
					
				} else {
					// --- POPPED BUBBLE (OFF) ---
					// Inset sunken hole effect
					ctx.beginPath();
					ctx.arc(centerX, centerY, BUBBLE_RADIUS * 0.85, 0, Math.PI * 2);
					ctx.fillStyle = rowColor.popped;
					ctx.fill();

					// Dark interior border
					ctx.lineWidth = 6;
					ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
					ctx.stroke();
				}

				ctx.restore();
			}
		}

		// Draw hovering cursor indicator over grid
		if (
			data.mouseX >= BOARD_X &&
			data.mouseX <= BOARD_X + BOARD_SIZE &&
			data.mouseY >= BOARD_Y &&
			data.mouseY <= BOARD_Y + BOARD_SIZE &&
			!this.gameOver
		) {
			const hoverCol = Math.floor((data.mouseX - BOARD_X) / CELL_SIZE);
			const hoverRow = Math.floor((data.mouseY - BOARD_Y) / CELL_SIZE);

			ctx.save();
			ctx.strokeStyle = "#FFFFFF";
			ctx.lineWidth = 4;
			ctx.strokeRect(
				BOARD_X + hoverCol * CELL_SIZE + 5,
				BOARD_Y + hoverRow * CELL_SIZE + 5,
				CELL_SIZE - 10,
				CELL_SIZE - 10
			);
			ctx.restore();
		}
	}

	override onDisconnection(id: number): void {
		if (this.players[id]) {
			this.players[id].connected = false;
		}
	}

	/**
	 * Serializes current state to Protobuf byte array.
	 */
	override save(): Uint8Array {
		const { State } = protocols.get();
		const object: Fields = {
			grid: this.grid,
			currentTurnPlayer: this.currentTurnPlayer,
			turnRow: this.turnRow,
			turnPoppedCols: this.turnPoppedCols,
			turnTimer: this.turnTimer,
			globalTime: this.globalTime,
			gameOver: this.gameOver,
			loserPlayer: this.loserPlayer,
			winnerPlayer: this.winnerPlayer,
			redScore: this.redScore,
			blueScore: this.blueScore,
			players: this.players.map(p => ({
				connected: p.connected,
				score: p.score,
				team: p.team
			}))
		};

		return State.encode(object).finish();
	}

	/**
	 * Deserializes Protobuf state payload into local game instance.
	 */
	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = State.decode(data);

		if (obj.grid && obj.grid.length === TOTAL_CELLS) {
			this.grid = Array.from(obj.grid);
		}
		this.currentTurnPlayer = obj.currentTurnPlayer ?? 0;
		this.turnRow = obj.turnRow ?? -1;
		this.turnPoppedCols = Array.from(obj.turnPoppedCols ?? []);
		this.turnPoppedCount = this.turnPoppedCols.length;
		this.turnTimer = obj.turnTimer ?? TURN_DURATION;
		this.globalTime = obj.globalTime ?? 300;
		this.gameOver = obj.gameOver ?? false;
		this.loserPlayer = obj.loserPlayer ?? -1;
		this.winnerPlayer = obj.winnerPlayer ?? -1;
		this.redScore = obj.redScore ?? 0;
		this.blueScore = obj.blueScore ?? 0;

		if (obj.players) {
			for (let i = 0; i < obj.players.length; i++) {
				if (this.players[i]) {
					this.players[i].load(obj.players[i]);
				}
			}
		}
	}

	override getSize() {
		return { width: WIDTH, height: HEIGHT };
	}

	/**
	 * Converts raw screen pixel coordinates into game world coordinates.
	 */
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

	/**
	 * Provides mobile controller button layout definitions.
	 */
	override getMobileDesc(): MobileDescriptor {
		return {
			joysticks: {},
			buttons: {
				'end_turn': {
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
	 * Produces final game ranking output structure.
	 */
	private produceFinish(): FinishGame {
		const ranking: number[][] = [];

		if (this.winnerPlayer !== -1 && this.loserPlayer !== -1) {
			ranking.push([this.winnerPlayer]);
			ranking.push([this.loserPlayer]);
		} else {
			// Fallback if tied or time expired without winner
			const allPlayerIndices = this.players.map((_, idx) => idx);
			ranking.push(allPlayerIndices);
		}

		return {
			results: ranking,
			teamEqualities: [],
			playerEqualities: this.winnerPlayer === -1 ? [0] : []
		};
	}
}
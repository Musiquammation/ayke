import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

const protocols = getProtocol('superTicTacToe', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

// --------------------------------------------------------------------------
// Board geometry constants.
//
// The whole super-grid is a 9x9 grid of cells, itself split into a 3x3 grid
// of sub-grids (each sub-grid being a regular 3x3 tic-tac-toe board).
// Cells are addressed with a single flat index in [0..80], row-major over
// the *whole* 9x9 grid: cell = globalY * 9 + globalX.
// Sub-grids are addressed with a flat index in [0..8], row-major over the
// 3x3 grid of sub-grids: subgridIndex = subgridY * 3 + subgridX.
// The "local index" of a cell (its position *inside* its own sub-grid) uses
// the same row-major convention on a 3x3 board: localIndex = localY * 3 + localX.
// --------------------------------------------------------------------------

const CELL_SIZE = 100; // size in pixels of a single cell when drawn
const SUBGRID_SIZE = CELL_SIZE * 3; // size in pixels of one 3x3 sub-grid
const BOARD_SIZE = SUBGRID_SIZE * 3; // size in pixels of the full 9x9 board
const BOARD_MARGIN = 60; // empty space around the board, used for UI text

const WIDTH = BOARD_SIZE + BOARD_MARGIN * 2;
const HEIGHT = BOARD_SIZE + BOARD_MARGIN * 2;

// The 8 winning alignments on any 3x3 grid (rows, columns, both diagonals).
// This same table is reused both to detect a win inside a single sub-grid
// (over its 9 cells) and to detect a win on the meta-grid (over the 9
// sub-grid results), since both are plain 3x3 boards.
const WIN_LINES: readonly [number, number, number][] = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
	[0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
	[0, 4, 8], [2, 4, 6]             // diagonals
];

// Plain in-memory representation of a Value protobuf message. Kept as a
// tiny interface (rather than reusing the protobuf class) so gameplay code
// never has to think about encoding while the match is being played out.
interface CellValue {
	taken: boolean;
	isRed: boolean;
}

function emptyCell(): CellValue {
	return { taken: false, isRed: false };
}

/**
 * Scans 9 same-shaped values (either the 9 cells of a sub-grid, or the 9
 * sub-grid results of the meta-grid) for a completed line of 3 matching
 * marks of the same color.
 * Returns 'red' or 'blue' if such a line exists, otherwise null.
 */
function findLineWinner(values: readonly CellValue[]): 'red' | 'blue' | null {
	for (const [a, b, c] of WIN_LINES) {
		if (
			values[a].taken && values[b].taken && values[c].taken &&
			values[a].isRed === values[b].isRed &&
			values[b].isRed === values[c].isRed
		) {
			return values[a].isRed ? 'red' : 'blue';
		}
	}
	return null;
}


class Player {
	// Whether this player is still connected to the game session. This is
	// purely informational client-side state that must be tracked here
	// (rather than in ClientData) because it needs to survive save/load and
	// be visible to other players, e.g. to show "opponent disconnected".
	connected = true;

	// The color/side this player is playing as. Super Tic Tac Toe is a
	// strict 1v1 game mode, so each of the two teams contains exactly one
	// player, identified directly by this field.
	team: 'red' | 'blue' = 'red';
}


class ClientData {
	firstFrame = true;

	mouseX = 0;
	mouseY = 0;

	readonly html: HTMLDivElement;
	readonly statusLine: HTMLDivElement;

	readonly you: HTMLDivElement;
	readonly opponent: HTMLDivElement;

	constructor(playerIdx: number) {
		this.html = document.createElement("div");
		this.html.classList.add("game-superTicTacToe-client-data");

		this.statusLine = document.createElement("div");
		this.statusLine.classList.add("game-superTicTacToe-status");

		this.you = document.createElement("div");
		this.you.classList.add(
			"game-superTicTacToe-you",
			playerIdx === 0
				? "game-superTicTacToe-red"
				: "game-superTicTacToe-blue"
		);
		this.you.innerText = "Your turn";

		this.opponent = document.createElement("div");
		this.opponent.classList.add(
			"game-superTicTacToe-opponent",
			playerIdx === 0
				? "game-superTicTacToe-blue"
				: "game-superTicTacToe-red"
		);
		this.opponent.innerText = "Opponent's turn";

		this.statusLine.appendChild(this.you);
		this.statusLine.appendChild(this.opponent);
		this.html.appendChild(this.statusLine);
	}

	/**
	 * Refreshes the DOM status line.
	 */
	update(game: GMSuperTicTacToe, playerIdx: number) {
		if (game.finished) {
			this.you.classList.add("game-superTicTacToe-disabled");
			this.opponent.classList.add("game-superTicTacToe-disabled");
			return;
		}

		const playerColor = playerIdx === 0 ? "red" : "blue";
		const isYourTurn = game.turn === playerColor;

		this.you.classList.toggle(
			"game-superTicTacToe-disabled",
			!isYourTurn
		);

		this.opponent.classList.toggle(
			"game-superTicTacToe-disabled",
			isYourTurn
		);
	}
}


class TutorialData {
	private shown = false;

	constructor(private readonly game: GMSuperTicTacToe) {}

	/**
	 * Super Tic Tac Toe only needs a single, static piece of guidance: the
	 * rule that determines which sub-grid you are sent to next. It is shown
	 * once at the start and then cleared.
	 */
	frame(dt: number, clock: number) {
		if (this.shown) return "";
		if (clock > 6) {
			this.shown = true;
			return "";
		}
		return "Playing a cell sends your opponent to the matching sub-grid!";
	}
}


function generateClientDom() {
	return {
		preferTeam: 0,

		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({
				preferTeam: this.preferTeam
			}).finish();
		}
	};
}


export class GMSuperTicTacToe extends GameMode {
	static readonly types = { Player };

	static readonly DATA = {
		WIDTH,
		HEIGHT,
		CELL_SIZE,
		SUBGRID_SIZE,
		BOARD_SIZE,
		BOARD_MARGIN
	};

	readonly players: Player[];

	// The 81 cells of the 9x9 super-grid, row-major (index = y*9+x).
	cells: CellValue[];

	// The result of each of the 9 sub-grids, row-major (index = y*3+x).
	// taken=false means "not won yet" (still open, or drawn -- see subgridFull).
	subgridWinners: CellValue[];

	// Parallel to subgridWinners: true once a sub-grid has no empty cells
	// left. A sub-grid that is full without ever being won is a permanent,
	// unplayable draw for that sub-grid.
	subgridFull: boolean[];

	// Whose turn it currently is.
	turn: 'red' | 'blue' = 'red';

	// Index (0-8) of the sub-grid the current player is forced to play in,
	// or -1 if they may choose any still-open sub-grid.
	forced = -1;

	// Set to true the instant the match outcome is decided (either by a
	// meta-grid alignment, or because every sub-grid has been resolved).
	finished = false;

	// Only meaningful once `finished` is true.
	winner: 'red' | 'blue' | 'draw' | null = null;

	private constructor(total: number) {
		super();

		this.players = Array.from({ length: total }, () => new Player());
		this.cells = Array.from({ length: 81 }, emptyCell);
		this.subgridWinners = Array.from({ length: 9 }, emptyCell);
		this.subgridFull = Array.from({ length: 9 }, () => false);
	}

	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();

		const game = new GMSuperTicTacToe(total);

		function decodePreference(i: number): number {
			if (i < players.length) {
				const decoded = decodeFullMessage(StartData.decode(players[i].data));
				return decoded.preferTeam ?? 0;
			}
			return 0;
		}

		const preferences = game.players.map((_, i) => decodePreference(i));

		// Super Tic Tac Toe is strictly 1v1: exactly one player ends up red,
		// the other ends up blue. We never need to balance more than two
		// players, unlike team games with variable team sizes.
		let redIndex = -1;
		let blueIndex = -1;

		// Phase 1: honor explicit, still-available preferences first.
		for (let i = 0; i < preferences.length; i++) {
			if (preferences[i] === 1 && redIndex < 0) {
				redIndex = i;
			} else if (preferences[i] === -1 && blueIndex < 0) {
				blueIndex = i;
			}
		}

		// Phase 2: fill whichever slot(s) are still free with the
		// remaining players, in connection order.
		for (let i = 0; i < preferences.length; i++) {
			if (i === redIndex || i === blueIndex) continue;
			if (redIndex < 0) {
				redIndex = i;
			} else if (blueIndex < 0) {
				blueIndex = i;
			}
		}

		for (const [i, p] of game.players.entries()) {
			p.team = (i === redIndex) ? 'red' : 'blue';
		}

		const data = StartDataClient.encode({
			players: game.players.map(p => ({ isRed: p.team === 'red' }))
		}).finish();

		return { game, data };
	}

	static createClient(data: Uint8Array | null, total: number, playerIdx: number) {
		const game = new GMSuperTicTacToe(total);
		const { StartDataClient } = protocols.get();
		const clientData = new ClientData(playerIdx);

		if (data) {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
			for (const [idx, p] of players.entries()) {
				game.players[idx].team = p.isRed ? 'red' : 'blue';
			}
		} else {
			// Fallback for previews/menus with no live server data.
			game.players[0].team = 'red';
			if (game.players[1]) game.players[1].team = 'blue';
		}

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: {} // no skins in this game mode: marks are drawn procedurally
		};
	}

	static readonly generateClientDom = generateClientDom;

	// No skin system for this game mode: X/O marks and the board are all
	// drawn procedurally with canvas primitives, so no textures are loaded.
	static readonly TEXTURES = {};

	override init(): void {
		// Nothing to set up beyond what the constructor already initializes:
		// the board starts empty, red plays first, and no sub-grid is forced.
	}

	override getBotIds(count: number): number[] {
		// Only one bot difficulty currently exists for this game mode.
		return Array.from({ length: count }, () => 0);
	}

	override run(dt: number, produceFinish: boolean): FinishGame | null {
		// Unlike time-limited games, Super Tic Tac Toe has no clock: the
		// match ends purely as a consequence of moves played inside
		// runInput(), which flips `finished` to true the instant the
		// outcome is decided. run() therefore only needs to hand the
		// finish payload back once it is requested.
		if (produceFinish && this.finished) {
			return this.produceFinish();
		}
		return null;
	}

	override runInput(playerIdx: number, input: Fields): void {
		// No moves are accepted once the match is over.
		if (this.finished) return;

		const player = this.players[playerIdx];

		// Only the player whose color matches the current turn may act;
		// this silently rejects out-of-turn inputs from the other side.
		if (player.team !== this.turn) return;

		if (input.action !== 'cell') return;

		const cell: number = input.cell;
		if (!Number.isInteger(cell) || cell < 0 || cell > 80) return;

		// Decompose the flat cell index into its global (x,y) position,
		// then into which sub-grid it belongs to and its local (x,y)
		// position inside that sub-grid.
		const globalX = cell % 9;
		const globalY = Math.floor(cell / 9);

		const subgridX = Math.floor(globalX / 3);
		const subgridY = Math.floor(globalY / 3);
		const subgridIndex = subgridY * 3 + subgridX;

		const localX = globalX % 3;
		const localY = globalY % 3;
		const localIndex = localY * 3 + localX;

		// The targeted sub-grid must still be playable.
		if (this.subgridWinners[subgridIndex].taken) return;
		if (this.subgridFull[subgridIndex]) return;

		// If a specific sub-grid is currently enforced, the move must land
		// inside it.
		if (this.forced >= 0 && subgridIndex !== this.forced) return;

		// The targeted cell itself must still be empty.
		const cellValue = this.cells[cell];
		if (cellValue.taken) return;

		// --- The move is legal: apply it. ---
		cellValue.taken = true;
		cellValue.isRed = (this.turn === 'red');

		this.settleSubgrid(subgridIndex);
		this.checkMetaWin();

		if (!this.finished) {
			// The sub-grid the opponent is sent to next is determined by
			// *where inside the current sub-grid* the mark was just placed.
			let nextForced = localIndex;
			if (this.subgridWinners[nextForced].taken || this.subgridFull[nextForced]) {
				// That sub-grid is already decided: the next player is free
				// to choose any open sub-grid instead.
				nextForced = -1;
			}
			this.forced = nextForced;

			// Hand the turn over to the other player.
			this.turn = (this.turn === 'red') ? 'blue' : 'red';

			// The board may also end simply because every sub-grid has now
			// been resolved (won or drawn), even without a meta alignment.
			this.checkAllSubgridsDecided();
		}
	}

	/**
	 * Re-evaluates a single sub-grid after a cell was just played inside
	 * it: checks for a 3-in-a-row win among its 9 cells, and otherwise
	 * marks it full once every one of its cells has been played.
	 */
	private settleSubgrid(subgridIndex: number): void {
		const subgridX = subgridIndex % 3;
		const subgridY = Math.floor(subgridIndex / 3);

		// Gather this sub-grid's 9 cells (in local row-major order) from
		// the flat 81-cell board.
		const subgridCells: CellValue[] = [];
		for (let ly = 0; ly < 3; ly++) {
			for (let lx = 0; lx < 3; lx++) {
				const gx = subgridX * 3 + lx;
				const gy = subgridY * 3 + ly;
				subgridCells.push(this.cells[gy * 9 + gx]);
			}
		}

		const winner = findLineWinner(subgridCells);
		if (winner !== null) {
			this.subgridWinners[subgridIndex] = { taken: true, isRed: winner === 'red' };
			return;
		}

		// No winner yet: check whether the sub-grid has simply run out of
		// empty cells, which makes it a permanent local draw.
		if (subgridCells.every(c => c.taken)) {
			this.subgridFull[subgridIndex] = true;
		}
	}

	/**
	 * Checks the meta-grid (the 3x3 grid of sub-grid results) for a
	 * completed alignment of 3 sub-grids won by the same team. If found,
	 * the whole match ends immediately in that team's favor.
	 */
	private checkMetaWin(): void {
		const winner = findLineWinner(this.subgridWinners);
		if (winner !== null) {
			this.finished = true;
			this.winner = winner;
		}
	}

	/**
	 * Checks whether every sub-grid has now been resolved (either won by a
	 * team or filled up without a winner). If so, the match ends and the
	 * winner is whichever team captured strictly more sub-grids -- a tie
	 * in sub-grid count ends the match in a draw.
	 */
	private checkAllSubgridsDecided(): void {
		const allDecided = this.subgridWinners.every((w, i) => w.taken || this.subgridFull[i]);
		if (!allDecided) return;

		const redCount = this.subgridWinners.filter(w => w.taken && w.isRed).length;
		const blueCount = this.subgridWinners.filter(w => w.taken && !w.isRed).length;

		this.finished = true;
		if (redCount === blueCount) {
			this.winner = 'draw';
		} else {
			this.winner = (redCount > blueCount) ? 'red' : 'blue';
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

		const coords = mouse.getCoords();
		data.mouseX = coords.x;
		data.mouseY = coords.y;

		// A single tap/click attempts to play the cell under the pointer.
		// Sending an out-of-bounds or currently-illegal cell is harmless:
		// the server independently re-validates every move and simply
		// ignores anything that isn't legal.
		if (mouse.first(0)) {
			const cell = GMSuperTicTacToe.cellFromBoardCoords(coords.x, coords.y);
			if (cell !== null) {
				inputs.push({ action: 'cell', cell });
			}
		} else if (mobile && mobile.first(0)) {
			const {x, y} = mobile.getDigits()[0];
			const cell = GMSuperTicTacToe.cellFromBoardCoords(x, y);
			if (cell !== null) {
				inputs.push({ action: 'cell', cell });
			}

		}

		return inputs;
	}

	/**
	 * Converts board-space pixel coordinates (already relative to the
	 * board's own coordinate system, see evalMouseCoords) into a flat cell
	 * index in [0..80], or null if the position falls outside the board.
	 */
	private static cellFromBoardCoords(x: number, y: number): number | null {
		const bx = x - BOARD_MARGIN;
		const by = y - BOARD_MARGIN;

		if (bx < 0 || by < 0 || bx >= BOARD_SIZE || by >= BOARD_SIZE) {
			return null;
		}

		const globalX = Math.floor(bx / CELL_SIZE);
		const globalY = Math.floor(by / CELL_SIZE);

		return globalY * 9 + globalX;
	}

	private drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, isRed: boolean) {
		const half = size * 0.32;
		ctx.lineWidth = size * 0.12;
		ctx.lineCap = "round";
		ctx.strokeStyle = isRed ? "#e63946" : "#3a86ff";

		if (isRed) {
			// Cross.
			ctx.beginPath();
			ctx.moveTo(cx - half, cy - half);
			ctx.lineTo(cx + half, cy + half);
			ctx.moveTo(cx + half, cy - half);
			ctx.lineTo(cx - half, cy + half);
			ctx.stroke();
		} else {
			// Circle.
			ctx.beginPath();
			ctx.arc(cx, cy, half, 0, Math.PI * 2);
			ctx.stroke();
		}
	}

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

		// Background.
		ctx.fillStyle = "#1e1e24";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		ctx.save();
		ctx.translate(BOARD_MARGIN, BOARD_MARGIN);

		// Board backdrop.
		ctx.fillStyle = "#f4f1ea";
		ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

		// Highlight every sub-grid the player-to-move is currently allowed
		// to play in, so both spectators and the acting player can see the
		// legal targets at a glance.
		for (let s = 0; s < 9; s++) {
			const playable = (
				!this.subgridWinners[s].taken && !this.subgridFull[s] &&
				(this.forced < 0 || this.forced === s)
			);

			if (!playable) {
				continue;
			}

			const sx = (s % 3) * SUBGRID_SIZE;
			const sy = Math.floor(s / 3) * SUBGRID_SIZE;
			ctx.fillStyle = this.turn === 'red' ? "#ffbaba" : "#bdd2ff";
			ctx.fillRect(sx, sy, SUBGRID_SIZE, SUBGRID_SIZE);
		}

		// Thin lines for every one of the 81 individual cells.
		ctx.strokeStyle = "#c9c3b6";
		ctx.lineWidth = 2;
		for (let i = 1; i < 9; i++) {
			ctx.beginPath();
			ctx.moveTo(i * CELL_SIZE, 0);
			ctx.lineTo(i * CELL_SIZE, BOARD_SIZE);
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo(0, i * CELL_SIZE);
			ctx.lineTo(BOARD_SIZE, i * CELL_SIZE);
			ctx.stroke();
		}

		// Thick lines to separate the 3 x 3 sub-grids.
		ctx.strokeStyle = "#3a3a3a";
		ctx.lineWidth = 6;
		for (let i = 1; i < 3; i++) {
			ctx.beginPath();
			ctx.moveTo(i * SUBGRID_SIZE, 0);
			ctx.lineTo(i * SUBGRID_SIZE, BOARD_SIZE);
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo(0, i * SUBGRID_SIZE);
			ctx.lineTo(BOARD_SIZE, i * SUBGRID_SIZE);
			ctx.stroke();
		}

		// Individual cell marks.
		for (let i = 0; i < 81; i++) {
			const cell = this.cells[i];
			if (!cell.taken) continue;

			const gx = i % 9;
			const gy = Math.floor(i / 9);
			const cx = gx * CELL_SIZE + CELL_SIZE / 2;
			const cy = gy * CELL_SIZE + CELL_SIZE / 2;

			this.drawMark(ctx, cx, cy, CELL_SIZE, cell.isRed);
		}

		// Large overlay marks/tints for sub-grids that have already been
		// decided, so their outcome reads clearly at a glance.
		for (let s = 0; s < 9; s++) {
			const sx = (s % 3) * SUBGRID_SIZE;
			const sy = Math.floor(s / 3) * SUBGRID_SIZE;

			if (this.subgridWinners[s].taken) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
				ctx.fillRect(sx, sy, SUBGRID_SIZE, SUBGRID_SIZE);

				this.drawMark(
					ctx,
					sx + SUBGRID_SIZE / 2,
					sy + SUBGRID_SIZE / 2,
					SUBGRID_SIZE,
					this.subgridWinners[s].isRed
				);

			} else if (this.subgridFull[s]) {
				ctx.fillStyle = "rgba(120, 120, 120, 0.35)";
				ctx.fillRect(sx, sy, SUBGRID_SIZE, SUBGRID_SIZE);
			}
		}

		// Hover highlight for the cell currently under the pointer, only
		// when it designates a legal move for whoever is about to play.
		const hovered = GMSuperTicTacToe.cellFromBoardCoords(data.mouseX, data.mouseY);
		if (hovered !== null && !this.finished) {
			const hgx = hovered % 9;
			const hgy = Math.floor(hovered / 9);
			ctx.strokeStyle = (this.turn === 'red') ? "#e63946" : "#3a86ff";
			ctx.lineWidth = 3;
			ctx.strokeRect(hgx * CELL_SIZE + 2, hgy * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
		}

		ctx.restore();
	}

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const { State } = protocols.get();
		const object: Fields = {
			cells: this.cells.map(c => ({ taken: c.taken, isRed: c.isRed })),
			subgridWinners: this.subgridWinners.map(w => ({ taken: w.taken, isRed: w.isRed })),
			subgridFull: this.subgridFull.slice(),
			redTurn: this.turn === 'red',
			forced: this.forced,
			finished: this.finished,
			draw: this.winner === 'draw',
			redWon: this.winner === 'red'
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = decodeFullMessage(State.decode(data));

		this.cells = obj.cells.map((c: any) => ({ taken: c.taken, isRed: c.isRed }));
		this.subgridWinners = obj.subgridWinners.map((w: any) => ({ taken: w.taken, isRed: w.isRed }));
		this.subgridFull = [...obj.subgridFull];
		this.turn = obj.redTurn ? 'red' : 'blue';
		this.forced = obj.forced;
		this.finished = obj.finished;

		if (!obj.finished) {
			this.winner = null;
		} else if (obj.draw) {
			this.winner = 'draw';
		} else {
			this.winner = obj.redWon ? 'red' : 'blue';
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
		// The board never scrolls and there is no camera to account for:
		// screen-space coordinates already double as board-space
		// coordinates, so this is a direct pass-through. We still record
		// them on ClientData so draw() can render the hover highlight.
		const clientData = _clientData as ClientData;
		clientData.mouseX = x;
		clientData.mouseY = y;

		return { x, y };
	}

	override getMobileDesc(): MobileDescriptor {
		// Playing a cell is a single tap on the board itself; no virtual
		// joysticks or buttons are needed for this game mode.
		return {
			joysticks: {},
			buttons: {}
		};
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	/**
	 * Builds the FinishGame payload once the match is over. Each team
	 * contains exactly one player (this is a strict 1v1 game mode), so
	 * `results` always holds two single-player teams and `playerEqualities`
	 * is always empty -- there can never be an intra-team tie with only one
	 * player per team.
	 */
	private produceFinish(): FinishGame {
		const redPlayerIdx = this.players.findIndex(p => p.team === 'red');
		const bluePlayerIdx = this.players.findIndex(p => p.team === 'blue');

		let results: number[][];
		let teamEqualities: number[] = [];

		if (this.winner === 'red') {
			results = [[redPlayerIdx], [bluePlayerIdx]];
		} else if (this.winner === 'blue') {
			results = [[bluePlayerIdx], [redPlayerIdx]];
		} else {
			// Draw: both teams tie for first place. The order of the two
			// entries in `results` is arbitrary in this case, since
			// teamEqualities marks them as equal regardless.
			results = [[redPlayerIdx], [bluePlayerIdx]];
			teamEqualities = [0];
		}

		return {
			results,
			teamEqualities,
			playerEqualities: []
		};
	}
}
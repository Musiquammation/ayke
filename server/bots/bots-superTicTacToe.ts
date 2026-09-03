import { Fields } from "../../commons/Fields";
import { GMSuperTicTacToe } from "../../commons/gamemods/GMSuperTicTacToe";
import { appendBots, botActionNodeHelper } from "../Bot";
import { getLogger } from "../Logger";

// Initialize dedicated debug logger for Super Tic-Tac-Toe bot execution
const logger = getLogger('bots-superTicTacToe');
logger.setLevel('debug');

/**
 * Persistent bot state maintained across frame runner calls.
 * Used primarily to throttle inputs and prevent spamming the game runner.
 */
interface Data {
	/** Tracks the active team turn from the last processed frame */
	lastProcessedTurn: 'red' | 'blue' | null;
	/** Flag indicating if an input payload was already emitted for the current turn */
	hasPlayedThisTurn: boolean;
	/** Total number of moves executed by this bot instance */
	moveCount: number;
}

/**
 * Factory constructing the initial clean state container for a new match.
 */
function dataConstructor(): Data {
	return {
		lastProcessedTurn: null,
		hasPlayedThisTurn: false,
		moveCount: 0
	};
}

// --------------------------------------------------------------------------
// Geometry and Helper Definitions
// --------------------------------------------------------------------------

/** The 8 winning 3-in-a-row alignments on any standard 3x3 board */
const WIN_LINES: readonly [number, number, number][] = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
	[0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
	[0, 4, 8], [2, 4, 6]              // Diagonals
];

interface CellValue {
	taken: boolean;
	isRed: boolean;
}

/**
 * Evaluates a 9-element array representing a 3x3 grid for a 3-in-a-row victory.
 *
 * @param values Array of 9 cell values (taken status & team color)
 * @returns 'red' | 'blue' if a line is completed, otherwise null
 */
function evaluateLineWinner(values: readonly CellValue[]): 'red' | 'blue' | null {
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

/**
 * Decomposes a global cell index [0..80] into sub-grid and local grid coordinates.
 *
 * @param cell Global index in row-major order (y * 9 + x)
 */
function decomposeCellIndex(cell: number) {
	const globalX = cell % 9;
	const globalY = Math.floor(cell / 9);

	const subgridX = Math.floor(globalX / 3);
	const subgridY = Math.floor(globalY / 3);
	const subgridIndex = subgridY * 3 + subgridX;

	const localX = globalX % 3;
	const localY = globalY % 3;
	const localIndex = localY * 3 + localX;

	return { globalX, globalY, subgridX, subgridY, subgridIndex, localX, localY, localIndex };
}

/**
 * Retrieves all 9 global cell indices belonging to a specific sub-grid (0..8).
 */
function getSubgridGlobalIndices(subgridIndex: number): number[] {
	const subgridX = subgridIndex % 3;
	const subgridY = Math.floor(subgridIndex / 3);
	const indices: number[] = [];

	for (let ly = 0; ly < 3; ly++) {
		for (let lx = 0; lx < 3; lx++) {
			const gx = subgridX * 3 + lx;
			const gy = subgridY * 3 + ly;
			indices.push(gy * 9 + gx);
		}
	}
	return indices;
}

// --------------------------------------------------------------------------
// Strategic Evaluation Engine
// --------------------------------------------------------------------------

/**
 * Calculates a comprehensive heuristic score for playing a given cell index.
 * Higher scores represent more favorable outcomes for the bot.
 *
 * @param game The current game mode instance
 * @param cell Global cell index being evaluated [0..80]
 * @param myTeam The bot's assigned team ('red' or 'blue')
 * @returns Numerical heuristic score
 */
function scoreMove(game: GMSuperTicTacToe, cell: number, myTeam: 'red' | 'blue'): number {
	const isRed = (myTeam === 'red');
	const oppTeam: 'red' | 'blue' = isRed ? 'blue' : 'red';
	const { subgridIndex, localIndex } = decomposeCellIndex(cell);

	let score = 0;

	// Extract current 9 cell states of the target sub-grid
	const subgridCells = getSubgridGlobalIndices(subgridIndex).map(i => ({ ...game.cells[i] }));
	const subgridLocalCellIdx = localIndex;

	// ----------------------------------------------------------------------
	// 1. Tactical Evaluation inside the Current Sub-Grid
	// ----------------------------------------------------------------------

	// Test if placing our mark here wins the local sub-grid
	subgridCells[subgridLocalCellIdx] = { taken: true, isRed };
	const winsSubgrid = evaluateLineWinner(subgridCells) === myTeam;

	// Test if opponent taking this cell on their turn wins the local sub-grid
	subgridCells[subgridLocalCellIdx] = { taken: true, isRed: !isRed };
	const blocksOpponentSubgridWin = evaluateLineWinner(subgridCells) === oppTeam;

	// Reset simulated cell
	subgridCells[subgridLocalCellIdx] = { taken: false, isRed: false };

	// ----------------------------------------------------------------------
	// 2. Meta-Grid Victory Evaluation
	// ----------------------------------------------------------------------

	if (winsSubgrid) {
		score += 5000;
		logger.debug(`[Cell ${cell}] Move completes local victory in Sub-grid #${subgridIndex}`);

		// Simulate updating subgridWinners with our win and check for game victory
		const simulatedMeta = game.subgridWinners.map(w => ({ ...w }));
		simulatedMeta[subgridIndex] = { taken: true, isRed };

		if (evaluateLineWinner(simulatedMeta) === myTeam) {
			score += 100000;
			logger.debug(`[Cell ${cell}] CRITICAL: Move completes META-GRID VICTORY!`);
			return score; // Immediate maximum priority
		}
	}

	if (blocksOpponentSubgridWin) {
		score += 2000;
		logger.debug(`[Cell ${cell}] Move blocks opponent from winning Sub-grid #${subgridIndex}`);

		// Check if opponent winning this sub-grid would have won them the meta-grid
		const simulatedMeta = game.subgridWinners.map(w => ({ ...w }));
		simulatedMeta[subgridIndex] = { taken: true, isRed: !isRed };

		if (evaluateLineWinner(simulatedMeta) === oppTeam) {
			score += 50000;
			logger.debug(`[Cell ${cell}] CRITICAL: Move blocks OPPONENT META-GRID VICTORY!`);
		}
	}

	// ----------------------------------------------------------------------
	// 3. Opponent Redirection Evaluation (Next Forced Sub-Grid)
	// ----------------------------------------------------------------------
	// The local cell index played dictates which sub-grid the opponent is forced into next.
	const nextForcedSubgrid = localIndex;
	const isNextSubgridDecided = game.subgridWinners[nextForcedSubgrid].taken || game.subgridFull[nextForcedSubgrid];

	if (isNextSubgridDecided) {
		// Sending opponent to a finished board grants them a FREE CHOICE (-1) across any board!
		score -= 1500;
		logger.debug(`[Cell ${cell}] Penalty: Gives opponent free choice (Sub-grid #${nextForcedSubgrid} finished)`);
	} else {
		// Analyze opponent's tactical options in the sub-grid we send them to
		const nextSubgridGlobalIndices = getSubgridGlobalIndices(nextForcedSubgrid);
		let oppCanWinNextSubgrid = false;
		let oppCanWinMetaInNextSubgrid = false;

		for (const targetCell of nextSubgridGlobalIndices) {
			if (game.cells[targetCell].taken) continue;

			const targetLocalIdx = decomposeCellIndex(targetCell).localIndex;
			const nextSubgridCells = nextSubgridGlobalIndices.map(i => ({ ...game.cells[i] }));
			nextSubgridCells[targetLocalIdx] = { taken: true, isRed: !isRed };

			if (evaluateLineWinner(nextSubgridCells) === oppTeam) {
				oppCanWinNextSubgrid = true;

				const simMeta = game.subgridWinners.map(w => ({ ...w }));
				simMeta[nextForcedSubgrid] = { taken: true, isRed: !isRed };
				if (evaluateLineWinner(simMeta) === oppTeam) {
					oppCanWinMetaInNextSubgrid = true;
					break;
				}
			}
		}

		if (oppCanWinMetaInNextSubgrid) {
			score -= 50000;
			logger.debug(`[Cell ${cell}] SEVERE PENALTY: Sends opponent directly to META WIN in Sub-grid #${nextForcedSubgrid}`);
		} else if (oppCanWinNextSubgrid) {
			score -= 3000;
			logger.debug(`[Cell ${cell}] Penalty: Sends opponent to sub-grid win in Sub-grid #${nextForcedSubgrid}`);
		}
	}

	// ----------------------------------------------------------------------
	// 4. Positional Weighting & Sub-Grid Importance
	// ----------------------------------------------------------------------

	// Prefer center cell inside a sub-grid (local index 4)
	if (localIndex === 4) {
		score += 100;
	} else if ([0, 2, 6, 8].includes(localIndex)) {
		score += 50; // Corner cells
	} else {
		score += 10;  // Edge cells
	}

	// Apply center sub-grid multiplier (Sub-grid 4 controls most meta-lines)
	if (subgridIndex === 4) {
		score += 150;
	} else if ([0, 2, 6, 8].includes(subgridIndex)) {
		score += 75;  // Corner sub-grids
	}

	return score;
}

// --------------------------------------------------------------------------
// Bot Execution Runner Routine
// --------------------------------------------------------------------------

const {all, first, loop, runner} = botActionNodeHelper<GMSuperTicTacToe, Data>();

/**
 * Main per-frame tick function called by the game runner engine.
 */
const frame = runner((game: GMSuperTicTacToe, data: Data, playerIdx: number) => {
	const inputs: Fields[] = [];

	// Stop evaluation if the match has already ended
	if (game.finished) {
		logger.debug(`Match complete. Winner: ${game.winner}`);
		return [inputs, 'success'];
	}

	const botPlayer = game.players[playerIdx];
	const myTeam = botPlayer.team;

	// Reset turn tracking state when active turn shifts to another player
	if (game.turn !== myTeam) {
		if (data.lastProcessedTurn === myTeam) {
			logger.debug(`Turn transitioned from ${myTeam} to ${game.turn}. Resetting input state.`);
		}
		data.hasPlayedThisTurn = false;
		data.lastProcessedTurn = game.turn;
		return [inputs, 'success'];
	}

	// Throttle inputs: prevent duplicate move dispatches during the same turn frame sequence
	if (data.hasPlayedThisTurn && data.lastProcessedTurn === myTeam) {
		return [inputs, 'success'];
	}

	logger.debug(`=== Bot Turn Started (${myTeam.toUpperCase()}) | Forced Sub-grid: ${game.forced} ===`);

	// ----------------------------------------------------------------------
	// Collect All Currently Legal Moves
	// ----------------------------------------------------------------------
	const legalCells: number[] = [];

	for (let i = 0; i < 81; i++) {
		// Cell must be empty
		if (game.cells[i].taken) continue;

		const { subgridIndex } = decomposeCellIndex(i);

		// Target sub-grid must not be won or completely filled
		if (game.subgridWinners[subgridIndex].taken || game.subgridFull[subgridIndex]) continue;

		// Respect the forced sub-grid constraint if enforced
		if (game.forced >= 0 && subgridIndex !== game.forced) continue;

		legalCells.push(i);
	}

	logger.debug(`Found ${legalCells.length} legal moves available.`);

	if (legalCells.length === 0) {
		logger.warning("No legal moves available despite turn active!");
		return [inputs, 'success'];
	}

	// ----------------------------------------------------------------------
	// Heuristic Evaluation & Move Selection
	// ----------------------------------------------------------------------
	let bestCell = legalCells[0];
	let maxScore = -Infinity;

	for (const cell of legalCells) {
		const score = scoreMove(game, cell, myTeam);
		logger.debug(`Evaluated Cell #${cell} -> Score: ${score}`);

		if (score > maxScore) {
			maxScore = score;
			bestCell = cell;
		}
	}

	const { subgridIndex, localIndex } = decomposeCellIndex(bestCell);
	logger.debug(`---> BEST MOVE SELECTED: Cell #${bestCell} (Sub-grid #${subgridIndex}, Local #${localIndex}) with score: ${maxScore}`);

	// ----------------------------------------------------------------------
	// Dispatch Action & Update Data State
	// ----------------------------------------------------------------------
	inputs.push({ action: 'cell', cell: bestCell });

	data.hasPlayedThisTurn = true;
	data.lastProcessedTurn = myTeam;
	data.moveCount++;

	logger.debug(`Dispatched move #${data.moveCount}. Waiting for server/engine state advance.`);

	return [inputs, 'success'];
});





const root = (function() {
	return all([frame]);
})();

appendBots('superTicTacToe', [
	{root, data: dataConstructor}
]);


logger.info("Bot loaded!");

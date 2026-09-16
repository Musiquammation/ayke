import { Fields } from "../../commons/Fields";
import { GMPopit } from "../../commons/gamemods/GMPopit";
import { botActionNodeHelper, describeBot } from "../Bot";
import { getLogger } from "../ILogger";

const logger = getLogger('bots-popit');

// Initialize bot node helpers for the Popit game mode
const { all, first, loop, runner } = botActionNodeHelper<GMPopit, Data>();

/**
 * Data class to hold the internal state of the bot.
 * We need to track the cooldown between actions and the sequence of moves planned.
 */
class Data {
	// Tracks the last time an action was executed (used for the 0.4s cooldown)
	lastActionTime: number = 0;
	
	// Stores the sequence of contiguous cells the bot intends to pop this turn
	plannedMoves: { row: number, col: number }[] = [];
	
	// Indicates if the bot is currently in the middle of executing its turn
	isTurnActive: boolean = false;
}

function dataConstructor(): Data {
	return new Data();
}

/**
 * Helper Method: Checks if it is currently this bot's turn to play.
 * It also ensures the game is not already over.
 */
function isOurTurn(game: GMPopit, playerIdx: number): boolean {
	return game.currentTurnPlayer === playerIdx && !game.gameOver;
}

/**
 * Helper Method: Enforces a 0.4 seconds (400ms) cooldown between any game actions.
 * This simulates a human reaction time and fulfills the 0.4s cooldown skill requirement.
 */
function isCooldownReady(data: Data): boolean {
	return Date.now() - data.lastActionTime >= 400;
}

/**
 * Helper Method: Scans the grid and returns all unpopped cells, grouped by their row index.
 */
function getAvailableCellsByRow(game: GMPopit): number[][] {
	const rows: number[][] = [];
	const maxRows = GMPopit.DATA.GRID_ROWS;
	const maxCols = GMPopit.DATA.GRID_COLS;

	for (let r = 0; r < maxRows; r++) {
		const cols: number[] = [];
		for (let c = 0; c < maxCols; c++) {
			const idx = r * maxCols + c;
			// The grid array stores 'true' for unpopped bubbles
			if (game.grid[idx]) {
				cols.push(c);
			}
		}
		if (cols.length > 0) {
			rows[r] = cols;
		}
	}
	
	return rows;
}

/**
 * Helper Method: Resets the bot's state. Called when the turn is passed to the opponent.
 */
function resetTurnState(data: Data) {
	data.plannedMoves = [];
	data.isTurnActive = false;
}

/**
 * Helper Method: Analyzes the board and plans a valid move.
 * A valid move consists of popping one or multiple contiguous bubbles on a single row.
 */
function planTurn(game: GMPopit, data: Data) {
	const rows = getAvailableCellsByRow(game);
	
	// Filter out empty rows to only consider rows with available bubbles
	const validRowIndices = rows.map((cols, idx) => cols !== undefined ? idx : -1).filter(idx => idx !== -1);
	
	if (validRowIndices.length === 0) return;

	// 1. Pick a random row that has unpopped bubbles
	const randomRowIndex = validRowIndices[Math.floor(Math.random() * validRowIndices.length)];
	const availableCols = rows[randomRowIndex];

	// 2. Break the available bubbles in this row into contiguous segments
	const segments: number[][] = [];
	let currentSegment: number[] = [availableCols[0]];
	
	for (let i = 1; i < availableCols.length; i++) {
		// If the current bubble is strictly adjacent to the previous one
		if (availableCols[i] === availableCols[i - 1] + 1) {
			currentSegment.push(availableCols[i]);
		} else {
			// Gap detected, finalize the previous segment and start a new one
			segments.push(currentSegment);
			currentSegment = [availableCols[i]];
		}
	}
	segments.push(currentSegment); // Push the last segment

	// 3. Pick a random contiguous segment
	const randomSegment = segments[Math.floor(Math.random() * segments.length)];
	
	// 4. Decide randomly how many bubbles to pop from this segment (at least 1)
	const startIdx = Math.floor(Math.random() * randomSegment.length);
	const maxLen = randomSegment.length - startIdx;
	const lengthToPop = Math.floor(Math.random() * maxLen) + 1;
	
	const colsToPop = randomSegment.slice(startIdx, startIdx + lengthToPop);

	// 5. Store these intended moves in the bot data state
	data.plannedMoves = colsToPop.map(col => ({ row: randomRowIndex, col }));
	data.isTurnActive = true;
}

/**
 * Main behavior runner for the bot.
 * Evaluates the game state on each tick and issues inputs (popCell or endTurn).
 */
const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];

	// If it's not our turn, we have nothing to do. Ensure state is clean.
	if (!isOurTurn(game, playerIdx)) {
		resetTurnState(data);
		return [inputs, 'success'];
	}

	// Wait until the 0.4s cooldown has expired before doing anything.
	if (!isCooldownReady(data)) {
		return [inputs, 'success'];
	}

	// If we just got the turn and haven't planned what to do, plan the turn.
	if (!data.isTurnActive) {
		planTurn(game, data);
	}

	// If we have remaining bubbles to pop in our planned sequence, pop the next one.
	if (data.plannedMoves.length > 0) {
		const move = data.plannedMoves.shift()!; // Take the first move from the queue
		
		// Push the formatted input to the game engine
		inputs.push({ 
			action: 'popCell', 
			popCell: { row: move.row, col: move.col } 
		});
		
		// Reset the cooldown timer
		data.lastActionTime = Date.now();
		
		return [inputs, 'success'];
	}

	// Once all planned bubbles are popped, we must explicitly end our turn.
	if (data.isTurnActive && data.plannedMoves.length === 0) {
		inputs.push({ 
			action: 'endTurn', 
			endTurn: {} 
		});
		
		data.lastActionTime = Date.now();
		data.isTurnActive = false; // Turn is locally finished
		
		return [inputs, 'success'];
	}

	return [inputs, 'success'];
});

// Construct the root behavior tree
const root = (function() {
	return all([method]);
})();

// Export the bot description for the game engine
export default describeBot(
	[{ root, data: dataConstructor }]
);
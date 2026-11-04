import { Fields } from "../Fields";
import { botActionNodeHelper, describeBot } from "../Bot";
import { GMJumpies } from "../gamemods/GMJumpies";
import { LEVEL_TIME_LIMIT } from "../gamemods/jumpies/constants";
import { getFinishField } from "./jumpies/FlowField";
import { Plan, Planner, SEGMENT_TIME } from "./jumpies/Planner";
import { SIM_DT, Simulation } from "./jumpies/Simulation";

/*
 * Bots of Jumpies.
 *
 * The bot works on two levels:
 * - global navigation (FlowField): a Dijkstra on a grid of the level, run once
 *   per level from the finish block, tells how far every point is from the end,
 *   going around lava and deadly borders, and knowing that climbing costs jumps.
 *   A second kind of field leads to the heal blocks, for the hurt bots;
 * - local control (Planner + Simulation): every SEGMENT_TIME, the bot simulates
 *   about a hundred short policies (directions and jump reflexes) with the real
 *   physics of the player, and keeps the one that brings it closest to its goal
 *   while staying alive and keeping its jumps and hit points.
 * The bot then plays the beginning of the winning rollout, and decides again.
 */

const { all, runner } = botActionNodeHelper<GMJumpies, Data>();

// A bot decides a bit after each segment boundary, to stay ahead of the plan.
const DECISION_JITTER = 0.02;

const INPUTS = {
	move: (move: number): Fields => ({ action: 'move', move }),
	fall: (fall: boolean): Fields => ({ action: 'fall', fall }),
	jump: (): Fields => ({ action: 'jump', jump: {} })
};


class Data {
	simulation: Simulation | null = null;
	planner: Planner | null = null;

	/** The plan being played, and the game time of its first segment. */
	plan: Plan | null = null;
	planStart = 0;
	/** Last step of the plan whose jump was sent, to send each jump once. */
	jumpedStep = -1;
	/** Room of the bot at the last decision: a change requires a new decision. */
	lastRoom = -1;
	/** Delay added to the decisions of this bot, so that bots do not all think on the same frame. */
	jitter = Math.random() * DECISION_JITTER;

	// Personality, see Planner
	progressWeight = 0.9 + Math.random() * 0.2;
	caution = 0.85 + Math.random() * 0.3;
}

function dataConstructor(): Data {
	return new Data();
}


/** Game time elapsed since the start of the level, in seconds. */
function getElapsed(game: GMJumpies) {
	return LEVEL_TIME_LIMIT - game.time;
}

/** Creates the simulation and the planner the first time the bot plays. */
function ensurePlanner(game: GMJumpies, data: Data, playerIdx: number) {
	if (data.planner)
		return data.planner;

	data.simulation = new Simulation(playerIdx);
	data.planner = new Planner(data.simulation, getFinishField(game.level), {
		progressWeight: data.progressWeight,
		caution: data.caution,
		random: Math.random
	});

	return data.planner;
}

/** Forgets the plan, for example when the bot dies. */
function dropPlan(data: Data) {
	data.plan = null;
	data.jumpedStep = -1;
	data.planner?.reset();
}

/** Index of the segment of the current plan which should be playing now. */
function getCurrentSegment(data: Data, elapsed: number) {
	return Math.floor((elapsed - data.planStart) / SEGMENT_TIME + 1e-6);
}

/** Tells whether the bot must take a new decision. */
function needsDecision(game: GMJumpies, data: Data, playerIdx: number, elapsed: number) {
	if (!data.plan)
		return true;

	// The server can restore an older state of the game after running the bots
	// on a prediction: the time then goes back, and the plan is outdated.
	if (elapsed < data.planStart)
		return true;

	const player = game.players[playerIdx];
	if (player.room !== data.lastRoom)
		return true;

	return elapsed - data.planStart >= SEGMENT_TIME + data.jitter;
}

/** Runs the planner and installs the new plan, starting now. */
function decide(game: GMJumpies, data: Data, playerIdx: number, elapsed: number) {
	const planner = ensurePlanner(game, data, playerIdx);
	const shift = data.plan ? Math.max(0, getCurrentSegment(data, elapsed)) : 0;
	data.plan = planner.decide(game, playerIdx, shift, elapsed);
	data.planStart = elapsed;
	data.jumpedStep = -1;
	data.lastRoom = game.players[playerIdx].room;
}

/** Sends the inputs which make the player follow the current segment of the plan. */
function followPlan(game: GMJumpies, data: Data, playerIdx: number, elapsed: number) {
	const inputs: Fields[] = [];
	const plan = data.plan!;
	const player = game.players[playerIdx];
	const segment = Math.min(plan.dirs.length - 1, getCurrentSegment(data, elapsed));
	const dir = plan.dirs[segment];
	const fall = plan.falls[segment];

	if (player.dirX !== dir) {
		inputs.push(INPUTS.move(dir));
	}

	if (player.fastFall !== fall) {
		inputs.push(INPUTS.fall(fall));
	}

	// Sends the jumps of the steps reached since the previous call.
	const step = Math.min(
		plan.jumpSteps.length - 1,
		Math.floor((elapsed - data.planStart) / SIM_DT + 1e-6)
	);

	let jump = false;
	for (let i = data.jumpedStep + 1; i <= step; i++) {
		jump ||= plan.jumpSteps[i];
	}

	data.jumpedStep = Math.max(data.jumpedStep, step);
	if (jump) {
		inputs.push(INPUTS.jump());
	}

	return inputs;
}

/** Releases every input, for a dead or arrived bot. */
function releaseInputs(game: GMJumpies, playerIdx: number) {
	const inputs: Fields[] = [];
	const player = game.players[playerIdx];
	if (player.dirX !== 0) {
		inputs.push(INPUTS.move(0));
	}

	if (player.fastFall) {
		inputs.push(INPUTS.fall(false));
	}

	return inputs;
}


/** Plays the bot for one frame. */
const method = runner((game, data, playerIdx) => {
	const player = game.players[playerIdx];
	if (!player.isInGame()) {
		dropPlan(data);
		return [releaseInputs(game, playerIdx), 'success'];
	}

	const elapsed = getElapsed(game);
	if (needsDecision(game, data, playerIdx, elapsed)) {
		decide(game, data, playerIdx, elapsed);
	}

	return [followPlan(game, data, playerIdx, elapsed), 'success'];
});


const root = (function () {
	return all([method]);
})();

export default describeBot([{ root, data: dataConstructor }]);

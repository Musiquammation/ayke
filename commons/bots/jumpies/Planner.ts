import type { GMJumpies } from "../../gamemods/GMJumpies";
import { GRAVITY, JUMP_COUNT, JUMP_HP_COST, PLAYER_HP } from "../../gamemods/jumpies/constants";
import type { Player } from "../../gamemods/jumpies/Player";
import { HealUnitsTracker } from "../../gamemods/jumpies/trackers";
import { FlowField, getHealField, isHealGoal, UNREACHABLE } from "./FlowField";
import { SIM_DT, SimOutcome, Simulation } from "./Simulation";

/*
 * Local planner of the Jumpies bots: a model predictive control by sampling.
 *
 * At each decision, the planner simulates about a hundred candidate policies
 * for the next SEGMENT_COUNT * SEGMENT_TIME seconds, scores where each of them
 * leads, and keeps the best.
 * Only the beginning of the winner is really played: a new decision is taken
 * at the next segment, starting from the previous winner (warm start) so that a
 * good idea found earlier is refined instead of being forgotten.
 *
 * A policy is made of:
 * - a direction (and a fast fall flag) for each segment of SEGMENT_TIME;
 * - explicit jumps, at the start of some segments;
 * - jump reflexes, evaluated at every simulation step on the simulated player:
 *   - floor reflex: jump when falling with less than `floor` px of room below,
 *     which keeps the player alive at a chosen height above a deadly border;
 *   - speed reflex: jump as soon as the vertical speed reaches `speed`.
 *     With 0, the player jumps at the top of each jump (fastest climb); with
 *     JUMP_VELOCITY, they fall back to the height of the previous jump (hover).
 * Reflexes solve the timing of the jumps, which random explicit jumps would
 * rarely find. The rollout of the winner is recorded step by step, and this
 * record is what the bot really plays.
 */

export const SEGMENT_TIME = 0.1;
export const SEGMENT_COUNT = 12; // the plans look 1.2s ahead
export const SEGMENT_STEPS = Math.round(SEGMENT_TIME / SIM_DT);
export const PLAN_STEPS = SEGMENT_STEPS * SEGMENT_COUNT;

// Reflexes
const REFLEX_GAP = Math.round(0.2 / SIM_DT); // steps between two reflex jumps
const FLOOR_LOOKAHEAD = 2 * SIM_DT; // the floor reflex anticipates the fall a little, for the delay of the real inputs
const NO_FLOOR = 0;
const NO_SPEED = Infinity;
const FLOOR_VALUES = [30, 100, 200, 350, 550];
const SPEED_VALUES = [0, 500, 1000, 1500];

// Sampling
const TURN_SEGMENTS = [2, 4, 7]; // segments where the turning patterns change their direction
const TURN_GROUPS = 3; // the turning patterns are tried in turns, a group per decision
const MUTATION_COUNT = 12;
const RANDOM_COUNT = 6;

// Scores. The unit is the one of the flow field: about one pixel of progress.
const FINISH_SCORE = 1e6;
const DEATH_SCORE = 1e5;
const LATE_DEATH_BONUS = 2e4; // per second survived, among plans which all die
const HP_VALUE = 1400;
const JUMP_VALUES = [450, 320, 220]; // value of the last, second last and third last jump
const EXTRA_JUMP_VALUE = 40; // jumps above JUMP_COUNT, given by some bounces
const MAX_EXTRA_JUMPS = 30;
const DOOM_PENALTY = 9000; // the player will need a jump soon, and has none left
const LAST_LIFT_PENALTY = 700; // the player will need their very last jump soon
const DOOM_LOOKAHEAD = 0.9; // seconds of free fall checked after the plan
const WARM_BONUS = 40; // keeps the bot from hesitating between equal plans

// Frustration: a bot which stops progressing values its resources less, and
// explores more. Climbing a long shaft, for example, requires paying hit points
// long before the heal, which the horizon of a plan cannot see.
const PROGRESS_STEP = 150; // a progress smaller than this does not count
const FRUSTRATION_DELAY = 3; // seconds without progress before frustration starts
const FRUSTRATION_RAMP = 8; // seconds to reach the maximal frustration
const FRUSTRATED_RESOURCES = 0.25; // weight of the resources at maximal frustration
const FRUSTRATED_EXPLORATION = 3; // multiplies the mutations and random plans

// Heal mode: a hurt bot which cannot progress goes back to a heal block.
// Some paths can only be crossed with enough hit points (layers of damages).
const HEAL_FRUSTRATION = 0.3; // frustration from which a hurt bot looks for a heal
const HURT_HP = PLAYER_HP - 0.5; // below this, the bot is hurt
const HEALED_HP = PLAYER_HP - 0.2; // the heal mode ends above this
const MAX_HEAL_DETOUR = 12000; // farther heals are ignored (field units)
const MAX_HEAL_TIME = 20; // seconds before giving up a heal
const HEAL_COOLDOWN = 8; // seconds between two heal modes


type Dir = -1 | 0 | 1;

interface Policy {
	dirs: Dir[]; // one per segment
	falls: boolean[]; // one per segment
	jumps: boolean[]; // explicit jump at the start of a segment
	floor: number; // floor reflex, NO_FLOOR when disabled
	speed: number; // speed reflex, NO_SPEED when disabled
}

/** What the bot plays: the controls of the winning rollout, step by step. */
export interface Plan {
	dirs: Dir[]; // one per segment
	falls: boolean[]; // one per segment
	jumpSteps: boolean[]; // one per simulation step
}

/** Personality of a bot: small variations so that bots do not all play the same way. */
export interface Personality {
	progressWeight: number;
	caution: number; // multiplies the resource and danger terms
	random: () => number;
}

interface StartState {
	distance: number;
	hp: number;
	jumps: number;
}


const DIRS: Dir[] = [-1, 0, 1];

function pick<T>(list: readonly T[], random: () => number): T {
	return list[Math.floor(random() * list.length)];
}

/* ------------------------------- Candidates ------------------------------- */

function createPolicy(
	dir: (segment: number) => Dir,
	reflexes: { floor?: number, speed?: number, jumpNow?: boolean, fallUntil?: number }
): Policy {
	return {
		dirs: Array.from({ length: SEGMENT_COUNT }, (_, i) => dir(i)),
		falls: Array.from({ length: SEGMENT_COUNT }, (_, i) => i < (reflexes.fallUntil ?? 0)),
		jumps: Array.from({ length: SEGMENT_COUNT }, (_, i) => i === 0 && !!reflexes.jumpNow),
		floor: reflexes.floor ?? NO_FLOOR,
		speed: reflexes.speed ?? NO_SPEED
	};
}

/**
 * Lists the patterns with a constant direction, tried at every decision:
 * every direction with a set of reflexes.
 */
function buildConstantPatterns(): Policy[] {
	const reflexesList = [
		{},
		{ jumpNow: true },
		{ fallUntil: 4 },
		{ floor: 30 },
		{ floor: 100 },
		{ floor: 250 },
		{ floor: 450 },
		{ speed: 0 },
		{ speed: 1500 },
		{ floor: 150, speed: 700 }
	];

	return DIRS.flatMap(dir => reflexesList.map(reflexes => createPolicy(() => dir, reflexes)));
}

/**
 * Lists the patterns changing of direction during the plan. They are many, so
 * each decision only tries a part of them (see TURN_GROUPS): the warm start
 * keeps the good ideas from a decision to the next.
 */
function buildTurnPatterns(): Policy[] {
	const reflexesList = [{}, { floor: 30 }, { floor: 150 }, { floor: 300 }, { speed: 0 }, { speed: 1500 }];
	const policies: Policy[] = [];

	for (const first of DIRS) {
		for (const then of DIRS) {
			if (first === then)
				continue;

			for (const at of TURN_SEGMENTS) {
				for (const reflexes of reflexesList) {
					policies.push(createPolicy(i => i < at ? first : then, reflexes));
				}
			}
		}
	}

	return policies;
}

const CONSTANT_PATTERNS = buildConstantPatterns();
const TURN_PATTERNS = buildTurnPatterns();

/** Removes the segments already played, repeating the last segment at the end. */
function shiftPolicy(policy: Policy, shift: number): Policy {
	const take = <T>(list: T[], filler: T) => {
		const shifted = list.slice(shift);
		while (shifted.length < SEGMENT_COUNT) {
			shifted.push(filler);
		}
		return shifted;
	};

	return {
		dirs: take(policy.dirs, policy.dirs[SEGMENT_COUNT - 1]),
		falls: take(policy.falls, false),
		jumps: take(policy.jumps, false),
		floor: policy.floor,
		speed: policy.speed
	};
}

/** The recorded plan, shifted, as a policy without reflexes (pure replay). */
function replayPolicy(plan: Plan, shift: number): Policy {
	const policy = shiftPolicy({
		dirs: plan.dirs,
		falls: plan.falls,
		jumps: Array.from({ length: SEGMENT_COUNT }, () => false),
		floor: NO_FLOOR,
		speed: NO_SPEED
	}, shift);

	// Recorded jumps happen between segment starts: keep them on their segment.
	for (let segment = 0; segment < SEGMENT_COUNT - shift; segment++) {
		const from = (segment + shift) * SEGMENT_STEPS;
		policy.jumps[segment] = plan.jumpSteps.slice(from, from + SEGMENT_STEPS).some(j => j);
	}

	return policy;
}

/** Changes a policy a little: a direction, a jump, a fast fall or a reflex. */
function mutatePolicy(policy: Policy, random: () => number): Policy {
	const copy: Policy = {
		dirs: [...policy.dirs],
		falls: [...policy.falls],
		jumps: [...policy.jumps],
		floor: policy.floor,
		speed: policy.speed
	};

	const changes = 1 + Math.floor(random() * 2);
	for (let c = 0; c < changes; c++) {
		const i = Math.floor(random() * SEGMENT_COUNT);
		const kind = random();
		if (kind < 0.35) {
			// A new direction for a short run of segments
			const dir = pick(DIRS, random);
			const length = 1 + Math.floor(random() * 4);
			for (let j = i; j < Math.min(SEGMENT_COUNT, i + length); j++) {
				copy.dirs[j] = dir;
			}
		} else if (kind < 0.6) {
			copy.jumps[i] = !copy.jumps[i];
		} else if (kind < 0.7) {
			copy.falls[i] = !copy.falls[i];
		} else if (kind < 0.85) {
			copy.floor = random() < 0.25 ? NO_FLOOR : pick(FLOOR_VALUES, random) * (0.8 + random() * 0.4);
		} else {
			copy.speed = random() < 0.25 ? NO_SPEED : pick(SPEED_VALUES, random) * (0.8 + random() * 0.4);
		}
	}

	return copy;
}

function randomPolicy(random: () => number): Policy {
	let dir = pick(DIRS, random);
	const dirs = Array.from({ length: SEGMENT_COUNT }, () => {
		if (random() < 0.2) {
			dir = pick(DIRS, random);
		}
		return dir;
	});

	return {
		dirs,
		falls: dirs.map(() => random() < 0.05),
		jumps: dirs.map(() => random() < 0.08),
		floor: random() < 0.3 ? NO_FLOOR : pick(FLOOR_VALUES, random),
		speed: random() < 0.5 ? NO_SPEED : pick(SPEED_VALUES, random)
	};
}

/* -------------------------------- Scoring -------------------------------- */

/** Tells whether a jump does not kill the player (it can cost hit points). */
function canAffordJump(player: { jumps: number, hp: number }) {
	return player.jumps > 0 || player.hp > JUMP_HP_COST + 1e-6;
}

/** Number of jumps the player can still do without dying (hit points included). */
function countLift(jumps: number, hp: number) {
	const free = Math.max(0, Math.ceil(jumps - 1e-9));
	const paid = Math.max(0, Math.ceil(hp / JUMP_HP_COST - 1e-9) - 1);
	return free + paid;
}

/**
 * Value of the jumps left. A started jump is a whole jump (the game only checks
 * jumps > 0), and the last jumps are the most precious.
 */
function jumpValue(jumps: number) {
	const whole = Math.max(0, Math.ceil(jumps - 1e-9));
	let value = 0;
	for (let i = 0; i < Math.min(whole, JUMP_COUNT); i++) {
		value += JUMP_VALUES[i];
	}

	value += Math.min(MAX_EXTRA_JUMPS, Math.max(0, whole - JUMP_COUNT)) * EXTRA_JUMP_VALUE;
	return value - (whole - Math.max(0, jumps)) * 30; // a used part of a jump is a small loss
}

/**
 * Tells how bad the end of a plan is for the future: a player falling toward
 * a deadly border needs a jump soon, and must still have one.
 */
function dangerPenalty(field: FlowField, end: SimOutcome) {
	const free = field.freeBelowAt(end.x, end.y);
	const t = DOOM_LOOKAHEAD;
	const fall = end.vy * t + GRAVITY * t * t / 2;
	if (fall < free)
		return 0;

	const lift = countLift(end.jumps, end.hp);
	if (lift === 0)
		return DOOM_PENALTY;
	if (lift === 1)
		return LAST_LIFT_PENALTY;
	return 0;
}

/**
 * Effort left at the end of a plan. A rising player will keep climbing for
 * free until the top of their trajectory, so the momentum is taken into
 * account: the best of the current point and of the top is kept. Without this,
 * the planner would jump again while still rising, wasting the momentum.
 */
function getEndDistance(field: FlowField, end: SimOutcome) {
	const here = field.distanceAt(end.x, end.y);
	if (end.vy >= 0)
		return here;

	const rise = end.vy * end.vy / (2 * GRAVITY);
	const time = -end.vy / GRAVITY;
	const top = field.distanceAt(end.x + end.vx * time, end.y - rise);
	return Math.min(here, top);
}


export class Planner {
	private bestPolicy: Policy | null = null;
	private bestPlan: Plan | null = null;

	// Record of the rollout being simulated, and of the best one
	private record: boolean[] = [];
	private bestRecord: boolean[] = [];

	// Index of the group of turning patterns tried at the next decision
	private turnGroup = 0;

	// Frustration, see FRUSTRATION_DELAY
	private bestDistance = Infinity;
	private lastProgress = 0;
	private frustration = 0;

	// Navigation goal, see HEAL_FRUSTRATION
	private goal: 'finish' | 'heal' = 'finish';
	private goalSince = 0;
	private healAllowedAt = 0;
	private healField: FlowField | null = null;

	constructor(
		private readonly simulation: Simulation,
		private readonly finishField: FlowField,
		private readonly personality: Personality
	) {}

	/** The field used to measure the progress. */
	private get field() {
		return this.goal === 'heal' && this.healField ? this.healField : this.finishField;
	}

	/** Forgets the current plan and the frustration (after a death for example). */
	reset() {
		this.bestPolicy = null;
		this.bestPlan = null;
		this.bestDistance = Infinity;
		this.frustration = 0;
		this.goal = 'finish';
	}

	/** Changes the navigation goal, and restarts the measure of the progress. */
	private setGoal(goal: 'finish' | 'heal', elapsed: number) {
		this.goal = goal;
		this.goalSince = elapsed;
		this.bestDistance = Infinity;
		this.frustration = 0;
		this.bestPolicy = null;
		this.bestPlan = null;
	}

	/** Returns the field leading to the heal blocks which still have units, if any. */
	private findHealField(game: GMJumpies) {
		const ids = Object.values(game.blocks)
			.filter(block => isHealGoal(block.def) && (block.peek(HealUnitsTracker)?.units ?? 0) > 0)
			.map(block => block.id);

		return ids.length > 0 ? getHealField(game.level, ids) : null;
	}

	/**
	 * Chooses between going to the end and going to a heal block. A hurt bot
	 * which cannot progress any more goes to heal itself, if a heal is not too far.
	 */
	private updateGoal(game: GMJumpies, player: Player, elapsed: number) {
		this.healField = this.findHealField(game);
		const healDistance = this.healField?.distanceAt(player.x, player.y) ?? UNREACHABLE;
		const healReachable = healDistance < Math.min(UNREACHABLE, MAX_HEAL_DETOUR);

		if (this.goal === 'finish') {
			const hurt = player.hp < HURT_HP;
			const stuck = this.frustration >= HEAL_FRUSTRATION;
			if (hurt && stuck && healReachable && elapsed >= this.healAllowedAt) {
				this.setGoal('heal', elapsed);
			}
			return;
		}

		// Once decided, the detour is not questioned by the distance: it changes
		// with the moves of the bot, and would make it hesitate.
		const healed = player.hp >= HEALED_HP;
		const tooLong = elapsed - this.goalSince > MAX_HEAL_TIME;
		if (healed || tooLong || healDistance >= UNREACHABLE) {
			this.setGoal('finish', elapsed);
			this.healAllowedAt = elapsed + HEAL_COOLDOWN;
		}
	}

	/** Updates the frustration from the best distance reached since the last reset. */
	private updateFrustration(distance: number, elapsed: number) {
		if (distance < this.bestDistance - PROGRESS_STEP) {
			this.bestDistance = distance;
			this.lastProgress = elapsed;
		}

		const waited = elapsed - this.lastProgress - FRUSTRATION_DELAY;
		this.frustration = Math.min(1, Math.max(0, waited / FRUSTRATION_RAMP));
	}

	/**
	 * Takes a decision: simulates every candidate and returns the plan to play.
	 * `shift` is the number of segments played since the previous decision,
	 * and `elapsed` the game time.
	 */
	decide(game: GMJumpies, playerIdx: number, shift: number, elapsed: number): Plan {
		const player = game.players[playerIdx];
		this.simulation.prepare(game, PLAN_STEPS);
		this.updateGoal(game, player, elapsed);

		const start: StartState = {
			distance: this.field.distanceAt(player.x, player.y),
			hp: player.hp,
			jumps: player.jumps
		};

		this.updateFrustration(start.distance, elapsed);
		const exploration = 1 + (FRUSTRATED_EXPLORATION - 1) * this.frustration;

		let bestPolicy: Policy | null = null;
		let bestScore = -Infinity;
		const consider = (policy: Policy, bonus: number) => {
			const score = this.evaluate(policy, start) + bonus;
			if (score > bestScore) {
				bestScore = score;
				bestPolicy = policy;
				this.bestRecord = this.record;
			}
		};

		const random = this.personality.random;
		let warmDies = true;
		if (this.bestPolicy && this.bestPlan) {
			const warm = shiftPolicy(this.bestPolicy, shift);
			consider(replayPolicy(this.bestPlan, shift), WARM_BONUS);
			consider(warm, WARM_BONUS);
			warmDies = bestScore < -DEATH_SCORE / 2;
			for (let i = 0; i < MUTATION_COUNT * exploration; i++) {
				consider(mutatePolicy(warm, random), 0);
			}
		}

		for (const policy of CONSTANT_PATTERNS) {
			consider(policy, 0);
		}

		// When the current plan leads to a death, every idea is welcome.
		this.turnGroup = (this.turnGroup + 1) % TURN_GROUPS;
		for (const [i, policy] of TURN_PATTERNS.entries()) {
			if (warmDies || i % TURN_GROUPS === this.turnGroup) {
				consider(policy, 0);
			}
		}

		for (let i = 0; i < RANDOM_COUNT * exploration; i++) {
			consider(randomPolicy(random), 0);
		}

		const winner: Policy = bestPolicy!;
		this.bestPolicy = winner;
		this.bestPlan = {
			dirs: winner.dirs,
			falls: winner.falls,
			jumpSteps: [...this.bestRecord]
		};

		return this.bestPlan;
	}

	/** Gives the inputs of a policy for a step, recording the jumps. */
	private control(policy: Policy, step: number, player: Player, lastJump: { step: number }) {
		const segment = Math.floor(step / SEGMENT_STEPS);
		let jump = policy.jumps[segment] && step % SEGMENT_STEPS === 0;

		if (!jump && step - lastJump.step >= REFLEX_GAP && canAffordJump(player)) {
			if (player.vy >= policy.speed) {
				jump = true;
			} else if (policy.floor !== NO_FLOOR && player.vy > 0) {
				const y = player.y + player.vy * FLOOR_LOOKAHEAD;
				jump = this.field.freeBelowAt(player.x, y) < policy.floor;
			}
		}

		if (jump) {
			lastJump.step = step;
		}

		this.record[step] = jump;
		return { dir: policy.dirs[segment], fall: policy.falls[segment], jump };
	}

	/** Simulates a policy and scores its outcome. */
	private evaluate(policy: Policy, start: StartState) {
		this.record = new Array(PLAN_STEPS).fill(false);
		const lastJump = { step: -REFLEX_GAP };
		const end = this.simulation.run((step, player) => this.control(policy, step, player, lastJump));
		return this.score(end, start);
	}

	private score(end: SimOutcome, start: StartState) {
		const { progressWeight, caution } = this.personality;
		const resourceWeight = caution * (1 - (1 - FRUSTRATED_RESOURCES) * this.frustration);
		if (end.finished)
			return FINISH_SCORE - end.time * 1000;

		const progress = start.distance - getEndDistance(this.field, end);
		if (end.dead)
			return -DEATH_SCORE + end.time * LATE_DEATH_BONUS + progress * 0.1;

		const resources =
			(end.hp - start.hp) * HP_VALUE +
			jumpValue(end.jumps) - jumpValue(start.jumps);

		return (
			progress * progressWeight +
			resources * resourceWeight -
			dangerPenalty(this.field, end) * caution
		);
	}
}

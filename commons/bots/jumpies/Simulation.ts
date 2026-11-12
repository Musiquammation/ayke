import { Fields } from "../../Fields";
import type { GMJumpies } from "../../gamemods/GMJumpies";
import { Block } from "../../gamemods/jumpies/Block";
import { PLAYER_SIZE } from "../../gamemods/jumpies/constants";
import { Player } from "../../gamemods/jumpies/Player";
import type { Stage } from "../../gamemods/jumpies/Stage";
import {
	CooldownsTracker,
	DespawnHpTracker,
	HealUnitsTracker,
	PlayersInsideTracker,
	RestoreJumpUnitsTracker
} from "../../gamemods/jumpies/trackers";
import { collisions } from "../../util/collisions";

/*
 * Local simulation used by the planner to try sequences of inputs.
 *
 * The player is simulated with the real Player class (same movement code, same
 * room changes, same deaths). The blocks are not simulated with the real Block
 * class during the rollouts: it would be too slow to do it for dozens of
 * candidate plans. Instead:
 * - once per decision, the movement of every moving block near the bot is
 *   precomputed on a copy of the block (timeline). Block movements do not depend
 *   on the players, except the chasers which are simulated inside the rollouts;
 * - during a rollout, the effects of the blocks on the bot (lava, damages,
 *   bounces, pickups, finish...) are applied by a light copy of the modules,
 *   respecting the "enter" logic and the units of the blocks.
 * Collisions between players are ignored.
 */

export const SIM_DT = 1 / 60;

// Blocks of the rooms farther than this from the bot cannot be reached during a plan.
const REACH = 2600;

const NO_DEATH = () => {};


/** Inputs applied to the simulated player for one step. */
export interface SimControl {
	dir: number;
	fall: boolean;
	jump: boolean;
}

/** State of the simulated player at the end of a rollout. */
export interface SimOutcome {
	x: number;
	y: number;
	vx: number;
	vy: number;
	hp: number;
	jumps: number;
	dead: boolean;
	finished: boolean;
	time: number; // time of the death or of the arrival, or duration of the rollout
}

/**
 * Everything the bot needs to know about a block near it, with the movement
 * of the block precomputed for the duration of a plan.
 */
interface SimBlock {
	block: Block;
	halfW: number; // half sizes of the collision with the player
	halfH: number;
	radius: number; // bounding circle of a turning block, player included
	rotated: boolean;
	chaser: boolean;

	// Timeline: state after each simulation step (index 0 = now).
	// Static blocks only have the index 0.
	moving: boolean;
	xs: Float64Array;
	ys: Float64Array;
	angles: Float64Array;
	actives: Uint8Array;

	// State of the block for this bot, read at the beginning of the decision
	wasInside: boolean;
	cooldown: number;
	healUnits: number;
	restoreJumpUnits: number;
	despawnHp: number;
}

/** Mutable state of a block during one rollout. */
interface RolloutBlock {
	inside: boolean;
	cooldown: number;
	healUnits: number;
	restoreJumpUnits: number;
	despawnHp: number;
	despawned: boolean;
	x: number; // only used by chasers, the others use their timeline
	y: number;
}


/** Tells whether a block can act on a player (text blocks are only decorations). */
function isGameplayBlock(block: Block) {
	const m = block.def.modules;
	return !!(
		m.lava || m.repeatedAttack || m.continousAttack || m.heal || m.restoreJump ||
		m.bounce || m.finishLevel
	);
}

/** Tells whether a room is close enough to a point to matter during a plan. */
function isRoomNear(room: { x: number, y: number, w: number, h: number }, x: number, y: number) {
	const dx = Math.max(room.x - x, 0, x - (room.x + room.w));
	const dy = Math.max(room.y - y, 0, y - (room.y + room.h));
	return dx < REACH && dy < REACH;
}


export class Simulation {
	private readonly player: Player;
	private readonly clones = new Map<number, Block>();
	private blocks: SimBlock[] = [];
	private states: RolloutBlock[] = [];
	private snapshot: Fields | null = null;
	private stage: Stage | null = null; // needed by Player.handleRoom
	private steps = 0;

	constructor(private readonly playerIdx: number) {
		this.player = new Player(playerIdx, NO_DEATH);
	}

	/**
	 * Captures the current state of the game: the bot, and the blocks it can
	 * reach during the next `steps` simulation steps.
	 */
	prepare(game: GMJumpies, steps: number) {
		const real = game.players[this.playerIdx];
		this.snapshot = real.save();
		this.stage = game.stage;
		this.steps = steps;
		this.blocks = [];

		for (const room of game.stage.rooms) {
			if (!isRoomNear(room, real.x, real.y))
				continue;

			for (const block of room.blocks) {
				if (isGameplayBlock(block)) {
					this.blocks.push(this.captureBlock(game, block));
				}
			}
		}

		this.states = this.blocks.map(() => ({
			inside: false, cooldown: 0, healUnits: 0, restoreJumpUnits: 0,
			despawnHp: 0, despawned: false, x: 0, y: 0
		}));
	}

	/** Reads the state of a block for this bot, and precomputes its movement. */
	private captureBlock(game: GMJumpies, block: Block): SimBlock {
		const id = this.playerIdx;
		const m = block.def.modules;
		const sim: SimBlock = {
			block,
			halfW: (block.w + PLAYER_SIZE) / 2,
			halfH: (block.h + PLAYER_SIZE) / 2,
			radius: Math.hypot(block.w, block.h) / 2 + PLAYER_SIZE,
			rotated: m.rotation !== undefined,
			chaser: m.chase !== undefined,
			moving: false,
			xs: new Float64Array([block.x]),
			ys: new Float64Array([block.y]),
			angles: new Float64Array([block.getAngle()]),
			actives: new Uint8Array([block.isActive() ? 1 : 0]),
			wasInside: block.peek(PlayersInsideTracker)?.ids.includes(id) ?? false,
			cooldown: block.peek(CooldownsTracker)?.values.get(id) ?? 0,
			healUnits: block.peek(HealUnitsTracker)?.units ?? 0,
			restoreJumpUnits: block.peek(RestoreJumpUnitsTracker)?.units ?? 0,
			despawnHp: block.peek(DespawnHpTracker)?.units ?? Infinity
		};

		const moves = m.speed || m.acceleration || m.loop || m.rotation;
		if (moves && !sim.chaser) {
			this.computeTimeline(game, block, sim);
		}

		return sim;
	}

	/**
	 * Moves a copy of the block step by step with its real modules, and records
	 * its position, angle and activity. The modules are given no player, so
	 * only the movements have an effect.
	 */
	private computeTimeline(game: GMJumpies, block: Block, sim: SimBlock) {
		let clone = this.clones.get(block.id);
		if (!clone) {
			clone = new Block(block.id, block.def, block.playerCount);
			this.clones.set(block.id, clone);
		}

		clone.load(block.save());
		clone.x = block.x;
		clone.y = block.y;

		const count = this.steps + 1;
		sim.moving = true;
		sim.xs = new Float64Array(count);
		sim.ys = new Float64Array(count);
		sim.angles = new Float64Array(count);
		sim.actives = new Uint8Array(count);

		const emptyGame = { players: [], blocks: game.blocks } as unknown as GMJumpies;
		for (let i = 0; i < count; i++) {
			if (i > 0) {
				for (const module of clone.modules) {
					module.frame?.(clone, emptyGame, SIM_DT);
				}
			}

			sim.xs[i] = clone.x;
			sim.ys[i] = clone.y;
			sim.angles[i] = clone.getAngle();
			sim.actives[i] = clone.isActive() ? 1 : 0;
		}
	}

	/**
	 * Runs a rollout. `control` gives the inputs of each step; it receives the
	 * simulated player, so that a plan can react to the situation (reflexes).
	 */
	run(control: (step: number, player: Player) => SimControl): SimOutcome {
		const player = this.player;
		player.load(this.snapshot!);
		this.resetStates();

		let finished = false;
		let step = 0;
		while (step < this.steps) {
			const input = control(step, player);
			player.dirX = input.dir;
			player.fastFall = input.fall;
			if (input.jump) {
				player.jumpRequested = true;
			}

			// Same order as GMJumpies.run: players move, then blocks act.
			step++;
			player.frame(SIM_DT);
			if (player.isAlive()) {
				player.handleRoom(this.stage!);
			}

			if (player.isAlive()) {
				finished = this.applyBlocks(step);
			}

			if (!player.isAlive() || finished)
				break;
		}

		return {
			x: player.x,
			y: player.y,
			vx: player.vx,
			vy: player.vy,
			hp: player.hp,
			jumps: player.jumps,
			dead: !player.isAlive(),
			finished,
			time: step * SIM_DT
		};
	}

	private resetStates() {
		for (let i = 0; i < this.blocks.length; i++) {
			const sim = this.blocks[i];
			const state = this.states[i];
			state.inside = sim.wasInside;
			state.cooldown = sim.cooldown;
			state.healUnits = sim.healUnits;
			state.restoreJumpUnits = sim.restoreJumpUnits;
			state.despawnHp = sim.despawnHp;
			state.despawned = false;
			state.x = sim.xs[0];
			state.y = sim.ys[0];
		}
	}

	/** Moves a chaser toward the simulated player, like ChaseModule. */
	private moveChaser(sim: SimBlock, state: RolloutBlock) {
		const chase = sim.block.def.modules.chase!;
		const player = this.player;
		const distance = Math.hypot(player.x - state.x, player.y - state.y);
		if (distance === 0 || distance > chase.range)
			return;

		state.x += (player.x - state.x) / distance * chase.speed * SIM_DT;
		state.y += (player.y - state.y) / distance * chase.speed * SIM_DT;
	}

	/** Detects a collision between the simulated player and a block at a position. */
	private touches(sim: SimBlock, x: number, y: number, frame: number) {
		const player = this.player;
		const dx = Math.abs(player.x - x);
		const dy = Math.abs(player.y - y);
		if (!sim.rotated)
			return dx <= sim.halfW && dy <= sim.halfH;

		// Quick rejection with the bounding circle of the turning block.
		if (dx > sim.radius || dy > sim.radius)
			return false;

		return collisions.RotatedRectRect(
			{ x, y, w: sim.block.w, h: sim.block.h, angle: sim.angles[frame] },
			player.getRect()
		);
	}

	/**
	 * Applies the effects of the blocks touching the player, in the order of
	 * the real modules. Returns true when the player reached the end.
	 */
	private applyBlocks(step: number) {
		const player = this.player;
		let finished = false;

		for (let i = 0; i < this.blocks.length; i++) {
			const sim = this.blocks[i];
			const state = this.states[i];
			const m = sim.block.def.modules;
			const frame = sim.moving ? step : 0;

			state.cooldown -= SIM_DT;
			if (sim.chaser) {
				this.moveChaser(sim, state);
			}

			if (sim.actives[frame] === 0 || state.despawned || !player.isAlive()) {
				state.inside = false;
				continue;
			}

			const x = sim.chaser ? state.x : sim.xs[frame];
			const y = sim.chaser ? state.y : sim.ys[frame];
			const touching = this.touches(sim, x, y, frame);
			const entered = touching && !state.inside;
			state.inside = touching;
			if (!touching)
				continue;

			// Touch effects
			if (m.lava) {
				player.kill();
			}

			if (m.repeatedAttack && state.cooldown <= 0 && player.isAlive()) {
				state.cooldown = m.repeatedAttack.duration;
				player.hit(m.repeatedAttack.damages);
			}

			if (m.continousAttack && player.isAlive()) {
				player.hit(m.continousAttack.damagesPerSecond * SIM_DT);
			}

			if (!entered || !player.isAlive())
				continue;

			// Enter effects
			if (m.heal && state.healUnits > 0) {
				state.healUnits--;
				player.heal(m.heal.hp);
			}

			if (m.restoreJump && state.restoreJumpUnits > 0) {
				state.restoreJumpUnits--;
				player.restoreJumps(m.restoreJump.gain);
			}

			if (m.bounce) {
				player.bounce(m.bounce.factor, m.bounce.cost);
			}

			if (m.finishLevel) {
				finished = true;
			}

			if (m.touchDespawn) {
				state.despawnHp--;
				state.despawned = state.despawnHp <= 0;
			}
		}

		return finished;
	}
}

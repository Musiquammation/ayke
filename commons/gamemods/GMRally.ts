import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { GameRandomGenerator } from "../util/GameRandomGenerator";
import { ImageLoader, ImageLoaderFolder } from "../util/ImageLoader";
import { platformEngine } from "../util/platformEngine";

const protocols = getProtocol('rally', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

// Screen / world
const WIDTH = 2400;
const HEIGHT = 1350;
const GRAVITY = 1800;
const GRID_SIZE = 64; // World geometry and terrain tiles use this grid.
const PLAYER_W = 48;
const PLAYER_H = 64;

// Running
const RUN_SPEED = 420;
const RUN_ACC = 2400;
const RUN_SOFT_DEC = 1200;
const RUN_HARD_DEC = 3000;

// Jumping
const JUMP_VELOCITY = 820;
const JUMP_BUFFER = 0.12; // a jump press stays valid for this long (seconds)

// Walls
const WALL_GRAVITY_FACTOR = 0.25;   // fraction of GRAVITY felt while sliding on a wall
const WALL_SLIDE_MAX_SPEED = 220;   // terminal fall speed while sliding
const WALLJUMP_VELOCITY = 520;      // horizontal target speed right after a wall jump
const WALLJUMP_Y = 760;             // vertical impulse of a wall jump
const WALLJUMP_BOOST_TIME = 0.35;   // how long WALLJUMP_VELOCITY replaces RUN_SPEED

// Items are selected by the authoritative simulation when an item box is
// collected, and are handed to the player after ITEM_ROLL_TIME.
const BOX_RESPAWN = 6;
const BOX_SIZE = 56;
const ITEM_ROLL_TIME = 1.8;
const BOOST_TIME = 2;
const BOOST_MULT = 1.6;
const STAR_TIME = 5;
const BANANA_SPEED = 360;
const BANANA_JUMP = -360;
const SHELL_SPEED = 820;
// Red shells always travel in their launch direction. Target distance only
// changes their speed; these bounds guarantee they never stop or reverse.
const VX_MIN = SHELL_SPEED * 0.72;
const VX_MAX = SHELL_SPEED * 1.35;
const RED_SHELL_ACCEL = 760;
const SHELL_JUMP_VELOCITY = 560;
const BLUE_SHELL_SPEED = SHELL_SPEED * 1.08;
const BLUE_SHELL_VERTICAL_ACCEL = 3200; // Accelerate strongly toward the desired vertical velocity; do not clamp it.
const HAZARD_SIZE = 30;
const HIT_KNOCKBACK = 560;
const HIT_JUMP = 640;

const SHELL_FRAME_SIZE = 16;
const SHELL_FRAME_COUNT = 5; // red & green shells; the blue shell has no animation
const SHELL_FRAME_DELAY = 0.09;

// Shells and bombs spawn this far in front of the player so they never touch the thrower.
const SPAWN_FRONT_OFFSET = (PLAYER_W + HAZARD_SIZE) / 2 + 8;
const EXPLOSION_DURATION = 0.42;
const EXPLOSION_RADIUS = 220; // everyone inside this radius is hit
const BOMB_SPEED = 320;

// Match flow: one predefined map, three laps, a 30-second grace period, and a ten-minute hard limit.
const RESPAWN_TIME = 1;
const LAP_COUNT = 3;
const LEVEL_TIME_LIMIT = 600;
const FINISH_GRACE_TIME = 30;
const RANK_POINTS = [4, 3, 2, 1]; // points for 1st, 2nd, ... on each lap

const PHASE_RACING = 0;
const PHASE_DONE = 2;

const ITEM_NONE = 0;
const ITEM_BANANA = 1;
const ITEM_GREEN_SHELL = 2;
const ITEM_RED_SHELL = 3;
const ITEM_BLUE_SHELL = 4;
const ITEM_MUSHROOM = 5;
const ITEM_STAR = 6;
const ITEM_BOMB = 7;

/* -------------------------------------------------------------------------- */
/* Levels (predefined, never sent over the network)                           */
/* -------------------------------------------------------------------------- */

/** Sinusoidal movement of a platform. Position depends only on levelTime (t). */
interface MoveDef {
	ax: number;     // x amplitude
	ay: number;     // y amplitude
	period: number; // seconds
	phase: number;  // 0..1
}

type PlatformSkin = 'grass' | 'platform' | 'box' | 'vertical-trampoline' | 'horizontal-trampoline' | 'mud';

interface PlatformDef {
	skin?: PlatformSkin;
	trampoline?: number; // -1 disables it; otherwise the absolute launch speed.
	mud?: number; // -1 disables it; otherwise the maximum running speed.
	x: number; // center
	y: number; // center
	w: number;
	h: number;
	move?: MoveDef;
}

interface CheckpointDef {
	x: number;
	y: number;
	w?: number;
	h?: number;
	/** A sub-checkpoint is only enabled after this main checkpoint has been passed. */
	afterCheckpoint?: number;
}

interface LevelDef {
	name: string;
	spawnX: number;
	spawnY: number;
	finishX: number;
	deathY: number;
	platforms: PlatformDef[];
	items: { x: number; y: number }[];
	checkpoints: CheckpointDef[];
	subCheckpoints: CheckpointDef[];
}

/** Maps are static and known to all peers; their geometry is never sent in snapshots. */
const LEVELS: LevelDef[] = [
	{
		name: "Warm-up",
		spawnX: 0, spawnY: 384,
		finishX: 3008, deathY: 896,
		platforms: [
			{ x: 704, y: 512, w: 1792, h: 160, skin: 'grass' },
			{ x: 1760, y: 480, w: 224, h: 32, skin: 'platform', move: { ax: 0, ay: 64, period: 3, phase: 0 } },
			{ x: 2400, y: 512, w: 992, h: 160, skin: 'mud', mud: 180 },
			{ x: 2144, y: 0, w: 32, h: 512, skin: 'box' },
			{ x: 2432, y: 128, w: 32, h: 640, skin: 'grass' },
			{ x: 2816, y: -160, w: 608, h: 32, skin: 'grass' },
		],
		items: [{ x: 1312, y: 384 }, { x: 2304, y: 384 }],
		checkpoints: [{ x: 1952, y: 384, w: 64, h: 512 }],
		subCheckpoints: [{ x: 2592, y: 384, w: 64, h: 512, afterCheckpoint: 0 }],
	},
	{
		name: "Skyline",
		spawnX: 0, spawnY: 350,
		finishX: 3150, deathY: 1050,
		platforms: [
			{ x: 560, y: 520, w: 1450, h: 140 },
			{ x: 1370, y: 425, w: 260, h: 32 },
			{ x: 1690, y: 350, w: 260, h: 32, move: { ax: 0, ay: 55, period: 2.7, phase: 0.2 } },
			{ x: 2000, y: 430, w: 380, h: 36 },
			{ x: 2250, y: 350, w: 320, h: 36 },
			{ x: 2500, y: 250, w: 300, h: 36 },
			{ x: 2770, y: 150, w: 300, h: 36 },
			{ x: 3090, y: -10, w: 700, h: 40 },
		],
		items: [{ x: 980, y: 375 }, { x: 1840, y: 280 }, { x: 2680, y: 390 }],
		checkpoints: [{ x: 2020, y: 350, w: 70, h: 520 }],
		subCheckpoints: [{ x: 2710, y: 375, w: 70, h: 520, afterCheckpoint: 0 }],
	},
	{
		name: "Switchback",
		spawnX: 0, spawnY: 370,
		finishX: 3250, deathY: 1100,
		platforms: [
			{ x: 580, y: 535, w: 1500, h: 140 },
			{ x: 1510, y: 450, w: 260, h: 32, move: { ax: 120, ay: 0, period: 3.6, phase: 0.1 } },
			{ x: 1900, y: 390, w: 440, h: 36 },
			{ x: 2250, y: 300, w: 260, h: 32, move: { ax: 0, ay: 65, period: 2.4, phase: 0.55 } },
			{ x: 2630, y: 200, w: 360, h: 36 },
			{ x: 2970, y: 100, w: 360, h: 36 },
			{ x: 3150, y: -10, w: 700, h: 40 },
		],
		items: [{ x: 1050, y: 390 }, { x: 2100, y: 320 }, { x: 2850, y: 410 }],
		checkpoints: [
			{ x: 1660, y: 360, w: 70, h: 520 },
			{ x: 2730, y: 360, w: 70, h: 520 },
		],
		subCheckpoints: [{ x: 2190, y: 320, w: 70, h: 520, afterCheckpoint: 0 }],
	},
];


/** All game rectangles use center coordinates: (x, y) is the center. */
function overlapsCenter(
	a: { x: number; y: number; w: number; h: number },
	b: { x: number; y: number; w: number; h: number }
): boolean {
	return Math.abs(a.x - b.x) * 2 < a.w + b.w &&
		Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

/** Position and velocity of a platform at time t (velocity = derivative). */
function samplePlatform(def: PlatformDef, t: number) {
	const m = def.move;
	if (!m) return { x: def.x, y: def.y, vx: 0, vy: 0 };
	const w = (2 * Math.PI) / m.period;
	const a = w * t + 2 * Math.PI * m.phase;
	return {
		x: def.x + m.ax * Math.sin(a),
		y: def.y + m.ay * Math.sin(a),
		vx: m.ax * w * Math.cos(a),
		vy: m.ay * w * Math.cos(a),
	};
}

/* -------------------------------------------------------------------------- */
/* Engine typing                                                              */
/* -------------------------------------------------------------------------- */

/** Engine-level storage; `skins` is only filled on the client (used by animators). */
interface RallyStorage {
	
}

interface RallyEngineData extends platformEngine.EngineData {
	Game: GMRally;
	Storage: RallyStorage;
}

type RallyEngine = platformEngine.IBlockEngine<RallyEngineData>;

/* -------------------------------------------------------------------------- */
/* Animator                                                                   */
/* -------------------------------------------------------------------------- */


enum RallyAnimatorState {
	IDLE,
	WALKING,
	RUNNING,
	JUMPING,
	FALLING,
	WALL_SLIDE,
	WALL_JUMP,
	WALL_HANG,
	STUNNED,
}
class RallyAnimator extends platformEngine.Animator {
	static readonly ANIMATION_LINES = {
		[RallyAnimatorState.IDLE]: { delay: 0.2, count: 6 },
		[RallyAnimatorState.RUNNING]: { delay: 0.1, count: 8 },
		[RallyAnimatorState.JUMPING]: { delay: 0.2, count: 4 },
		[RallyAnimatorState.FALLING]: { delay: 0.2, count: 4 },
		[RallyAnimatorState.WALL_SLIDE]: { delay: 0.2, count: 4 },
		[RallyAnimatorState.WALL_JUMP]: { delay: 0.2, count: 5 },
		[RallyAnimatorState.STUNNED]: { delay: 0.2, count: 2 },
	};

	constructor(texture: string) {
		super(32, 48, texture, null, RallyAnimator.ANIMATION_LINES, 100);
	}

	/** Picks the animation state from the block's physical state. */
	update(
		block: platformEngine.Block<any, any>,
		walker: platformEngine.Walker,
		direction: platformEngine.Direction,
		current: number
	): platformEngine.StateReturn {
		const b = block as PlayerBlock;
		const S = RallyAnimatorState;
		const to = (s: number): platformEngine.StateReturn =>
			current === s ? { type: 'loop' } : { type: 'switch', state: s };

		if (b.stunned) return to(S.STUNNED);
		const grounded = walker.onFloor();
		if (!grounded && b.wallJumping && b.velocity.y < 0) return to(S.WALL_JUMP);
		const onWall =
			(walker.onLeft() && direction.dir < 0) ||
			(walker.onRight() && direction.dir > 0);

		// Follow the same wall-state transitions as the shared Bot animator.
		if (onWall && !grounded) {
			if (current === S.WALL_SLIDE) return { type: 'loop' };
			return to(S.WALL_SLIDE);
		}
		if (current === S.WALL_SLIDE && b.velocity.y < 0) return to(S.WALL_JUMP);
		if (current === S.WALL_JUMP && b.velocity.y < 0) return { type: 'loop' };
		if (!grounded) {
			if (b.velocity.y < -35) return to(S.JUMPING);
			return to(S.FALLING);
		}
		return Math.abs(b.velocity.x) > 20 ? to(S.RUNNING) : to(S.IDLE);
	}

	getVisualZoom(): number {
		return 1.3;
	}
}

class Walker extends platformEngine.Walker {
	
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

type EntityKind = 'item-box' | 'banana' | 'shell' | 'bomb' | 'explosion';

/**
 * Non-solid game entity. The engine still runs detectCollision for these blocks,
 * even though applyCollision disables physical response. Authoritative contacts
 * are handled by GMRally; hazard subclasses own their replicated state.
 */
class Entity extends platformEngine.Block<ClientData, RallyEngineData> {
	active = true;

	constructor(
		readonly kind: EntityKind,
		readonly entityId: number,
		readonly sourceIndex: number,
		readonly entitySize: number
	) {
		super();
	}

	getSize() {
		const size = this.active ? this.entitySize : 0;
		return { width: size, height: size };
	}

	applyCollision(
		_id: number,
		_clientData: ClientData | null,
		_other: platformEngine.BlockEntry<RallyEngineData>
	): boolean {
		return false;
	}

	override detectCollision(
		_id: platformEngine.BlockId,
		other: platformEngine.BlockEntry<RallyEngineData>,
		_entrySide: platformEngine.Side,
		engine: platformEngine.IBlockEngine<RallyEngineData>,
		_clientData: ClientData | null
	): void {
		if (!this.active) return;
		if (this.kind === 'banana' && other.category === 'platform') {
			engine.game.landBanana(this.entityId);
			return;
		}
		// Explosions are visual/effect entities and must not generate contacts.
		if (this.kind === 'explosion' || !(other.block instanceof PlayerBlock)) return;
		engine.game.handleEntityContact(this, other.block.index);
	}
}

/**
 * Engine block of a player. It holds the live physical state (position, velocity);
 * Player copies it back every frame so everything can be saved.
 */
class PlayerBlock extends platformEngine.Block<ClientData, RallyEngineData> {
	readonly velocity = { x: 0, y: 0 };
	readonly direction = { dir: 0, acc: RUN_ACC, softDec: RUN_SOFT_DEC, hardDec: RUN_HARD_DEC };
	readonly walker = new Walker();
	readonly effects = new platformEngine.VelocityEffectHandler();

	// Display-only flags consumed by the shared animator
	wallSliding = false;
	wallJumping = false;
	stunned = false;
	mudVmax = -1;

	constructor(readonly index: number) {
		super();
	}

	/** An inactive player (waiting to respawn) is off the map: zero size, no contacts. */
	active = true;

	getSize() {
		const on = this.active;
		return { width: on ? PLAYER_W : 0, height: on ? PLAYER_H : 0 };
	}
	getWalker() { return this.walker; }
	getDirection() { return this.direction; }
	getVelocity() { return this.velocity; }
	getVelocityEffects() { return this.effects; }

	createAnimator() {
		return new RallyAnimator('player');
	}

	/** Players never collide with each other: it is a race, not a brawl. */
	applyCollision(
		_id: number,
		_clientData: ClientData | null,
		other: platformEngine.BlockEntry<RallyEngineData>
	): boolean {
		return other.category !== 'player' && !(other.block instanceof Entity);
	}

	override detectCollision(
		_id: platformEngine.BlockId,
		_other: platformEngine.BlockEntry<RallyEngineData>,
		_entrySide: platformEngine.Side,
		_engine: platformEngine.IBlockEngine<RallyEngineData>,
		_clientData: ClientData | null
	): void {}

	processBeforeEngine(_id: number, dt: number, engine: RallyEngine) {
		const player = engine.game.players[this.index];
		if (player.respawn <= 0) this.velocity.y += dt * GRAVITY;
		engine.game.beforePlayerStep(this.index, this, dt);
	}

	processAfterEngine(_id: number, dt: number, engine: RallyEngine) {
		engine.game.afterPlayerStep(this.index, this, dt);
	}
}

/**
 * Static or moving platform. A moving platform follows a pure function of
 * levelTime, so its position never needs to be saved.
 */
class PlatformBlock extends platformEngine.Block<ClientData, RallyEngineData> {
	private forced: platformEngine.Velocity | null = null;
	readonly trampoline: number;
	readonly mud: number;

	constructor(readonly def: PlatformDef) {
		super();
		this.x = def.x;
		this.y = def.y;
		this.trampoline = def.trampoline ?? -1;
		this.mud = def.mud ?? -1;
	}

	// The engine calls this on contact, so launch impulses are applied immediately.
	override detectCollision(
		_id: platformEngine.BlockId,
		other: platformEngine.BlockEntry<RallyEngineData>,
		_entrySide: platformEngine.Side,
		_engine: platformEngine.IBlockEngine<RallyEngineData>,
		_clientData: ClientData | null
	): void {
		if (this.trampoline < 0) return;
		const horizontal = this.def.skin === 'horizontal-trampoline';
		if (other.block instanceof PlayerBlock) {
			if (horizontal) other.block.velocity.x = Math.sign(other.block.velocity.x || other.block.direction.dir || 1) * this.trampoline;
			else other.block.velocity.y = -this.trampoline;
		} else if (other.block instanceof Entity) {
			const entity = other.block as Entity & { vx?: number; vy?: number };
			if (typeof entity.vx === 'number' && typeof entity.vy === 'number') {
				if (horizontal) entity.vx = Math.sign(entity.vx || 1) * this.trampoline;
				else entity.vy = -this.trampoline;
			}
		}
	}

	getSize() { return { width: this.def.w, height: this.def.h }; }
	getForcedVelocity() { return this.forced; }

	/** Gives the engine the exact velocity so it can carry the players standing on it. */
	processBeforeEngine(_id: number, _dt: number, engine: RallyEngine) {
		if (!this.def.move) return;
		const s = samplePlatform(this.def, engine.game.levelTime);
		this.forced = { x: s.vx, y: s.vy };
	}

	/** Re-snaps the position onto the analytic trajectory to avoid any drift. */
	processAfterEngine(_id: number, _dt: number, engine: RallyEngine) {
		if (!this.def.move) return;
		const s = samplePlatform(this.def, engine.game.levelTime);
		this.x = s.x;
		this.y = s.y;
	}
}

/* -------------------------------------------------------------------------- */
/* Player (everything here is shared via save / load)                         */
/* -------------------------------------------------------------------------- */

class Player {
	connected = true;
	isRed = true;

	// Mirror of the authoritative physical state.
	x = 0;
	y = 0;
	vx = 0;
	vy = 0;

	facing = 1;
	jumpBuffer = 0;
	wallBoost = 0;
	boostTimer = 0;
	slowTimer = 0; // kept for backward-compatible snapshots; no longer used by items
	starTimer = 0;
	item = ITEM_NONE;
	pendingItem = ITEM_NONE;
	itemRollTimer = 0;
	itemQueued = false;
	respawn = 0;
	checkpoint = -1;
	subCheckpoint = -1;
	hit = false;
	lapsCompleted = 0;
	finished = false;
	finishRank = -1;
	finalRanking = -1;
	points = 0;
	lapFinishCounts: number[] = Array.from({ length: LAP_COUNT }, () => -1);

	/** Full match reset. Cumulative points are intentionally retained. */
	resetForLevel(x: number, y: number) {
		this.x = x;
		this.y = y;
		this.vx = 0;
		this.vy = 0;
		this.facing = 1;
		this.jumpBuffer = 0;
		this.wallBoost = 0;
		this.boostTimer = 0;
		this.slowTimer = 0;
		this.starTimer = 0;
		this.item = ITEM_NONE;
		this.pendingItem = ITEM_NONE;
		this.itemRollTimer = 0;
		this.itemQueued = false;
		this.respawn = 0;
		this.checkpoint = -1;
		this.subCheckpoint = -1;
		this.hit = false;
		this.lapsCompleted = 0;
		this.finished = false;
		this.finishRank = -1;
		this.finalRanking = -1;
		this.lapFinishCounts = Array.from({ length: LAP_COUNT }, () => -1);
	}

	/** Reset lap-local state while retaining cumulative score and lap count. */
	resetAtSpawn(x: number, y: number) {
		this.x = x;
		this.y = y;
		this.vx = 0;
		this.vy = 0;
		this.facing = 1;
		this.jumpBuffer = 0;
		this.wallBoost = 0;
		this.boostTimer = 0;
		this.slowTimer = 0;
		this.starTimer = 0;
		// Preserve held items across a completed lap. An unfinished roulette is
		// preserved too; it continues after the player returns to the start.
		this.itemQueued = false;
		// A lap wrap is not a death respawn: keep the player visible and active.
		this.respawn = 0;
		this.checkpoint = -1;
		this.subCheckpoint = -1;
		this.hit = false;
		this.finished = false;
		this.finishRank = -1;
		this.finalRanking = -1;
	}

	private tickTimers(dt: number) {
		this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
		this.wallBoost = Math.max(0, this.wallBoost - dt);
		this.boostTimer = Math.max(0, this.boostTimer - dt);
		this.slowTimer = Math.max(0, this.slowTimer - dt);
		this.starTimer = Math.max(0, this.starTimer - dt);
	}

	/** All controls are ignored during a hit, including buffered inputs. */
	control(block: PlayerBlock, dt: number) {
		this.tickTimers(dt);
		block.wallSliding = false;
		block.wallJumping = this.wallBoost > 0;
		// Off the map while waiting to respawn.
		block.active = this.respawn <= 0;
		block.stunned = this.hit;

		if (this.respawn > 0 || this.hit) {
			block.direction.dir = 0;
			this.jumpBuffer = 0;
			this.itemQueued = false;
			if (this.respawn > 0) this.freeze(block);
			return;
		}

		// Finished players still use the normal movement and terrain response; only runInput is blocked.
		if (this.finished) {
			this.jumpBuffer = 0;
			this.itemQueued = false;
		}

		const onFloor = block.walker.onFloor();
		const pushingWall =
			(this.facing > 0 && block.walker.onRight()) ||
			(this.facing < 0 && block.walker.onLeft());

		if (pushingWall && onFloor) {
			this.facing = -this.facing;
		} else if (pushingWall) {
			this.slideOnWall(block, dt);
		} else if (onFloor && this.jumpBuffer > 0) {
			block.velocity.y = -JUMP_VELOCITY;
			this.jumpBuffer = 0;
		}

		this.applyDirection(block);
	}

	private freeze(block: PlayerBlock) {
		block.velocity.x = 0;
		block.velocity.y = 0;
		block.direction.dir = 0;
		this.jumpBuffer = 0;
		this.itemQueued = false;
	}

	private slideOnWall(block: PlayerBlock, dt: number) {
		block.wallSliding = true;
		if (block.velocity.y > 0) {
			block.velocity.y -= GRAVITY * (1 - WALL_GRAVITY_FACTOR) * dt;
			block.velocity.y = Math.min(block.velocity.y, WALL_SLIDE_MAX_SPEED);
		}
		if (this.jumpBuffer > 0) {
			this.facing = -this.facing;
			this.wallBoost = WALLJUMP_BOOST_TIME;
			block.velocity.y = -WALLJUMP_Y;
			this.jumpBuffer = 0;
			block.wallSliding = false;
			block.wallJumping = true;
		}
	}

	private applyDirection(block: PlayerBlock) {
		let speed = this.wallBoost > 0 ? WALLJUMP_VELOCITY : RUN_SPEED;
		if (block.mudVmax >= 0 && this.boostTimer <= 0 && this.starTimer <= 0) speed = Math.min(speed, block.mudVmax);
		if (this.boostTimer > 0 || this.starTimer > 0) speed *= BOOST_MULT;
		block.direction.dir = this.facing * speed;
	}

	save() {
		return {
			x: this.x, y: this.y, vx: this.vx, vy: this.vy,
			connected: this.connected, isRed: this.isRed, facing: this.facing,
			jumpBuffer: this.jumpBuffer, wallBoost: this.wallBoost,
			boostTimer: this.boostTimer, slowTimer: this.slowTimer, starTimer: this.starTimer,
			item: this.item, pendingItem: this.pendingItem, itemRollTimer: this.itemRollTimer,
			itemQueued: this.itemQueued, respawn: this.respawn,
			checkpoint: this.checkpoint, subCheckpoint: this.subCheckpoint, hit: this.hit,
			lapsCompleted: this.lapsCompleted, finished: this.finished,
			finishRank: this.finishRank, finalRanking: this.finalRanking, points: this.points,
			lapFinishCounts: this.lapFinishCounts,
		};
	}

	load(obj: Fields) {
		this.x = obj.x; this.y = obj.y; this.vx = obj.vx; this.vy = obj.vy;
		this.connected = obj.connected; this.isRed = obj.isRed;
		this.facing = obj.facing === 0 ? 1 : obj.facing;
		this.jumpBuffer = obj.jumpBuffer ?? 0; this.wallBoost = obj.wallBoost ?? 0;
		this.boostTimer = obj.boostTimer ?? 0; this.slowTimer = obj.slowTimer ?? 0;
		this.starTimer = obj.starTimer ?? 0;
		this.item = obj.item ?? ITEM_NONE; this.pendingItem = obj.pendingItem ?? ITEM_NONE;
		this.itemRollTimer = obj.itemRollTimer ?? 0; this.itemQueued = obj.itemQueued ?? false;
		this.respawn = obj.respawn ?? 0; this.checkpoint = obj.checkpoint ?? -1;
		this.subCheckpoint = obj.subCheckpoint ?? -1; this.hit = obj.hit ?? false;
		this.lapsCompleted = obj.lapsCompleted ?? 0; this.finished = obj.finished ?? false;
		this.finishRank = obj.finishRank ?? -1;
		this.finalRanking = obj.finalRanking ?? -1;
		this.points = obj.points ?? 0;
		this.lapFinishCounts = [...(obj.lapFinishCounts ?? Array.from({ length: LAP_COUNT }, () => -1))];
	}
}

/* -------------------------------------------------------------------------- */
/* Client-only data                                                           */
/* -------------------------------------------------------------------------- */

class Camera {
	x = 0;
	y = 0;
	static readonly SCALE = 0.8;
	private static readonly LOOK_AHEAD = 250;
	private static readonly SMOOTH = 8;

	/** Smoothly follows the player, looking ahead in the running direction. */
	update(px: number, py: number, facing: number, dt: number) {
		const k = Math.min(1, Camera.SMOOTH * dt);
		this.x += (px + facing * Camera.LOOK_AHEAD - this.x) * k;
		this.y += (py - this.y) * k;
	}

	/** Instantly moves the camera (level start / respawn). */
	teleport(px: number, py: number) {
		this.x = px;
		this.y = py;
	}

	getCoords() { return { x: this.x, y: this.y }; }
}

class ClientData {
	firstFrame = true;
	readonly html: HTMLDivElement;
	readonly laps: HTMLDivElement;
	readonly camera = new Camera();
	private lastLevel = -1;
	private lastRespawn = 0;
	private lastX = Number.NaN;
	private lastY = Number.NaN;
	private wasRollingItem = false;
	private revealUntil = 0;
	private revealItem = ITEM_NONE;
	private lastGameTime = Number.NaN;
	private frameDelta = 1 / 60;
	private readonly shellAnimations: Record<number, { step: number; delay: number }> = {};
	private readonly lastBoostTimers: number[] = [];
	private readonly lastStarTimers: number[] = [];
	private readonly boostParticleTimers: number[] = [];
	private particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string }> = [];

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-rally-root");
		this.html.style.pointerEvents = "none";
		this.html.style.position = "absolute";
		this.html.style.inset = "0";
		this.html.style.width = "100%";
		this.html.style.height = "100%";

		// Keep only the lap counter in the DOM HUD; all other gameplay graphics use the canvas.
		this.laps = document.createElement("div");
		this.laps.classList.add("game-rally-laps");
		this.laps.style.position = "absolute";
		this.laps.style.left = "18px";
		this.laps.style.top = "14px";
		this.laps.style.color = "white";
		this.laps.style.font = "bold 30px Arial, sans-serif";
		this.laps.style.textShadow = "2px 2px 4px #000";
		this.html.append(this.laps);
	}

	drawRacePosition(ctx: CanvasRenderingContext2D, game: GMRally, playerIdx: number) {
		const ranking = game.getRaceRanking();
		const rank = ranking.indexOf(playerIdx) + 1;

		// Early exit if the player is not ranked
		if (rank <= 0) return;

		// Determine ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
		const suffix = rank % 100 >= 11 && rank % 100 <= 13
			? "th"
			: rank % 10 === 1
				? "st"
				: rank % 10 === 2
					? "nd"
					: rank % 10 === 3
						? "rd"
						: "th";

		ctx.save();

		// 1. Font setups (Enlarged size)
		const numberFont = "black 120px 'Arial Black', Impact, sans-serif";
		const suffixFont = "bold 50px 'Arial Black', Impact, sans-serif";

		ctx.textBaseline = "bottom";

		// 2. Measure text dimensions to avoid overlap and align properly from right margin
		ctx.font = numberFont;
		const numberWidth = ctx.measureText(`${rank}`).width*2 + 10;

		ctx.font = suffixFont;
		const suffixWidth = ctx.measureText(suffix).width;

		const gap = 6; // Spacing between number and suffix
		const totalWidth = numberWidth + gap + suffixWidth;

		// Canvas layout calculations
		const marginX = 36;
		const marginY = 28;

		const startX = WIDTH - marginX - totalWidth;
		const numberY = HEIGHT - marginY;
		const suffixY = numberY - 35; // Lift suffix up relative to the main baseline

		// 3. Dynamic color gradient based on rank position
		const gradient = ctx.createLinearGradient(startX, numberY - 110, startX, numberY);

		if (rank === 1) {
			// Gold gradient for 1st place
			gradient.addColorStop(0, "#FFF59D");
			gradient.addColorStop(0.5, "#FFD700");
			gradient.addColorStop(1, "#FF8F00");
		} else if (rank === 2) {
			// Silver/Chrome gradient for 2nd place
			gradient.addColorStop(0, "#FFFFFF");
			gradient.addColorStop(0.5, "#ECEFF1");
			gradient.addColorStop(1, "#78909C");
		} else if (rank === 3) {
			// Bronze gradient for 3rd place
			gradient.addColorStop(0, "#FFCC80");
			gradient.addColorStop(0.5, "#E65100");
			gradient.addColorStop(1, "#BF360C");
		} else {
			// Neon Cyan/Blue gradient for remaining ranks
			gradient.addColorStop(0, "#80DEEA");
			gradient.addColorStop(0.5, "#00B0FF");
			gradient.addColorStop(1, "#1565C0");
		}

		// 4. Drop shadow settings for contrast against gameplay background
		ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
		ctx.shadowBlur = 16;
		ctx.shadowOffsetX = 5;
		ctx.shadowOffsetY = 7;

		// 5. Stroke configuration
		ctx.strokeStyle = "#000000";
		ctx.lineJoin = "round";
		ctx.miterLimit = 2;

		// Switch alignment to left so text flows naturally from startX without overlapping
		ctx.textAlign = "left";

		// --- DRAW RANK NUMBER (LARGE) ---
		ctx.font = numberFont;
		ctx.lineWidth = 14;
		ctx.strokeText(`${rank}`, startX, numberY);
		ctx.fillStyle = gradient;
		ctx.fillText(`${rank}`, startX, numberY);

		// --- DRAW SUFFIX (SMALL & OFFSET) ---
		const suffixX = startX + numberWidth + gap;
		ctx.font = suffixFont;
		ctx.lineWidth = 8;
		ctx.strokeText(suffix, suffixX, suffixY);
		ctx.fillText(suffix, suffixX, suffixY);

		ctx.restore();
	}

	drawItemRoulette(
		ctx: CanvasRenderingContext2D,
		game: GMRally,
		playerIdx: number,
		imageLoader: ImageLoaderFolder
	) {
		const player = game.players[playerIdx];
		if (player.finalRanking !== -1 || player.finished) {
			this.wasRollingItem = false;
			this.revealItem = ITEM_NONE;
			return;
		}
		const rolling = player.itemRollTimer > 0 && player.pendingItem !== ITEM_NONE;
		const heldItem = rolling ? ITEM_NONE : player.item;

		if (this.wasRollingItem && !rolling) {
			this.revealItem = player.item;
			this.revealUntil = game.levelTime + 0.42;
		}
		if (rolling) this.revealItem = ITEM_NONE;
		this.wasRollingItem = rolling;

		if (!rolling && heldItem === ITEM_NONE && game.levelTime >= this.revealUntil) {
			this.revealItem = ITEM_NONE;
		}
		const item = heldItem !== ITEM_NONE ? heldItem : this.revealItem;
		if (!rolling && item === ITEM_NONE) return;

		// Draw after the world transform has been restored: this HUD is camera-free.
		const x = WIDTH - 180;
		const y = 22;
		const size = 156;
		const inset = 8;
		const innerX = x + inset;
		const innerY = y + inset;
		const innerSize = size - inset * 2;

		ctx.save();
		ctx.shadowColor = '#0009';
		ctx.shadowBlur = 18;
		ctx.shadowOffsetY = 7;
		const frame = ctx.createLinearGradient(x, y, x + size, y + size);
		frame.addColorStop(0, '#f8ffff');
		frame.addColorStop(0.38, '#9fb9d5');
		frame.addColorStop(1, '#455d82');
		ctx.fillStyle = frame;
		ctx.beginPath();
		ctx.roundRect(x, y, size, size, 18);
		ctx.fill();
		ctx.shadowColor = 'transparent';
		ctx.lineWidth = 2;
		ctx.strokeStyle = '#253a5a';
		ctx.stroke();

		ctx.save();
		ctx.beginPath();
		ctx.roundRect(innerX, innerY, innerSize, innerSize, 10);
		ctx.clip();
		const background = ctx.createRadialGradient(
			innerX + innerSize * 0.45, innerY + innerSize * 0.22, 2,
			innerX + innerSize * 0.5, innerY + innerSize * 0.56, innerSize
		);
		background.addColorStop(0, '#426fa4');
		background.addColorStop(1, '#193158');
		ctx.fillStyle = background;
		ctx.fillRect(innerX, innerY, innerSize, innerSize);
		ctx.shadowColor = 'transparent';

		if (rolling) {
			const progress = Math.max(0, Math.min(1, 1 - player.itemRollTimer / ITEM_ROLL_TIME));
			const eased = 1 - Math.pow(1 - progress, 4.2);
			const winnerIndex = 48 + (player.pendingItem * 3 % 6);
			const reelPosition = eased * winnerIndex;
			const cell = 68;
			const center = innerY + innerSize / 2;

			ctx.fillStyle = '#8fcaff20';
			ctx.fillRect(innerX + 2, center - cell / 2, innerSize - 4, cell);
			ctx.strokeStyle = '#e5f4ffb5';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(innerX + 6, center - cell / 2);
			ctx.lineTo(innerX + innerSize - 6, center - cell / 2);
			ctx.moveTo(innerX + 6, center + cell / 2);
			ctx.lineTo(innerX + innerSize - 6, center + cell / 2);
			ctx.stroke();

			const rouletteItems = [ITEM_BANANA, ITEM_GREEN_SHELL, ITEM_RED_SHELL, ITEM_BLUE_SHELL, ITEM_MUSHROOM, ITEM_STAR, ITEM_BOMB];
			const first = Math.floor(reelPosition);
			for (let offset = -2; offset <= 2; offset++) {
				const index = first + offset;
				const reelItem = index === winnerIndex
					? player.pendingItem
					: rouletteItems[((index * 7 + Math.floor(index / 3) * 5) % rouletteItems.length + rouletteItems.length) % rouletteItems.length];
				const itemY = center + (index - reelPosition) * cell;
				if (itemY < innerY - cell || itemY > innerY + innerSize + cell) continue;
				const distance = Math.abs(itemY - center) / cell;
				const scale = 1 - Math.min(0.25, distance * 0.14);
				drawItemTexture(ctx, imageLoader, reelItem, innerX + innerSize / 2, itemY, 52 * scale, 0, game.levelTime * 3 + index * 0.2);
			}
		} else {
			let scale = 1;
			let rotation = 0;
			if (game.levelTime < this.revealUntil) {
				const t = Math.max(0, Math.min(1, 1 - (this.revealUntil - game.levelTime) / 0.42));
				if (t < 0.72) {
					const q = t / 0.72;
					scale = 0.52 + 0.63 * (1 - Math.pow(1 - q, 2));
					rotation = -0.28 * (1 - q);
				} else {
					const q = (t - 0.72) / 0.28;
					scale = 1.15 - 0.15 * q;
					rotation = 0.05 * (1 - q);
				}
			} else {
				scale = 1 + Math.sin(game.levelTime * 4) * 0.025;
			}
			drawItemTexture(ctx, imageLoader, item, innerX + innerSize / 2, innerY + innerSize / 2, 92 * scale, rotation, game.levelTime * 2);
		}

		ctx.restore();
		// Subtle gloss, drawn on the main canvas rather than a separate DOM canvas.
		const gloss = ctx.createLinearGradient(x, y, x + size, y + size);
		gloss.addColorStop(0, '#ffffff30');
		gloss.addColorStop(0.38, '#ffffff00');
		gloss.addColorStop(0.72, '#ffffff00');
		gloss.addColorStop(1, '#ffffff12');
		ctx.fillStyle = gloss;
		ctx.beginPath();
		ctx.roundRect(x + inset, y + inset, innerSize, innerSize, 10);
		ctx.fill();
		ctx.restore();
	}

	/** Update the lap counter, camera, shell animations, and local-only particles. */
	update(game: GMRally, playerIdx: number) {
		const player = game.players[playerIdx];
		this.laps.innerText = player.finalRanking !== -1 || player.finished
			? "Finished"
			: `${Math.min(player.lapsCompleted + 1, LAP_COUNT)}/${LAP_COUNT}`;

		this.frameDelta = Number.isFinite(this.lastGameTime)
			? Math.max(0, Math.min(0.1, game.levelTime - this.lastGameTime))
			: 1 / 60;
		this.lastGameTime = game.levelTime;

		// Advance each projectile's animation independently and discard stale entries.
		const liveShellIds = new Set<number>();
		for (const shell of game.getShellsForAnimation()) {
			liveShellIds.add(shell.entityId);
			const count = getShellFrameCount(shell.itemKind);
			const animation = this.shellAnimations[shell.entityId] ?? { step: 0, delay: SHELL_FRAME_DELAY };
			animation.delay -= this.frameDelta;
			while (animation.delay <= 0) {
				animation.step = (animation.step + 1) % count;
				animation.delay += SHELL_FRAME_DELAY;
			}
			this.shellAnimations[shell.entityId] = animation;
		}
		for (const id of Object.keys(this.shellAnimations)) {
			if (!liveShellIds.has(Number(id))) delete this.shellAnimations[Number(id)];
		}

		// Emit a continuous, timed trail while a mushroom boost is active.
		game.players.forEach((current, i) => {
			const previousBoost = this.lastBoostTimers[i] ?? 0;
			const previousStar = this.lastStarTimers[i] ?? 0;
			const starWasActivated = current.starTimer > previousStar + 0.05;
			const boostStarted = current.boostTimer > previousBoost + 0.05 && !starWasActivated;
			if (boostStarted) this.boostParticleTimers[i] = 0;
			if (current.boostTimer > 0 && current.starTimer <= 0) {
				this.boostParticleTimers[i] = (this.boostParticleTimers[i] ?? 0) - this.frameDelta;
				while (this.boostParticleTimers[i] <= 0) {
					this.spawnBoostTrailParticles(current.x, current.y, current.facing);
					this.boostParticleTimers[i] += 0.045;
				}
			} else {
				this.boostParticleTimers[i] = 0;
			}
			this.lastBoostTimers[i] = current.boostTimer;
			this.lastStarTimers[i] = current.starTimer;
		});

		for (const particle of this.particles) {
			particle.life -= this.frameDelta;
			particle.x += particle.vx * this.frameDelta;
			particle.y += particle.vy * this.frameDelta;
			particle.vy += GRAVITY * 0.22 * this.frameDelta;
		}
		this.particles = this.particles.filter(p => p.life > 0);

		// Snap at match start and when a respawn finishes.
		if (this.lastLevel !== game.levelIndex ||
			(this.lastRespawn > 0 && player.respawn <= 0) ||
			(Number.isFinite(this.lastX) && Math.abs(player.x - this.lastX) > 500) ||
			(Number.isFinite(this.lastY) && Math.abs(player.y - this.lastY) > 500)) {
			this.camera.teleport(player.x, player.y);
		}
		this.lastLevel = game.levelIndex;
		this.lastRespawn = player.respawn;
		this.lastX = player.x;
		this.lastY = player.y;
		this.camera.update(player.x, player.y, player.facing, this.frameDelta || 1 / 60);
	}

	/** Return the currently selected animation frame for one projectile. */
	getShellFrame(entityId: number): number {
		return this.shellAnimations[entityId]?.step ?? 0;
	}

	/** Emit bright streaks behind the player at regular intervals during a mushroom boost. */
	private spawnBoostTrailParticles(x: number, y: number, facing: number) {
		const colors = ["#fff176", "#ffb300", "#ff6d00", "#ffffff", "#ff3d00"];
		for (let i = 0; i < 5; i++) {
			const life = 0.22 + Math.random() * 0.2;
			this.particles.push({
				x: x - facing * (PLAYER_W * 0.35 + Math.random() * 14),
				y: y + (Math.random() - 0.5) * PLAYER_H * 0.8,
				vx: -facing * (180 + Math.random() * 260) + (Math.random() - 0.5) * 90,
				vy: (Math.random() - 0.5) * 150,
				life, maxLife: life, size: 4 + Math.random() * 6,
				color: colors[Math.floor(Math.random() * colors.length)],
			});
		}
	}
	/** Draw boost particles in world space, before the camera transform is restored. */
	drawParticles(ctx: CanvasRenderingContext2D) {
		ctx.save();
		for (const particle of this.particles) {
			ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
			ctx.fillStyle = particle.color;
			ctx.shadowColor = particle.color;
			ctx.shadowBlur = particle.size * 2.5;
			ctx.beginPath();
			ctx.ellipse(particle.x, particle.y, particle.size * 1.8, particle.size * 0.65, Math.atan2(particle.vy, particle.vx), 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}
}

class TutorialData {
	/** Keep the tutorial overlay empty; the lap counter is the only DOM HUD text. */
	frame(_dt: number, _clock: number) {
		return "";
	}
}


/** Keep level selection in the protobuf schema; never inspect encoded wire bytes manually. */
function normalizeLevelIndex(index: number): number {
	if (!Number.isFinite(index) || LEVELS.length === 0) return 0;
	return ((Math.trunc(index) % LEVELS.length) + LEVELS.length) % LEVELS.length;
}

function readMapVote(data: Uint8Array): number {
	const { StartData } = protocols.get();
	try {
		const decoded = decodeFullMessage(StartData.decode(data));
		const choice = Number(decoded.choice ?? -1);
		return Number.isInteger(choice) ? choice : -1;
	} catch {
		return -1;
	}
}

function generateClientDom(unlockedSkins: string[]) {
	return {
		mapChoice: -1,
		maps: LEVELS.map(level => level.name),
		preferTeam: 0,
		unlockedSkins,

		produce() {
			const { StartData } = protocols.get();
			const choice = (
				(
					Number.isInteger(this.mapChoice) &&
					this.mapChoice >= 0 &&
					this.mapChoice < LEVELS.length
				) 
				? this.mapChoice
				: -1
			);
			return StartData.encode({
				preferTeam: this.preferTeam,
				choice
			}).finish();
		},

		hasSkin(skin: string) {
			return this.unlockedSkins.includes(skin);
		},

		getSkinIconPath
	};
}

function getSkinTexturePath(id: string) {
	return `/assets/games/rally/skins/${id}/grid.png`;
}

function getSkinIconPath(id: string) {
	return window.IMG_ROOT_PATH + `/assets/games/rally/skins/${id}/icon.png`;
}

/* -------------------------------------------------------------------------- */
/* Game mode                                                                  */
/* -------------------------------------------------------------------------- */

class Banana extends Entity {
	vx = 0;
	vy = 0;
	owner = -1;
	arming = 0;
	grounded = false;

	constructor(entityId: number) {
		super('banana', entityId, -1, HAZARD_SIZE);
	}

	load(data: any): void {
		this.x = data.x ?? 0;
		this.y = data.y ?? 0;
		const thrown = data.thrown ?? null;
		this.vx = thrown?.vx ?? 0;
		this.vy = thrown?.vy ?? 0;
		this.owner = thrown?.owner ?? -1;
		this.grounded = !thrown;
		this.arming = 0;
		this.active = true;
	}

	save() {
		return {
			id: this.entityId, x: this.x, y: this.y,
			...(!this.grounded ? { thrown: { owner: this.owner, vx: this.vx, vy: this.vy } } : {}),
		};
	}
}

abstract class Shell extends Entity {
	vx = 0;
	vy = 0;
	abstract readonly itemKind: number;

	constructor(entityId: number) {
		super('shell', entityId, -1, HAZARD_SIZE);
	}

	load(data: any): void {
		this.x = data.x ?? 0;
		this.y = data.y ?? 0;
		const state = data.red ?? data.blue ?? data.green ?? {};
		this.vx = state.vx ?? 0;
		this.vy = state.vy ?? 0;
		this.active = true;
	}

	save() {
		const state = { vx: this.vx, vy: this.vy };
		return {
			id: this.entityId, x: this.x, y: this.y,
			...(this.itemKind === ITEM_RED_SHELL ? { red: state }
				: this.itemKind === ITEM_BLUE_SHELL ? { blue: state }
				: { green: state }),
		};
	}
}

class RedShell extends Shell { readonly itemKind = ITEM_RED_SHELL; }
class GreenShell extends Shell { readonly itemKind = ITEM_GREEN_SHELL; }
/** No collision with the terrain: it flies through everything and only reacts to its target. */
class BlueShell extends Shell { readonly itemKind = ITEM_BLUE_SHELL; }

/** Thrown bomb. Not a shell: it has its own snapshot message. Explodes on landing or on any player. */
class Bomb extends Entity {
	vx = 0;
	vy = 0;

	constructor(entityId: number) {
		super('bomb', entityId, -1, HAZARD_SIZE);
	}

	load(data: any): void {
		this.x = data.x ?? 0;
		this.y = data.y ?? 0;
		this.vx = data.vx ?? 0;
		this.vy = data.vy ?? 0;
		this.active = true;
	}

	save() {
		return { id: this.entityId, x: this.x, y: this.y, vx: this.vx, vy: this.vy };
	}
}

/** Short-lived replicated blast. Damage (everyone in `radius`) is applied once when it is created. */
class Explosion extends Entity {
	remaining = EXPLOSION_DURATION;
	readonly radius = EXPLOSION_RADIUS;
	itemKind = ITEM_BOMB;

	constructor(entityId: number, itemKind = ITEM_BOMB) {
		super('explosion', entityId, -1, EXPLOSION_RADIUS * 2);
		this.itemKind = itemKind;
	}

	load(data: any): void {
		this.x = data.x ?? 0;
		this.y = data.y ?? 0;
		this.remaining = Math.max(0, data.remaining ?? EXPLOSION_DURATION);
		this.itemKind = data.itemKind === ITEM_BLUE_SHELL ? ITEM_BLUE_SHELL : ITEM_BOMB;
		this.active = this.remaining > 0;
	}

	save() {
		return { id: this.entityId, x: this.x, y: this.y, remaining: this.remaining, itemKind: this.itemKind };
	}
}

type Hazard = Banana | Shell | Bomb | Explosion;

function isHazard(block: unknown): block is Hazard {
	return block instanceof Banana || block instanceof Shell || block instanceof Bomb || block instanceof Explosion;
}

/**
 * Names of items. The HUD icon is `item-<name>` (items/ folder, no animation);
 * the world sprite is `<name>` (entities/ folder).
 */
const ITEM_NAMES: Record<number, string> = {
	[ITEM_BANANA]: 'banana',
	[ITEM_GREEN_SHELL]: 'green-shell',
	[ITEM_RED_SHELL]: 'red-shell',
	[ITEM_BLUE_SHELL]: 'blue-shell',
	[ITEM_MUSHROOM]: 'mushroom',
	[ITEM_STAR]: 'star',
	[ITEM_BOMB]: 'bomb',
};

/** Red and green shells have 5 frames; the blue shell is a single image. */
function getShellFrameCount(itemKind: number): number {
	return itemKind === ITEM_BLUE_SHELL ? 1 : SHELL_FRAME_COUNT;
}

function drawAnimatedShellTexture(
	ctx: CanvasRenderingContext2D,
	imageLoader: ImageLoaderFolder,
	itemKind: number,
	cx: number,
	cy: number,
	size: number,
	frame: number,
) {
	const texture = imageLoader.get(ITEM_NAMES[itemKind]);
	if (!texture || size <= 0) return;
	const dx = cx - size / 2;
	const dy = cy - size / 2;
	if (itemKind === ITEM_BLUE_SHELL) {
		ctx.drawImage(texture, dx, dy, size, size);
		return;
	}
	const image = texture as HTMLImageElement;
	const width = image.naturalWidth || (texture as HTMLCanvasElement).width || SHELL_FRAME_SIZE;
	const available = Math.max(1, Math.floor(width / SHELL_FRAME_SIZE));
	const count = Math.min(SHELL_FRAME_COUNT, available);
	const sourceFrame = ((frame % count) + count) % count;
	ctx.drawImage(
		texture,
		sourceFrame * SHELL_FRAME_SIZE, 0, SHELL_FRAME_SIZE, SHELL_FRAME_SIZE,
		dx, dy, size, size,
	);
}

/** Draw the item-box sprite sheet one frame at a time, matching the shell animation cadence. */
function drawAnimatedItemBoxTexture(
	ctx: CanvasRenderingContext2D,
	imageLoader: ImageLoaderFolder,
	cx: number,
	cy: number,
	size: number,
	frame: number,
	rotation = 0,
) {
	const texture = imageLoader.get('item-box');
	if (!texture || size <= 0) return;
	const image = texture as HTMLImageElement;
	const width = image.naturalWidth || (texture as HTMLCanvasElement).width || 0;
	const height = image.naturalHeight || (texture as HTMLCanvasElement).height || 0;
	if (width <= 0 || height <= 0) return;

	// Item-box frames are assumed to be square and laid out horizontally, like shell frames.
	const frameSize = height;
	const frameCount = Math.max(1, Math.floor(width / frameSize));
	const sourceFrame = frame % frameCount;
	const pulse = 0.9 + (Math.sin(frame * 0.35) + 1) * 0.05;
	const drawSize = size * pulse;

	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(rotation);
	ctx.globalAlpha *= 0.92;
	ctx.shadowColor = '#8ffcff';
	ctx.shadowBlur = 8 + (Math.sin(frame * 0.35) + 1) * 3;
	ctx.drawImage(
		texture,
		sourceFrame * frameSize, 0, frameSize, height,
		-drawSize / 2, -drawSize / 2, drawSize, drawSize,
	);
	ctx.restore();
}

/** Draws a single, non-animated image; optionally a procedural bomb if the texture is missing. */
function drawSprite(
	ctx: CanvasRenderingContext2D,
	imageLoader: ImageLoaderFolder,
	key: string,
	cx: number,
	cy: number,
	size: number,
	rotation: number,
	phase: number,
	bombFallback: boolean
) {
	if (size <= 0) return;
	const texture = imageLoader.get(key);
	if (!texture) {
		if (!bombFallback) return;
		ctx.save();
		ctx.translate(cx, cy + Math.sin(phase) * size * 0.018);
		ctx.rotate(rotation);
		ctx.fillStyle = "#24242b";
		ctx.strokeStyle = "#050508";
		ctx.lineWidth = Math.max(2, size * 0.06);
		ctx.beginPath();
		ctx.arc(0, 2, size * 0.36, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.strokeStyle = "#bcbcbc";
		ctx.lineWidth = Math.max(2, size * 0.08);
		ctx.beginPath();
		ctx.moveTo(size * 0.12, -size * 0.28);
		ctx.lineTo(size * 0.28, -size * 0.48);
		ctx.stroke();
		ctx.fillStyle = "#ffd54f";
		ctx.beginPath();
		ctx.arc(size * 0.31, -size * 0.51, size * 0.09, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
		return;
	}

	ctx.save();
	ctx.translate(cx, cy + Math.sin(phase) * size * 0.018);
	ctx.rotate(rotation);
	ctx.shadowColor = '#0009';
	ctx.shadowBlur = 7;
	ctx.shadowOffsetY = 4;
	ctx.drawImage(texture, -size / 2, -size / 2, size, size);
	ctx.restore();
}

/** HUD icon of an item (items/ folder, prefix `item-`, no animation). */
function drawItemTexture(
	ctx: CanvasRenderingContext2D,
	imageLoader: ImageLoaderFolder,
	item: number,
	cx: number,
	cy: number,
	size: number,
	rotation = 0,
	phase = 0
) {
	const name = ITEM_NAMES[item];
	if (!name) return;
	drawSprite(ctx, imageLoader, `item-${name}`, cx, cy, size, rotation, phase, item === ITEM_BOMB);
}

/** World sprite of a non-animated entity (entities/ folder, no prefix). */
function drawEntitySprite(
	ctx: CanvasRenderingContext2D,
	imageLoader: ImageLoaderFolder,
	name: string,
	cx: number,
	cy: number,
	size: number,
	rotation = 0,
	phase = 0
) {
	drawSprite(ctx, imageLoader, name, cx, cy, size, rotation, phase, name === 'bomb');
}

export class GMRally extends GameMode {
	static readonly types = { Player };
	static readonly DATA = { GRAVITY, WIDTH, HEIGHT, RUN_SPEED, JUMP_VELOCITY };

	readonly players: Player[];

	// Shared, authoritative match state.
	redScore = 0;
	blueScore = 0;
	levelIndex = 0;
	levelTime = 0;
	phase = PHASE_RACING;
	intermission = 0; // Absolute levelTime deadline for the 30-second post-finish grace period; zero means inactive.
	finishCount = 0;
	boxCooldowns: number[] = [];
	nextEntityId = 1;

	// The world is local and deterministic. Only dynamic game state is replicated.
	private engine: RallyEngine | null = null;
	private readonly storage: RallyStorage = { skins: [] };
	private readonly isClient: boolean;
	private readonly isAuthoritative: boolean;
	private worldBuilt = false;
	private playerIds: number[] = [];
	private worldIds: number[] = [];
	private itemBoxEntityIds: platformEngine.BlockId[] = [];
	private currentRng: GameRandomGenerator | null = null;

	private constructor(total: number, isClient: boolean, isAuthoritative: boolean, initialLevelIndex = 0) {
		super();
		this.levelIndex = normalizeLevelIndex(initialLevelIndex);
		this.boxCooldowns = this.currentLevel().items.map(() => 0);
		this.isClient = isClient;
		this.isAuthoritative = isAuthoritative;
		this.players = Array.from({ length: total }, () => new Player());

		platformEngine.createPlatformerEngine<RallyEngineData>(
			this.isClient,
			this.storage,
			this,
			{ x: 0, y: GRAVITY }
		).then(engine => {
			this.engine = engine;
			this.buildWorldOnce();
		});
	}

	/* ---------------------------- Creation ---------------------------- */

	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();
		const chosenVote = players.length > 0
			? readMapVote(players[Math.floor(Math.random() * players.length)].data)
			: -1;
		const initialLevelIndex = chosenVote >= 0 && chosenVote < LEVELS.length
			? chosenVote
			: Math.floor(Math.random() * LEVELS.length);
		const game = new GMRally(total, false, true, initialLevelIndex);

		const decode = (i: number) =>
			i < players.length
				? decodeFullMessage(StartData.decode(players[i].data))
				: generateClientDom([]);

		const infos = await Promise.all(
			game.players.map(async (_p, i) => {
				const d = decode(i);
				return { pref: (d.preferTeam ?? 0) as number };
			})
		);

		const teams = GMRally.assignTeams(infos.map(i => i.pref));
		const level = game.currentLevel();
		for (const [i, p] of game.players.entries()) {
			p.isRed = teams[i];
			p.resetForLevel(level.spawnX, level.spawnY);
		}
		game.boxCooldowns = level.items.map(() => 0);
		game.syncBlocksFromPlayers(); // handles the case where the engine finished loading first

		const data = StartDataClient.encode({
			players: game.players.map(p => ({ isRed: p.isRed })),
			selectedLevel: game.levelIndex + 1,
		}).finish();
		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		_playerIdx: number
	) {
		const { StartData, StartDataClient } = protocols.get();
		let initialLevelIndex = 0;
		if (origin === 'server') {
			const decoded = decodeFullMessage(StartDataClient.decode(data));
			const selectedLevel = Number(decoded.selectedLevel ?? 0);
			if (Number.isInteger(selectedLevel) && selectedLevel > 0) initialLevelIndex = selectedLevel - 1;
		} else {
			const localVote = readMapVote(data);
			initialLevelIndex = localVote >= 0 && localVote < LEVELS.length
				? localVote
				: Math.floor(Math.random() * LEVELS.length);
		}
		// Solo/tutorial clients are authoritative locally; multiplayer clients are not.
		const game = new GMRally(total, true, origin === 'client', initialLevelIndex);
		const clientData = new ClientData();

		if (origin === 'server') {
			const decoded = decodeFullMessage(StartDataClient.decode(data));
			game.players.forEach((p, i) => { p.isRed = decoded.players?.[i]?.isRed ?? i % 2 === 0; });
		} else {
			decodeFullMessage(StartData.decode(data));
			game.players.forEach((p, i) => { p.isRed = i % 2 === 0; });
		}

		const level = game.currentLevel();
		game.players.forEach(p => p.resetForLevel(level.spawnX, level.spawnY));
		game.boxCooldowns = level.items.map(() => 0);
		game.syncBlocksFromPlayers();
		return { game, data: clientData, html: clientData.html, skins: {} };
	}

	/** Split players into balanced teams while honouring preferences when possible. */
	private static assignTeams(prefs: number[]): boolean[] {
		const total = prefs.length;
		const maxPerTeam = Math.ceil(total / 2);
		const isRed: (boolean | undefined)[] = new Array(total).fill(undefined);
		let red = 0;
		let blue = 0;
		for (let i = 0; i < total; i++) {
			if (prefs[i] === 1 && red < maxPerTeam) { isRed[i] = true; red++; }
			else if (prefs[i] === -1 && blue < maxPerTeam) { isRed[i] = false; blue++; }
		}
		for (let i = 0; i < total; i++) {
			if (isRed[i] !== undefined) continue;
			const wantRed = red < blue || (red === blue && i % 2 === 0);
			if (wantRed && red < maxPerTeam) { isRed[i] = true; red++; }
			else { isRed[i] = false; blue++; }
		}
		return isRed as boolean[];
	}

	static readonly generateClientDom = generateClientDom;

static readonly TEXTURES = {
		"player": "/assets/games/rally/player.png",
		'platform': "/assets/games/rally/platform.png",
		'block-grass-floor': "/assets/games/rally/blocks/grass/floor.png",
		'block-grass-grass': "/assets/games/rally/blocks/grass/grass.png",
		'block-platform-full': "/assets/games/rally/blocks/platform/full.png",
		'block-platform-left': "/assets/games/rally/blocks/platform/left.png",
		'block-platform-right': "/assets/games/rally/blocks/platform/right.png",
		'block-box': "/assets/games/rally/blocks/box.png",
		'block-trampoline': "/assets/games/rally/blocks/trampoline.png",
		'block-mud': "/assets/games/rally/blocks/mud.png",
		'finish': "/assets/games/rally/blocks/finish.png",
		'background': "/assets/games/rally/background.png",

		// entities/: world sprites, no prefix. red & green shells: 16x16, 5 frames; blue shell: no animation.
		'item-box': "/assets/games/rally/entities/item-box.png",
		'banana': "/assets/games/rally/entities/banana.png",
		'green-shell': "/assets/games/rally/entities/green-shell.png",
		'red-shell': "/assets/games/rally/entities/red-shell.png",
		'blue-shell': "/assets/games/rally/entities/blue-shell.png",
		'bomb': "/assets/games/rally/entities/bomb.png",

		// items/: HUD icons, prefixed with "item-", no animation.
		'item-banana': "/assets/games/rally/items/banana.png",
		'item-green-shell': "/assets/games/rally/items/green-shell.png",
		'item-red-shell': "/assets/games/rally/items/red-shell.png",
		'item-blue-shell': "/assets/games/rally/items/blue-shell.png",
		'item-mushroom': "/assets/games/rally/items/mushroom.png",
		'item-star': "/assets/games/rally/items/star.png",
		'item-bomb': "/assets/games/rally/items/bomb.png",
	};

	/* ---------------------------- Engine / world ---------------------------- */

	override init(): void {}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	currentLevel(): LevelDef { return LEVELS[normalizeLevelIndex(this.levelIndex)]; }

	/** Build the deterministic map and player bodies exactly once per game instance. */
	private buildWorldOnce() {
		const engine = this.engine;
		if (!engine || this.worldBuilt) return;

		for (const def of this.currentLevel().platforms) {
			const block = new PlatformBlock(def);
			const sampled = samplePlatform(def, this.levelTime);
			block.x = sampled.x;
			block.y = sampled.y;
			this.worldIds.push(engine.addBlock(block, 'platform'));
		}
		for (const [i, p] of this.players.entries()) {
			const block = new PlayerBlock(i);
			block.x = p.x;
			block.y = p.y;
			block.velocity.x = p.vx;
			block.velocity.y = p.vy;
			this.playerIds.push(engine.addBlock(block, 'player'));
		}
		this.worldBuilt = true;
		this.syncBlocksFromPlayers();
		this.syncEntityBlocks();
	}

	/** Restore a snapshot into existing bodies; never remove/recreate the map. */
	private syncBlocksFromPlayers() {
		if (!this.engine || !this.worldBuilt) return;
		for (const [i, p] of this.players.entries()) {
			const block = this.engine.getBlock(this.playerIds[i]) as PlayerBlock | null;
			if (!block) continue;
			block.x = p.x;
			block.y = p.y;
			block.velocity.x = p.vx;
			block.velocity.y = p.vy;
			block.direction.dir = (p.hit || p.respawn > 0) ? 0 : p.facing * RUN_SPEED;
			block.stunned = p.hit;
			block.active = p.respawn <= 0;
		}
	}

	private getPlayerBlock(index: number): PlayerBlock | null {
		if (!this.engine || !this.worldBuilt) return null;
		return this.engine.getBlock(this.playerIds[index]) as PlayerBlock | null;
	}

private getEntitiesOf<T extends Entity>(type: abstract new (...args: any[]) => T): T[] {
		if (!this.engine) return [];
		return [...this.engine.getBlocks()].map(entry => entry.block).filter((block): block is T => block instanceof type);
	}

	private getBananas(): Banana[] { return this.getEntitiesOf(Banana); }
	private getShells(): Shell[] { return this.getEntitiesOf(Shell); }
	private getBombs(): Bomb[] { return this.getEntitiesOf(Bomb); }
	private getExplosions(): Explosion[] { return this.getEntitiesOf(Explosion); }

	/** Exposes live shell IDs to the client-side animation tracker. */
	getShellsForAnimation(): Shell[] {
		return this.getShells();
	}

	private getHazard(entityId: number): Hazard | null {
		if (!this.engine) return null;
		for (const entry of this.engine.getBlocks()) {
			if (isHazard(entry.block) && entry.block.entityId === entityId) return entry.block;
		}
		return null;
	}

	private addHazard(hazard: Hazard): void {
		if (this.engine) this.engine.addBlock(hazard, 'entity');
	}

	private removeHazard(entityId: number): void {
		if (!this.engine) return;
		for (const entry of this.engine.getBlocks()) {
			if (isHazard(entry.block) && entry.block.entityId === entityId) {
				this.engine.removeBlock(entry.id);
				return;
			}
		}
	}

	/* ---------------------------- Player hooks ---------------------------- */

	beforePlayerStep(idx: number, block: PlayerBlock, dt: number) {
		const p = this.players[idx];
		if (this.isAuthoritative && p.pendingItem !== ITEM_NONE) {
			p.itemRollTimer = Math.max(0, p.itemRollTimer - dt);
			if (p.itemRollTimer <= 0) {
				p.item = p.pendingItem;
				p.pendingItem = ITEM_NONE;
			}
		}

		if (p.itemQueued) {
			p.itemQueued = false;
			if (this.isAuthoritative && p.respawn <= 0 && !p.finished && !p.hit && p.itemRollTimer <= 0) {
				this.useItem(idx, block);
			}
		}
		// Mud limits the player's running speed unless a mushroom boost or star is active.
		block.mudVmax = -1;
		if (this.engine && p.boostTimer <= 0 && p.starTimer <= 0) {
			for (const entry of this.engine.getBlocks()) {
				if (!(entry.block instanceof PlatformBlock) || entry.block.mud < 0) continue;
				const size = entry.block.getSize();
				if (overlapsCenter(
					{ x: block.x, y: block.y + PLAYER_H / 2, w: PLAYER_W, h: 2 },
					{ x: entry.block.x, y: entry.block.y, w: size.width, h: size.height }
				)) block.mudVmax = block.mudVmax < 0 ? entry.block.mud : Math.min(block.mudVmax, entry.block.mud);
			}
		}
		p.control(block, dt);
	}

afterPlayerStep(idx: number, block: PlayerBlock, dt: number) {
		const p = this.players[idx];

		// Waiting to respawn: the player is off the map (inactive block), parked on the
		// respawn point. When the timer ends, the next frame simply puts it back on the map.
		if (p.respawn > 0) {
			block.x = p.x;
			block.y = p.y;
			block.velocity.x = 0;
			block.velocity.y = 0;
			p.vx = 0;
			p.vy = 0;
			if (this.isAuthoritative) p.respawn = Math.max(0, p.respawn - dt);
			return;
		}

		p.x = block.x;
		p.y = block.y;
		p.vx = block.velocity.x;
		p.vy = block.velocity.y;

		// A hit ends only on contact with the floor; landing discards all momentum.
		if (p.hit && block.walker.onFloor() && block.velocity.y >= 0) {
			p.hit = false;
			block.velocity.x = 0;
			block.velocity.y = 0;
			block.direction.dir = 0;
			p.vx = 0;
			p.vy = 0;
		}

		if (!this.isAuthoritative) return;

		const level = this.currentLevel();
		if (p.y > level.deathY) { this.killPlayer(idx, p, block); return; }
		// Finished players still respawn if they fall, but can no longer score another lap.
		if (p.finished) return;
		this.updateCheckpoint(p, level);
		if (p.checkpoint === level.checkpoints.length - 1 && overlapsCenter(
			{ x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H },
			{ x: level.finishX, y: -150, w: 80, h: 450 }
		)) {
			this.completeLap(idx, p, block);
			return;
		}
	}

	/**
	 * Falling in the void: the player is taken off the map (inactive) and parked on the
	 * respawn point; after RESPAWN_TIME seconds it is put back on the map right there.
	 */
	private killPlayer(_idx: number, p: Player, block: PlayerBlock) {
		const level = this.currentLevel();
		const point = p.subCheckpoint >= 0
			? level.subCheckpoints[p.subCheckpoint]
			: p.checkpoint >= 0 ? level.checkpoints[p.checkpoint] : { x: level.spawnX, y: level.spawnY };
		block.x = point.x;
		block.y = point.y;
		block.velocity.x = 0;
		block.velocity.y = 0;
		block.direction.dir = 0;
		block.active = false;
		p.x = point.x;
		p.y = point.y;
		p.vx = 0;
		p.vy = 0;
		p.facing = 1;
		p.wallBoost = 0;
		p.hit = false;
		p.jumpBuffer = 0;
		p.respawn = RESPAWN_TIME;
		p.itemQueued = false;
		p.boostTimer = 0;
		p.starTimer = 0;
	}

	/** Only the next major checkpoint can be validated, so later ones cannot be skipped. */
	private updateCheckpoint(p: Player, level: LevelDef) {
		const playerRect = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H };
		const nextCheckpoint = p.checkpoint + 1;
		if (nextCheckpoint < level.checkpoints.length) {
			const cp = level.checkpoints[nextCheckpoint];
			if (overlapsCenter(playerRect, {
				x: cp.x, y: cp.y, w: cp.w ?? 48, h: cp.h ?? 220,
			})) p.checkpoint = nextCheckpoint;
		}

		const nextSubCheckpoint = p.subCheckpoint + 1;
		if (nextSubCheckpoint < level.subCheckpoints.length) {
			const cp = level.subCheckpoints[nextSubCheckpoint];
			const prerequisite = cp.afterCheckpoint ?? -1;
			if (p.checkpoint >= prerequisite && overlapsCenter(playerRect, {
				x: cp.x, y: cp.y, w: cp.w ?? 48, h: cp.h ?? 220,
			})) p.subCheckpoint = nextSubCheckpoint;
		}
	}

	/** Count the completed lap and teleport only the player's horizontal position. */
	private completeLap(idx: number, p: Player, block: PlayerBlock) {
		const lapIndex = Math.min(p.lapsCompleted, LAP_COUNT - 1);
		const rank = this.players.reduce(
			(count, player) => count + (player.lapFinishCounts[lapIndex] >= 0 ? 1 : 0),
			0
		);
		p.lapFinishCounts[lapIndex] = rank;
		p.lapsCompleted++;
		p.finishRank = rank;
		p.points += RANK_POINTS[rank] ?? 0;
		this.finishCount++;
		this.recomputeScores();

		// Reset lap progression, but preserve movement, items, mushroom boost, and star power.
		const level = this.currentLevel();
		p.x = level.spawnX;
		block.x = level.spawnX;
		p.checkpoint = -1;
		p.subCheckpoint = -1;
		if (p.lapsCompleted >= LAP_COUNT) {
			p.finished = true;
			p.respawn = 0;
			p.finishRank = rank;
			p.finalRanking = rank;
		}
	}

	private recomputeScores() {
		this.redScore = 0;
		this.blueScore = 0;
		for (const p of this.players) {
			if (p.isRed) this.redScore += p.points;
			else this.blueScore += p.points;
		}
	}

	/** Item-box collection is triggered by Entity.detectCollision inside the engine. */
handleEntityContact(entity: Entity, playerIndex: number): void {
		if (!this.isAuthoritative || !entity.active) return;
		const player = this.players[playerIndex];
		if (!player || player.finished || player.respawn > 0) return;

		if (entity.kind === 'item-box') {
			const boxIndex = entity.sourceIndex;
			if (boxIndex < 0 || boxIndex >= this.boxCooldowns.length || this.boxCooldowns[boxIndex] > 0) return;
			if (player.item !== ITEM_NONE || player.pendingItem !== ITEM_NONE || player.itemRollTimer > 0) return;
			player.pendingItem = this.rollItem(playerIndex);
			player.itemRollTimer = ITEM_ROLL_TIME;
			this.boxCooldowns[boxIndex] = BOX_RESPAWN;
			entity.active = false;
			return;
		}
		if (entity.kind === 'explosion') return;

		const hazard = this.getHazard(entity.entityId);
		if (hazard instanceof Banana) {
			// A thrown banana cannot hit its thrower while still flying.
			if (!hazard.grounded && playerIndex === hazard.owner) return;
			this.hitPlayer(playerIndex);
			this.removeHazard(hazard.entityId);
		} else if (hazard instanceof Bomb) {
			this.explodeBomb(hazard);
		} else if (hazard instanceof BlueShell) {
			// The blue shell only reacts to its target (the race leader) and explodes at once.
			if (playerIndex !== this.findRaceLeader()) return;
			this.explodeAt(hazard.x, hazard.y, ITEM_BLUE_SHELL);
			this.removeHazard(hazard.entityId);
		} else if (hazard instanceof Shell) {
			// Shells have no owner: they hit whoever they touch.
			this.hitPlayer(playerIndex);
			this.removeHazard(hazard.entityId);
		}
	}

	/** Keep query-only Entity blocks aligned with snapshot-backed state. */
	private syncEntityBlocks() {
		const engine = this.engine;
		if (!engine || !this.worldBuilt) return;

		const level = this.currentLevel();
		for (const [i, def] of level.items.entries()) {
			let id = this.itemBoxEntityIds[i];
			let box = id === undefined ? null : engine.getBlock(id) as Entity | null;
			if (!(box instanceof Entity)) {
				box = new Entity('item-box', -(i + 1), i, BOX_SIZE);
				id = engine.addBlock(box, 'entity');
				this.itemBoxEntityIds[i] = id;
			}
			box.x = def.x;
			box.y = def.y;
			box.active = (this.boxCooldowns[i] ?? 0) <= 0;
		}

		// Hazard blocks are the source of truth; update existing blocks in place.
		for (const hazard of [...this.getBananas(), ...this.getShells(), ...this.getBombs(), ...this.getExplosions()]) hazard.active = true;
	}

	/** RNG is consumed only by the authority; the selected item is immediately shared. */
	private rollItem(playerIndex: number) {
		const rank = this.getRaceRanking().findIndex(i => i === playerIndex);
		const t = rank / Math.max(1, this.players.length - 1);

		// Relative item weights for each race position, from 1st to 6th.
		const itemWeights: [number, number[]][] = [
			[ITEM_BANANA,      [70, 10, 5, 3, 0, 0]],
			[ITEM_GREEN_SHELL, [23, 45, 10, 2, 0, 0]],
			[ITEM_RED_SHELL,   [0, 25, 33, 35, 5, 0]],
			[ITEM_MUSHROOM,    [5, 10, 20, 40, 55, 40]],
			[ITEM_STAR,        [0, 0, 2, 10, 25, 50]],
			[ITEM_BOMB,        [2, 10, 30, 5, 5, 0]],
			[ITEM_BLUE_SHELL,  [0, 0, 0, 5, 10, 0]],
		];

		// Interpolate six equally spaced samples using monotone cubic Hermite interpolation.
		const interpolate = (values: number[], x: number): number => {
			const n = values.length;
			const h = 1 / (n - 1);
			const slopes = values.slice(1).map((v, i) => (v - values[i]) / h);
			const tangents = new Array<number>(n);

			// Compute shape-preserving endpoint tangents.
			tangents[0] = slopes[0];
			tangents[n - 1] = slopes[n - 2];

			for (let i = 1; i < n - 1; i++) {
				const prev = slopes[i - 1];
				const next = slopes[i];

				// Zero tangent at extrema to prevent artificial overshoots.
				if (prev * next <= 0) {
					tangents[i] = 0;
				} else {
					tangents[i] = 2 * prev * next / (prev + next);
				}
			}

			// Locate the interval containing x.
			const segment = Math.min(n - 2, Math.floor(x / h));
			const u = (x - segment * h) / h;
			const u2 = u * u;
			const u3 = u2 * u;

			const y0 = values[segment];
			const y1 = values[segment + 1];
			const m0 = tangents[segment] * h;
			const m1 = tangents[segment + 1] * h;

			// Cubic Hermite basis functions.
			return Math.max(0,
				(2 * u3 - 3 * u2 + 1) * y0
				+ (u3 - 2 * u2 + u) * m0
				+ (-2 * u3 + 3 * u2) * y1
				+ (u3 - u2) * m1
			);
		};

		// Evaluate and normalize the relative weights.
		const weights = itemWeights.map(([item, values]) => [
			item,
			interpolate(values, t),
		] as [number, number]);

		const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
		const r = (this.currentRng ? this.currentRng() : Math.random()) * total;

		let cumulative = 0;

		for (const [item, weight] of weights) {
			cumulative += weight;
			if (r < cumulative) return item;
		}

		return ITEM_MUSHROOM;
	}

	private useItem(idx: number, _block: PlayerBlock) {
		const p = this.players[idx];
		const held = p.item;
		if (held === ITEM_NONE) return;

		switch (held) {
			case ITEM_BANANA:
				const banana = new Banana(this.nextEntityId++);
				banana.x = p.x + p.facing * (PLAYER_W * 0.8);
				banana.y = p.y;
				banana.vx = p.vx + p.facing * BANANA_SPEED;
				banana.vy = p.vy + BANANA_JUMP;
				banana.owner = idx;
				this.addHazard(banana);
				break;
			case ITEM_GREEN_SHELL:
			case ITEM_RED_SHELL:
			case ITEM_BLUE_SHELL:
				this.spawnShell(held, p);
				break;
			case ITEM_BOMB:
				this.spawnBomb(p);
				break;
			case ITEM_MUSHROOM:
				p.boostTimer = BOOST_TIME;
				break;
			case ITEM_STAR:
				p.starTimer = STAR_TIME;
				p.boostTimer = BOOST_TIME;
				break;
		}
		p.item = ITEM_NONE;
		p.pendingItem = ITEM_NONE;
		p.itemRollTimer = 0;
	}

/** Throw a bomb from in front of the player; it detonates on landing or on any player. */
	private spawnBomb(player: Player) {
		const bomb = new Bomb(this.nextEntityId++);
		bomb.x = player.x + player.facing * SPAWN_FRONT_OFFSET;
		bomb.y = player.y;
		bomb.vx = player.vx + player.facing * BOMB_SPEED;
		bomb.vy = player.vy + BANANA_JUMP;
		this.addHazard(bomb);
	}

	/** Shells spawn in front of the player so they do not touch the thrower. */
	private spawnShell(kind: number, player: Player) {
		const direction = player.facing < 0 ? -1 : 1;
		const shell: Shell = kind === ITEM_RED_SHELL ? new RedShell(this.nextEntityId++)
			: kind === ITEM_BLUE_SHELL ? new BlueShell(this.nextEntityId++)
			: new GreenShell(this.nextEntityId++);
		shell.x = player.x + direction * SPAWN_FRONT_OFFSET;
		shell.y = player.y;
		shell.vx = (kind === ITEM_BLUE_SHELL ? BLUE_SHELL_SPEED : SHELL_SPEED) * direction;
		shell.vy = 0;
		this.addHazard(shell);
	}

	getRaceRanking(_includeFinished = true, includeDisconnected = false): number[] {
		const level = this.currentLevel();

		const progress = (p: Player) => p.checkpoint * 2 + (p.subCheckpoint >= 0 ? 1 : 0);
		
		const distanceToNext = (p: Player) => {
			const next = level.checkpoints[p.checkpoint + 1];
			if (!next) return Math.abs(level.finishX - p.x);
			return Math.hypot(next.x - p.x, next.y - p.y);
		};

		const isWrongWay = (p: Player) => {
			const next = level.checkpoints[p.checkpoint + 1];
			const targetX = next ? next.x : level.finishX;
			const dx = targetX - p.x;

			// Facing is a one-dimensional direction (+1 right, -1 left), not an angle.
			return dx * p.facing < 0 ? 1 : 0;
		};

		return this.players
			.map((p, i) => i)
			// Finished players remain in the ranking so their displayed position is always valid.
			.filter(i => includeDisconnected || this.players[i].connected)
			.sort((a, b) => {
				const pa = this.players[a], pb = this.players[b];
				const aFinished = pa.finalRanking >= 0 || pa.finished;
				const bFinished = pb.finalRanking >= 0 || pb.finished;
				if (aFinished !== bFinished) return aFinished ? -1 : 1;
				if (aFinished && bFinished) {
					const aRank = pa.finalRanking >= 0 ? pa.finalRanking : pa.finishRank;
					const bRank = pb.finalRanking >= 0 ? pb.finalRanking : pb.finishRank;
					return aRank - bRank || a - b;
				}
				return (
					pb.lapsCompleted - pa.lapsCompleted ||
					progress(pb) - progress(pa) ||
					isWrongWay(pa) - isWrongWay(pb) ||
					distanceToNext(pa) - distanceToNext(pb) ||
					a - b
				);
			});
	}

	private findRaceLeader(): number {
		return this.getRaceRanking()[0] ?? -1;
	}

	/** Called by Entity.detectCollision when a banana touches a platform. */
	landBanana(id: number) {
		const banana = this.getHazard(id);
		if (!(banana instanceof Banana) || banana.grounded) return;
		banana.grounded = true;
		banana.owner = -1;
		banana.vx = 0;
		banana.vy = 0;
		banana.arming = 0;
	}

/** Detonate a bomb: it is replaced by an Explosion. */
	private explodeBomb(bomb: Bomb) {
		this.explodeAt(bomb.x, bomb.y);
		this.removeHazard(bomb.entityId);
	}

	/** Spawn an Explosion; it damages every player (thrower included) whose body is within its radius. */
	private explodeAt(x: number, y: number, itemKind = ITEM_BOMB) {
		const explosion = new Explosion(this.nextEntityId++, itemKind);
		explosion.x = x;
		explosion.y = y;
		this.addHazard(explosion);
		for (const [i, player] of this.players.entries()) {
			if (player.finished || player.respawn > 0) continue;
			const dx = Math.max(0, Math.abs(player.x - x) - PLAYER_W / 2);
			const dy = Math.max(0, Math.abs(player.y - y) - PLAYER_H / 2);
			if (Math.hypot(dx, dy) <= explosion.radius) this.hitPlayer(i);
		}
	}

	private hitPlayer(targetIndex: number): boolean {
		const target = this.players[targetIndex];
		// Star power grants temporary damage immunity.
		if (!target || target.finished || target.hit || target.starTimer > 0) return false;
		const block = this.getPlayerBlock(targetIndex);
		if (!block) return false;
		target.hit = true;
		target.jumpBuffer = 0;
		target.itemQueued = false;
		// The impulse is opposite the player's running direction.
		block.velocity.x = -target.facing * HIT_KNOCKBACK;
		block.velocity.y = -HIT_JUMP;
		block.direction.dir = 0;
		block.stunned = true;
		target.vx = block.velocity.x;
		target.vy = block.velocity.y;
		return true;
	}

	private getPlatformRects(): Array<{ x: number; y: number; w: number; h: number }> {
		if (!this.engine) return [];
		const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
		for (const entry of this.engine.getBlocks()) {
			if (entry.category !== 'platform') continue;
			const size = entry.block.getSize();
			rects.push({ x: entry.block.x, y: entry.block.y, w: size.width, h: size.height });
		}
		return rects;
	}

	private hazardIsSupported(
		hazard: { x: number; y: number },
		size: number,
		platforms: Array<{ x: number; y: number; w: number; h: number }>
	): boolean {
		const bottom = hazard.y + size / 2;
		return platforms.some(platform =>
			Math.abs(bottom - (platform.y - platform.h / 2)) <= 2.5 &&
			Math.abs(hazard.x - platform.x) * 2 < platform.w + size * 0.82
		);
	}

	/** Axis-separated platform collision for falling items and rolling shells. */
	private moveGroundHazard(
		hazard: { x: number; y: number; vx: number; vy: number },
		dt: number,
		platforms: Array<{ x: number; y: number; w: number; h: number }>,
		bounceAtWall: boolean,
		canNeverReverse: boolean
	) {
		hazard.vy = Math.min(hazard.vy + GRAVITY * dt, 1250);

		// Horizontal motion and side impacts.
		hazard.x += hazard.vx * dt;
		for (const platform of platforms) {
			if (!overlapsCenter(
				{ x: hazard.x, y: hazard.y, w: HAZARD_SIZE, h: HAZARD_SIZE }, platform
			)) continue;
			if (hazard.vx > 0) hazard.x = platform.x - platform.w / 2 - HAZARD_SIZE / 2;
			else if (hazard.vx < 0) hazard.x = platform.x + platform.w / 2 + HAZARD_SIZE / 2;
			if (canNeverReverse) {
				// The red shell keeps its launch heading and jumps high enough to
				// clear the obstacle rather than reversing at a wall.
				const obstacleTop = platform.y - platform.h / 2;
				const requiredRise = Math.max(0, hazard.y - (obstacleTop - HAZARD_SIZE / 2) + 28);
				const wallJump = Math.sqrt(2 * GRAVITY * requiredRise);
				hazard.vy = Math.min(hazard.vy, -Math.max(SHELL_JUMP_VELOCITY, wallJump));
			} else if (bounceAtWall) {
				hazard.vx = -hazard.vx * 0.88;
			} else {
				hazard.vx = 0;
			}
		}

		// Vertical motion and floor/ceiling impacts.
		hazard.y += hazard.vy * dt;
		for (const platform of platforms) {
			if (!overlapsCenter(
				{ x: hazard.x, y: hazard.y, w: HAZARD_SIZE, h: HAZARD_SIZE }, platform
			)) continue;
			if (hazard.vy >= 0) {
				hazard.y = platform.y - platform.h / 2 - HAZARD_SIZE / 2;
				hazard.vy = 0;
			} else {
				hazard.y = platform.y + platform.h / 2 + HAZARD_SIZE / 2;
				hazard.vy = 80;
			}
		}
	}

	/** Update authoritative hazards, projectile guidance, and explosion lifetimes. */
	private updateHazards(dt: number) {
		const level = this.currentLevel();
		const platforms = this.getPlatformRects();

		for (const banana of this.getBananas()) {
			banana.arming = Math.max(0, banana.arming - dt);
			if (!banana.grounded) {
				this.moveGroundHazard(banana, dt, platforms, false, false);
				if (this.hazardIsSupported(banana, HAZARD_SIZE, platforms)) this.landBanana(banana.entityId);
				if (banana.x > level.finishX) banana.x = level.spawnX;
			} else {
				banana.vx = 0;
				banana.vy = 0;
			}
		}

		for (const explosion of this.getExplosions()) {
			explosion.remaining -= dt;
			if (explosion.remaining <= 0) this.removeHazard(explosion.entityId);
		}

		// Bombs explode only after landing; side-wall contacts merely stop them.
		for (const bomb of this.getBombs()) {
			this.moveGroundHazard(bomb, dt, platforms, false, false);
			if (this.hazardIsSupported(bomb, HAZARD_SIZE, platforms)) this.explodeBomb(bomb);
		}

		const liveShells: Shell[] = [];
		for (const shell of this.getShells()) {
			// Blue shell: no terrain collision at all (no moveGroundHazard).
			if (shell.itemKind === ITEM_BLUE_SHELL) {
				const leaderIndex = this.findRaceLeader();
				const target = leaderIndex >= 0 ? this.players[leaderIndex] : undefined;
				if (target && !target.finished) {
					// Home in on the active race leader. Vertical speed is intentionally
					// unbounded; acceleration, rather than a velocity cap, smooths changes.
					const desiredVy = (target.y - shell.y) * 2.2;
					const maxDelta = BLUE_SHELL_VERTICAL_ACCEL * dt;
					shell.vy += Math.max(-maxDelta, Math.min(maxDelta, desiredVy - shell.vy));
					shell.vx = Math.sign(target.x - shell.x || 1) * BLUE_SHELL_SPEED;
				}
				shell.x += shell.vx * dt;
				shell.y += shell.vy * dt;
			} else {
				if (shell.itemKind === ITEM_RED_SHELL) {
					const direction = shell.vx < 0 ? -1 : 1;
					const target = (
						this.players
							.filter(player => !player.finished && player.connected)
							.filter(player => direction > 0 ? player.x > shell.x : player.x < shell.x)
							.sort((a, b) => direction > 0 ? a.x - b.x : b.x - a.x)[0]
							?? (direction > 0
								? this.players.filter(player => !player.finished && player.connected).sort((a, b) => a.x - b.x)[0]
								: undefined)
					);

					if (target) {
						const forwardDx = (target.x - shell.x) * direction;
						const desiredSpeed = Math.max(VX_MIN, Math.min(VX_MAX, VX_MIN + Math.max(0, forwardDx - 90) * 0.32));
						const speed = Math.abs(shell.vx);
						const nextSpeed = speed < desiredSpeed
								? Math.min(desiredSpeed, speed + RED_SHELL_ACCEL * dt)
								: Math.max(desiredSpeed, speed - RED_SHELL_ACCEL * dt);
						shell.vx = direction * Math.max(VX_MIN, Math.min(VX_MAX, nextSpeed));
						if (target.y < shell.y - 24 && this.hazardIsSupported(shell, HAZARD_SIZE, platforms)) shell.vy = -SHELL_JUMP_VELOCITY;
					}
				}

				this.moveGroundHazard(shell, dt, platforms, shell.itemKind === ITEM_GREEN_SHELL, shell.itemKind === ITEM_RED_SHELL);
				if (shell.itemKind === ITEM_RED_SHELL) {
					const sign = shell.vx < 0 ? -1 : 1;
					shell.vx = sign * Math.max(VX_MIN, Math.min(VX_MAX, Math.abs(shell.vx)));
				}
			}

			if (shell.itemKind !== ITEM_BLUE_SHELL && shell.x > level.finishX) shell.x = level.spawnX;
			liveShells.push(shell);
		}

		// Ordinary shells can collide with each other; bombs are intentionally not
		// included in this pairwise pass, and blue shells survive shell-to-shell hits.
		const brokenShells = new Set<number>();
		for (let i = 0; i < liveShells.length; i++) {
			for (let j = i + 1; j < liveShells.length; j++) {
				if (overlapsCenter(
					{ x: liveShells[i].x, y: liveShells[i].y, w: HAZARD_SIZE, h: HAZARD_SIZE },
					{ x: liveShells[j].x, y: liveShells[j].y, w: HAZARD_SIZE, h: HAZARD_SIZE }
				)) {
					if (liveShells[i].itemKind !== ITEM_BLUE_SHELL) brokenShells.add(liveShells[i].entityId);
					if (liveShells[j].itemKind !== ITEM_BLUE_SHELL) brokenShells.add(liveShells[j].entityId);
				}
			}
		}
		for (const id of brokenShells) this.removeHazard(id);
	}

	/* ---------------------------- Main loop ---------------------------- */

	override run(dt: number, produceFinish: boolean, rng: GameRandomGenerator | null): FinishGame | null {
		if (!this.engine) return null;
		this.currentRng = rng;
		if (this.phase === PHASE_RACING) this.runRacing(dt);
		this.currentRng = null;

		if (produceFinish && this.phase === PHASE_DONE) return this.produceFinish();
		return null;
	}

	private runRacing(dt: number) {
		this.levelTime += dt;
		this.boxCooldowns = this.boxCooldowns.map(c => Math.max(0, c - dt));
		this.syncEntityBlocks();
		this.engine!.update(dt);
		if (this.isAuthoritative) this.updateHazards(dt);
		this.syncEntityBlocks();

		// `intermission` stores the absolute race-clock deadline after the first finish.
		// Zero means nobody has finished yet; no countdown is displayed in the HUD.
		if (this.intermission <= 0 && this.players.some(p => p.finished)) {
			this.intermission = this.levelTime + FINISH_GRACE_TIME;
		}
		const graceExpired = this.intermission > 0 && this.levelTime >= this.intermission;
		const everyoneDone = this.players.every(p => p.finished || !p.connected);
		if (this.levelTime >= LEVEL_TIME_LIMIT || graceExpired || everyoneDone) this.phase = PHASE_DONE;
	}

	/* ---------------------------- Inputs ---------------------------- */

	/** Only modifies player state; the actual use happens in the next frame. */
	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		if (!player || player.finalRanking !== -1 || player.finished) return;
		switch (input.action) {
			case 'jump':
				player.jumpBuffer = JUMP_BUFFER;
				break;
			case 'item':
				player.itemQueued = true;
				break;
		}
	}

	override collectInputs(
		keyboard: IKeyboardController,
		_mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const inputs: Fields[] = [];

		const jump = keyboard.first('jump') ||
			(mobile !== null && mobile.first('jump'));

		const item = keyboard.first('right') ||
			(mobile !== null && mobile.first('item'));

		if (jump) inputs.push({ action: 'jump', jump: {} });
		if (item) inputs.push({ action: 'item', item: {} });
		return inputs;
	}

	/* ---------------------------- Drawing ---------------------------- */

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = false;
		const imageLoader = _imageLoader.getFolder('rally');
		const data = _data as ClientData;

		if (data.firstFrame) {
			data.firstFrame = false;
			// Team marker: magenta placeholder -> red (0) / blue (1)
			imageLoader.setColorRule('team-marker', 0, [{ prev: "#ff00ff", next: "#ff0044" }]);
			imageLoader.setColorRule('team-marker', 1, [{ prev: "#ff00ff", next: "#0044ff" }]);
		}

		data.update(this, playerIdx);

		ctx.fillStyle = "#223";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		const cam = data.camera.getCoords();
		ctx.save();
		ctx.translate(WIDTH / 2, HEIGHT / 2);
		ctx.scale(Camera.SCALE, Camera.SCALE);
		ctx.translate(-cam.x, -cam.y);

		this.drawLevel(ctx, imageLoader, data);
		this.drawPlayers(ctx, imageLoader);
		data.drawParticles(ctx);

		ctx.restore();
		data.drawItemRoulette(ctx, this, playerIdx, imageLoader);
		data.drawRacePosition(ctx, this, playerIdx);
	}

	/** Platforms, item boxes and finish line. */
	private drawLevel(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder, data: ClientData) {
		const level = this.currentLevel();
		const engine = this.engine;

		// Repeat the square finish texture vertically rather than stretching it.
		const finish = imageLoader.get('finish');
		{
			const image = finish as HTMLImageElement;
			const width = image.naturalWidth || (finish as HTMLCanvasElement).width || 0;
			const height = image.naturalHeight || (finish as HTMLCanvasElement).height || 0;
			const sourceTileSize = Math.min(width, height);
			const destinationTileSize = 64;
			const top = -300;
			const flagHeight = 1200;
			if (sourceTileSize > 0) {
				for (let offset = 0; offset < flagHeight; offset += destinationTileSize) {
					const drawHeight = Math.min(destinationTileSize, flagHeight - offset);
					const sourceHeight = sourceTileSize * drawHeight / destinationTileSize;
					ctx.drawImage(
						finish,
						0, 0, sourceTileSize, sourceHeight,
						level.finishX - destinationTileSize / 2, top + offset,
						destinationTileSize, drawHeight
					);
				}
			}
		}


		// Draw terrain as 32-pixel tiles, preserving each skin's edge rules.
		if (engine) {
			for (const entry of engine.getBlocks()) {
				if (!(entry.block instanceof PlatformBlock)) continue;
				const block = entry.block;
				const { width, height } = block.getSize();
				const left = block.x - width / 2;
				const top = block.y - height / 2;
				const columns = Math.ceil(width / GRID_SIZE);
				const rows = Math.ceil(height / GRID_SIZE);
				const skin = block.def.skin ?? 'grass';
				for (let row = 0; row < rows; row++) {
					for (let column = 0; column < columns; column++) {
						const x = left + column * GRID_SIZE;
						const y = top + row * GRID_SIZE;
						const tileW = Math.min(GRID_SIZE, width - column * GRID_SIZE);
						const tileH = Math.min(GRID_SIZE, height - row * GRID_SIZE);
						let key: string;
						if (skin === 'grass') key = row === 0 ? 'block-grass-floor' : 'block-grass-grass';
						else if (skin === 'platform') key = row === rows - 1 && column === 0 ? 'block-platform-left' : row === rows - 1 && column === columns - 1 ? 'block-platform-right' : 'block-platform-full';
						else if (skin === 'vertical-trampoline' || skin === 'horizontal-trampoline') key = 'block-trampoline';
						else if (skin === 'mud') key = 'block-mud';
						else key = 'block-box';
						const texture = imageLoader.get(key);
						if (texture) {
							if (skin === 'horizontal-trampoline') {
								ctx.save(); ctx.translate(x + tileW / 2, y + tileH / 2); ctx.scale(-1, 1);
								ctx.drawImage(texture, -tileW / 2, -tileH / 2, tileW, tileH); ctx.restore();
							} else ctx.drawImage(texture, x, y, tileW, tileH);
						} else { ctx.fillStyle = '#556'; ctx.fillRect(x, y, tileW, tileH); }
					}
				}
			}
		}

		// Cycle through the item-box sprite-sheet frames, using the same timing approach as red shells.
		for (const [i, b] of level.items.entries()) {
			if (this.boxCooldowns[i] > 0) continue;
			const phase = this.levelTime * 2.8 + i * 1.17;
			const bob = Math.sin(phase) * 2.5;
			const rotation = Math.sin(phase * 0.72) * 0.06;
			const frame = Math.floor((this.levelTime + i * 0.07) / SHELL_FRAME_DELAY);
			drawAnimatedItemBoxTexture(ctx, imageLoader, b.x, b.y + bob, BOX_SIZE, frame, rotation);
		}

		// Hazards: world sprites come from the entities folder.
		for (const banana of this.getBananas()) {
			const tilt = Math.max(-0.45, Math.min(0.45, banana.vy * 0.00045));
			drawEntitySprite(ctx, imageLoader, 'banana', banana.x, banana.y, 42, tilt, this.levelTime * 2.2);
		}
		for (const bomb of this.getBombs()) {
			drawEntitySprite(ctx, imageLoader, 'bomb', bomb.x, bomb.y, 42, 0, this.levelTime * 2.5);
		}
		for (const shell of this.getShells()) {
			drawAnimatedShellTexture(ctx, imageLoader, shell.itemKind, shell.x, shell.y, 40, data.getShellFrame(shell.entityId));
		}

		// Render item-specific blasts with a hot core, an expanding shockwave, and jagged flame.
		for (const explosion of this.getExplosions()) {
			const progress = Math.max(0, Math.min(1, 1 - explosion.remaining / EXPLOSION_DURATION));
			const easeOut = 1 - Math.pow(1 - progress, 2.2);
			const radius = explosion.radius * (0.2 + 0.8 * easeOut);
			const blue = explosion.itemKind === ITEM_BLUE_SHELL;
			const outer = blue ? "#168bff" : "#ff351f";
			const middle = blue ? "#58f4ff" : "#ff9a18";
			const core = blue ? "#f2ffff" : "#fff6b0";
			const alpha = Math.max(0, 1 - progress);
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.globalCompositeOperation = "lighter";

			// Soft bloom keeps the blast visible without hiding the level.
			const glow = ctx.createRadialGradient(explosion.x, explosion.y, radius * 0.04, explosion.x, explosion.y, radius);
			glow.addColorStop(0, core);
			glow.addColorStop(0.22, middle);
			glow.addColorStop(0.62, outer);
			glow.addColorStop(1, `${outer}00`);
			ctx.fillStyle = glow;
			ctx.beginPath();
			ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
			ctx.fill();

			// Draw an irregular flame silhouette for a more explosive shape.
			const spikes = 28;
			ctx.beginPath();
			for (let i = 0; i < spikes * 2; i++) {
				const angle = (i / (spikes * 2)) * Math.PI * 2 + progress * 0.7;
				const r = radius * (i % 2 === 0 ? 0.88 : 0.58) * (0.92 + 0.08 * Math.sin(i * 2.7));
				const px = explosion.x + Math.cos(angle) * r;
				const py = explosion.y + Math.sin(angle) * r;
				if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
			}
			ctx.closePath();
			ctx.fillStyle = middle;
			ctx.fill();

			// The bright inner core contracts as the shockwave expands.
			ctx.globalAlpha = alpha * 0.95;
			ctx.fillStyle = core;
			ctx.beginPath();
			ctx.arc(explosion.x, explosion.y, radius * (0.12 + 0.12 * (1 - progress)), 0, Math.PI * 2);
			ctx.fill();

			// A crisp ring makes the expanding impact readable at a glance.
			ctx.globalAlpha = alpha * 0.8;
			ctx.strokeStyle = blue ? "#b9fbff" : "#fff0a0";
			ctx.lineWidth = Math.max(3, radius * 0.035);
			ctx.beginPath();
			ctx.arc(explosion.x, explosion.y, radius * (0.72 + progress * 0.2), 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		}
	}

	/** Player sprites and team markers. */
	private drawPlayers(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		const engine = this.engine;
		if (!engine) return;
		for (const [i, p] of this.players.entries()) {
			const id = this.playerIds[i];
			if (p.respawn > 0) continue; // off the map while waiting to respawn
			const block = engine.getBlock(id);
			if (!block) continue;

			// Star power applies a cycling rainbow hue to the entire player sprite.
			ctx.save();
			if (p.starTimer > 0) {
				ctx.filter = `hue-rotate(${Math.floor((this.levelTime * 240) % 360)}deg) saturate(2)`;
			}
			engine.getAnimator(id)?.draw(block, ctx, imageLoader);
			ctx.restore();
		}
	}

	/* ---------------------------- Misc ---------------------------- */

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override getSize() {
		return { width: WIDTH, height: HEIGHT };
	}

	/** No mouse in this game: coordinates are returned untouched. */
	override evalMouseCoords(x: number, y: number, _playerIdx: number, _clientData: any) {
		return { x, y };
	}

	override getMobileDesc(): MobileDescriptor {
		return {
			joysticks: {},
			buttons: {
				jump: { x: 180, xp: 'left', y: 180, yp: 'bottom', size: 120, color: "#44aaff" },
				item: { x: 180, xp: 'right', y: 180, yp: 'bottom', size: 120, color: "#ffaa00" },			}
		};
	}

	override createTutorial() {
		return new TutorialData();
	}

	/* ---------------------------- Save / load ---------------------------- */

	/** Copies the live block state into Player so the snapshot is complete. */
	private syncPlayersFromBlocks() {
		if (!this.engine || !this.worldBuilt) return;
		for (const [i, p] of this.players.entries()) {
			const block = this.engine.getBlock(this.playerIds[i]) as PlayerBlock | null;
			if (!block) continue;
			p.x = block.x; p.y = block.y;
			p.vx = block.velocity.x; p.vy = block.velocity.y;
		}
	}

	override save(): Uint8Array {
		const { State } = protocols.get();
		this.syncPlayersFromBlocks();
		const object: Fields = {
			players: this.players.map(p => p.save()),
			levelIndex: this.levelIndex,
			levelTime: this.levelTime,
			phase: this.phase,
			intermission: this.intermission,
			redScore: this.redScore,
			blueScore: this.blueScore,
			finishCount: this.finishCount,
			boxCooldowns: this.boxCooldowns,
			bananas: this.getBananas().map(banana => banana.save()),
			shells: this.getShells().map(shell => shell.save()),
			bombs: this.getBombs().map(bomb => bomb.save()),
			explosions: this.getExplosions().map(explosion => explosion.save()),
			nextEntityId: this.nextEntityId,
		};
		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = State.decode(data);

		for (let i = 0; i < obj.players.length; i++) {
			this.players[i].load(obj.players[i]);
		}
		this.levelIndex = normalizeLevelIndex(obj.levelIndex ?? this.levelIndex);
		this.levelTime = obj.levelTime ?? 0;
		this.phase = obj.phase ?? PHASE_RACING;
		this.intermission = obj.intermission ?? 0;
		this.redScore = obj.redScore ?? 0;
		this.blueScore = obj.blueScore ?? 0;
		this.finishCount = obj.finishCount ?? 0;
		this.boxCooldowns = [...(obj.boxCooldowns ?? this.currentLevel().items.map(() => 0))];

		// Reconcile entities by stable ID: reuse a block when its class matches, otherwise recreate it.
		const existing = new Map<number, Hazard>();
		if (this.engine) {
			for (const entry of this.engine.getBlocks()) {
				if (isHazard(entry.block)) existing.set(entry.block.entityId, entry.block);
			}
		}
		const incoming = new Map<number, { create: () => Hazard; matches: (b: Hazard) => boolean; state: any }>();
		for (const state of obj.bananas ?? []) {
			incoming.set(state.id, { create: () => new Banana(state.id), matches: b => b instanceof Banana, state });
		}
		for (const state of obj.shells ?? []) {
			const kind = state.red ? ITEM_RED_SHELL : state.blue ? ITEM_BLUE_SHELL : ITEM_GREEN_SHELL;
			incoming.set(state.id, {
				create: () => kind === ITEM_RED_SHELL ? new RedShell(state.id)
					: kind === ITEM_BLUE_SHELL ? new BlueShell(state.id) : new GreenShell(state.id),
				matches: b => b instanceof Shell && b.itemKind === kind,
				state,
			});
		}
		for (const state of obj.bombs ?? []) {
			incoming.set(state.id, { create: () => new Bomb(state.id), matches: b => b instanceof Bomb, state });
		}
		for (const state of obj.explosions ?? []) {
			incoming.set(state.id, { create: () => new Explosion(state.id, state.itemKind), matches: b => b instanceof Explosion, state });
		}

		for (const id of existing.keys()) {
			if (!incoming.has(id)) this.removeHazard(id);
		}
		for (const [id, entry] of incoming) {
			let block = existing.get(id);
			if (!block || !entry.matches(block)) {
				if (block) this.removeHazard(id);
				block = entry.create();
				this.addHazard(block);
			}
			block.load(entry.state);
		}

		this.nextEntityId = obj.nextEntityId ?? 1;

		// Keep local block IDs and static platforms intact; restore bodies and boxes.
		this.syncBlocksFromPlayers();
		this.syncEntityBlocks();
	}

	/* ---------------------------- Results ---------------------------- */

	/** Build the final team/player standings from the authoritative race ranking. */
	private produceFinish(): FinishGame {
		const ranking = this.getRaceRanking(true, true);
		const rankByPlayer = new Map<number, number>(ranking.map((playerIndex, rank) => [playerIndex, rank]));
		const groups = [true, false].map(isRed => {
			const members = this.players
				.map((p, i) => ({ p, i }))
				.filter(member => member.p.isRed === isRed)
				.sort((a, b) => (rankByPlayer.get(a.i) ?? Number.MAX_SAFE_INTEGER) - (rankByPlayer.get(b.i) ?? Number.MAX_SAFE_INTEGER) || a.i - b.i);
			const ranks = members.map(member => rankByPlayer.get(member.i) ?? ranking.length + member.i);
			// A lower average finishing position is the stronger team result.
			const score = ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : Number.POSITIVE_INFINITY;
			const bestRank = ranks.length ? Math.min(...ranks) : Number.POSITIVE_INFINITY;
			return { members, score, bestRank };
		}).sort((a, b) => a.score - b.score || a.bestRank - b.bestRank);

		const results = groups.map(group => group.members.map(member => member.i));
		const teamEqualities: number[] = [];
		for (let i = 0; i + 1 < groups.length; i++) {
			if (Math.abs(groups[i].score - groups[i + 1].score) < 1e-9) teamEqualities.push(i);
		}

		// Equality indexes refer to adjacent positions in the flattened results list.
		// Race ties use the same progress, wrong-way, and distance fields as the ranking.
		const sameRaceStanding = (aIndex: number, bIndex: number): boolean => {
			const a = this.players[aIndex];
			const b = this.players[bIndex];
			if (a.finalRanking !== -1 || b.finalRanking !== -1 || a.finished || b.finished) {
				return (a.finalRanking !== -1 || a.finished) && (b.finalRanking !== -1 || b.finished) &&
					(a.finalRanking !== -1 ? a.finalRanking : a.finishRank) === (b.finalRanking !== -1 ? b.finalRanking : b.finishRank);
			}
			const progress = (player: Player) => player.checkpoint * 2 + (player.subCheckpoint >= 0 ? 1 : 0);
			const distance = (player: Player) => {
				const next = this.currentLevel().checkpoints[player.checkpoint + 1];
				return next ? Math.hypot(next.x - player.x, next.y - player.y) : Math.abs(this.currentLevel().finishX - player.x);
			};
			const wrongWay = (player: Player) => {
				const next = this.currentLevel().checkpoints[player.checkpoint + 1];
				const targetX = next ? next.x : this.currentLevel().finishX;
				return (targetX - player.x) * player.facing < 0 ? 1 : 0;
			};
			return a.lapsCompleted === b.lapsCompleted &&
				progress(a) === progress(b) &&
				wrongWay(a) === wrongWay(b) &&
				Math.abs(distance(a) - distance(b)) < 1e-3;
		};
		const playerEqualities: number[] = [];
		let flattenedOffset = 0;
		for (const group of groups) {
			for (let i = 0; i + 1 < group.members.length; i++) {
				if (sameRaceStanding(group.members[i].i, group.members[i + 1].i)) {
					playerEqualities.push(flattenedOffset + i);
				}
			}
			flattenedOffset += group.members.length;
		}

		return { results, teamEqualities, playerEqualities };
	}
}

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

// Items. Items are selected by the authoritative simulation when a box is
// collected, but are only handed to the player after ITEM_ROLL_TIME.
const BOX_RESPAWN = 6;
const BOX_SIZE = 56;
const ITEM_ROLL_TIME = 1.8;
const BOOST_TIME = 2;
const BOOST_MULT = 1.6;
const STAR_TIME = 5;
const BANANA_LIFETIME = 14;
const SHELL_LIFETIME = 6;
const SHELL_SPEED = 820;
// Red shells always travel in their launch direction. Target distance only
// changes their speed; these bounds guarantee they never stop or reverse.
const VX_MIN = SHELL_SPEED * 0.72;
const VX_MAX = SHELL_SPEED * 1.35;
const RED_SHELL_ACCEL = 760;
const SHELL_JUMP_VELOCITY = 560;
const BLUE_SHELL_SPEED = SHELL_SPEED * 1.08;
const HAZARD_SIZE = 30;
const HIT_KNOCKBACK = 560;
const HIT_JUMP = 640;

// Match flow: one predefined map, three laps.
const RESPAWN_TIME = 1;
const LAP_COUNT = 3;
const LEVEL_TIME_LIMIT = 180;
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

interface PlatformDef {
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

/** The map is static and known to all peers; it is never sent in snapshots. */
const LEVELS: LevelDef[] = [
	{
		name: "Warm-up",
		spawnX: 0, spawnY: 380,
		finishX: 3000, deathY: 900,
		platforms: [
			{ x: 700, y: 525, w: 1800, h: 150 },
			{ x: 1000, y: 400, w: 40, h: 100 },
			{ x: 1750, y: 470, w: 150, h: 30, move: { ax: 0, ay: 60, period: 3, phase: 0 } },
			{ x: 2400, y: 525, w: 1000, h: 150 },
			{ x: 2150, y: 0, w: 40, h: 500 },
			{ x: 2450, y: 125, w: 40, h: 650 },
			{ x: 2800, y: -150, w: 600, h: 40 },
		],
		items: [{ x: 1300, y: 380 }, { x: 2300, y: 380 }],
		checkpoints: [{ x: 1950, y: 380, w: 70, h: 500 }],
		subCheckpoints: [{ x: 2600, y: 380, w: 70, h: 500, afterCheckpoint: 0 }],
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
	IDLE = 0,
	RUNNING = 1,
	JUMPING = 2,
	FALLING = 3,
	WALL_SLIDE = 4,
	WALL_JUMP = 5,
	STUNNED = 6,
}

class RallyAnimator extends platformEngine.Animator {
	static readonly ANIMATION_LINES = {
		[RallyAnimatorState.IDLE]: { delay: 0.2, count: 6 },
		[RallyAnimatorState.RUNNING]: { delay: 0.1, count: 8 },
		[RallyAnimatorState.JUMPING]: { delay: 0.2, count: 4 },
		[RallyAnimatorState.FALLING]: { delay: 0.2, count: 4 },
		[RallyAnimatorState.WALL_SLIDE]: { delay: 0.2, count: 4 },
		[RallyAnimatorState.WALL_JUMP]: { delay: 0.2, count: 4 },
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
		if (!grounded && b.wallJumping) return to(S.WALL_JUMP);
		if (!grounded && b.wallSliding) return to(S.WALL_SLIDE);
		if (!grounded) return b.velocity.y < -35 ? to(S.JUMPING) : to(S.FALLING);
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

/**
 * Engine block of a player. It holds the live physical state (position, velocity);
 * Player copies it back every frame so everything can be saved.
 */
class PlayerBlock extends platformEngine.Block<ClientData, RallyEngineData> {
	readonly velocity = { x: 0, y: 0 };
	readonly direction = { dir: 0, acc: RUN_ACC, softDec: RUN_SOFT_DEC, hardDec: RUN_HARD_DEC };
	readonly walker = new Walker();
	readonly effects = new platformEngine.VelocityEffectHandler();

	// Display-only flags (read by the animator)
	wallSliding = false;
	wallJumping = false;
	stunned = false;

	constructor(readonly index: number) {
		super();
	}

	getSize() { return { width: PLAYER_W, height: PLAYER_H }; }
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
		return other.category !== 'player';
	}

	processBeforeEngine(_id: number, dt: number, engine: RallyEngine) {
		const player = engine.game.players[this.index];
		if (!player.finished && player.respawn <= 0) this.velocity.y += dt * GRAVITY;
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

	constructor(readonly def: PlatformDef) {
		super();
		this.x = def.x;
		this.y = def.y;
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
	points = 0;

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
		this.item = ITEM_NONE;
		this.pendingItem = ITEM_NONE;
		this.itemRollTimer = 0;
		this.itemQueued = false;
		// A lap wrap is not a death respawn: keep the player visible and active.
		this.respawn = 0;
		this.checkpoint = -1;
		this.subCheckpoint = -1;
		this.hit = false;
		this.finished = false;
		this.finishRank = -1;
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
		block.stunned = this.hit;

		if (this.respawn > 0 || this.hit || this.finished) {
			block.direction.dir = 0;
			this.jumpBuffer = 0;
			this.itemQueued = false;
			if (this.respawn > 0) this.freeze(block);
			return;
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
		if (this.boostTimer > 0) speed *= BOOST_MULT;
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
			finishRank: this.finishRank, points: this.points,
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
		this.finishRank = obj.finishRank ?? -1; this.points = obj.points ?? 0;
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
	readonly levelName: HTMLDivElement;
	readonly time: HTMLDivElement;
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;
	readonly item: HTMLDivElement;
	readonly itemCanvas: HTMLCanvasElement;
	readonly banner: HTMLDivElement;

	readonly camera = new Camera();
	private lastLevel = -1;
	private lastRespawn = 0;
	private lastX = Number.NaN;
	private lastY = Number.NaN;
	private wasRollingItem = false;
	private revealUntil = 0;
	private revealItem = ITEM_NONE;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-rally-root");
		this.html.style.pointerEvents = "none";
		this.html.style.position = "absolute";
		this.html.style.inset = "0";
		this.html.style.width = "100%";
		this.html.style.height = "100%";

		this.levelName = document.createElement("div");
		this.levelName.classList.add("game-rally-level");

		this.time = document.createElement("div");
		this.time.classList.add("game-rally-time");

		const scores = document.createElement("div");
		scores.classList.add("game-rally-scores");
		this.redScore = document.createElement("div");
		this.blueScore = document.createElement("div");
		this.redScore.classList.add("game-rally-red-score");
		this.blueScore.classList.add("game-rally-blue-score");
		const dash = document.createElement("div");
		dash.textContent = "-";
		scores.append(this.redScore, dash, this.blueScore);

		// Item roulette is a real HUD panel, fixed to the top of the screen.
		// No floating item/name is drawn over the player's head anymore.
		this.item = document.createElement("div");
		this.item.classList.add("game-rally-item");
		this.item.setAttribute("aria-label", "Item roulette");
		this.item.style.cssText = [
			"position:absolute", "top:14px", "right:24px", "left:auto", "transform:none",
			"width:156px", "height:156px", "padding:7px", "display:none", "align-items:center",
			"justify-content:center", "box-sizing:border-box", "border-radius:18px",
			"background:linear-gradient(145deg,#f8ffff 0%,#9fb9d5 38%,#455d82 100%)",
			"border:2px solid #253a5a", "box-shadow:0 0 0 3px #e4f2ff,0 8px 24px #0008,inset 0 2px 2px #fff",
			"z-index:100", "pointer-events:none"
		].join(";");
		const viewport = document.createElement("div");
		viewport.style.cssText = [
			"position:relative", "width:100%", "height:100%", "overflow:hidden", "border-radius:10px",
			"background:radial-gradient(ellipse at 45% 25%,#426fa4 0%,#193158 72%)",
			"box-shadow:inset 0 0 16px #000a,0 0 0 1px #11213c"
		].join(";");
		this.itemCanvas = document.createElement("canvas");
		this.itemCanvas.width = 142;
		this.itemCanvas.height = 142;
		this.itemCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
		viewport.append(this.itemCanvas);
		const shine = document.createElement("div");
		shine.style.cssText = "position:absolute;inset:0;pointer-events:none;background:linear-gradient(125deg,#ffffff2b 0%,transparent 38%,transparent 68%,#ffffff10 100%);";
		viewport.append(shine);
		this.item.append(viewport);

		this.banner = document.createElement("div");
		this.banner.classList.add("game-rally-banner");

		this.html.append(scores, this.levelName, this.time, this.item, this.banner);
	}

	static showTime(time: number) {
		const t = Math.max(0, time);
		const minutes = Math.floor(t / 60);
		const seconds = (t % 60).toFixed(1);
		return `${minutes}:${seconds.padStart(4, "0")}`;
	}

	private updateItemRoulette(game: GMRally, playerIdx: number) {
		const player = game.players[playerIdx];
		const rolling = player.itemRollTimer > 0 && player.pendingItem !== ITEM_NONE;
		const heldItem = rolling ? ITEM_NONE : player.item;
		this.item.style.display = rolling || heldItem !== ITEM_NONE ? "flex" : "none";

		if (this.wasRollingItem && !rolling) {
			this.revealItem = player.item;
			this.revealUntil = game.levelTime + 0.42;
		}
		if (rolling) this.revealItem = ITEM_NONE;
		this.wasRollingItem = rolling;

		const ctx = this.itemCanvas.getContext("2d");
		if (!ctx) return;
		const w = this.itemCanvas.width;
		const h = this.itemCanvas.height;
		ctx.clearRect(0, 0, w, h);
		const rouletteItems = [ITEM_BANANA, ITEM_GREEN_SHELL, ITEM_RED_SHELL, ITEM_BLUE_SHELL, ITEM_MUSHROOM, ITEM_STAR];

		if (rolling) {
			const progress = Math.max(0, Math.min(1, 1 - player.itemRollTimer / ITEM_ROLL_TIME));
			const eased = 1 - Math.pow(1 - progress, 4.2);
			const winnerIndex = 48 + (player.pendingItem * 3 % 6);
			const reelPosition = eased * winnerIndex;
			const cell = 78;
			const center = h / 2;

			// Highlighted selection window, while the icon strip decelerates.
			ctx.save();
			ctx.fillStyle = "#8fcaff18";
			ctx.fillRect(3, center - cell / 2, w - 6, cell);
			ctx.strokeStyle = "#e5f4ffb5";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(7, center - cell / 2);
			ctx.lineTo(w - 7, center - cell / 2);
			ctx.moveTo(7, center + cell / 2);
			ctx.lineTo(w - 7, center + cell / 2);
			ctx.stroke();
			ctx.restore();

			const first = Math.floor(reelPosition);
			for (let offset = -2; offset <= 2; offset++) {
				const index = first + offset;
				const item = index === winnerIndex
					? player.pendingItem
					: rouletteItems[((index * 7 + Math.floor(index / 3) * 5) % rouletteItems.length + rouletteItems.length) % rouletteItems.length];
				const y = center + (index - reelPosition) * cell;
				if (y < -cell || y > h + cell) continue;
				const distance = Math.abs(y - center) / cell;
				const scale = 1 - Math.min(0.25, distance * 0.14);
				drawItemTexture(ctx, item, w / 2, y, 58 * scale, 0, game.levelTime * 3 + index * 0.2);
			}
			return;
		}

		const item = heldItem !== ITEM_NONE ? heldItem : this.revealItem;
		if (item === ITEM_NONE) return;
		let scale = 1;
		let rotation = 0;
		if (game.levelTime < this.revealUntil) {
			const t = Math.max(0, Math.min(1, 1 - (this.revealUntil - game.levelTime) / 0.42));
			// A quick overshoot and settle, like a prize reveal.
			if (t < 0.72) {
				const q = t / 0.72;
				scale = 0.52 + 0.63 * (1 - Math.pow(1 - q, 2));
				rotation = -0.28 * (1 - q);
			} else {
				const q = (t - 0.72) / 0.28;
				scale = 1.15 - 0.15 * q;
				rotation = 0.05 * (1 - q);
			}
		} else if (heldItem !== ITEM_NONE) {
			scale = 1 + Math.sin(game.levelTime * 4) * 0.025;
		}
		drawItemTexture(ctx, item, w / 2, h / 2, 86 * scale, rotation, game.levelTime * 2);
	}

	/** Refreshes the HTML overlay and the camera for this frame. */
	update(game: GMRally, playerIdx: number) {
		const level = game.currentLevel();
		this.levelName.innerText = `${Math.min(game.players[playerIdx].lapsCompleted + 1, LAP_COUNT)}/${LAP_COUNT} - ${level.name}`;
		this.time.innerText = ClientData.showTime(LEVEL_TIME_LIMIT - game.levelTime);
		this.redScore.innerText = String(game.redScore).padStart(2, "0");
		this.blueScore.innerText = String(game.blueScore).padStart(2, "0");
		this.updateItemRoulette(game, playerIdx);

		const player = game.players[playerIdx];
		this.banner.innerText = player.finished
			? `Finished · ${player.lapsCompleted}/${LAP_COUNT} laps (#${player.finishRank + 1})`
			: game.phase === PHASE_DONE ? "Race finished" : "";

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

		this.camera.update(player.x, player.y, player.facing, 1 / 60);
	}
}

class TutorialData {
	constructor(private readonly game: GMRally) {}

	/** Returns the text to show, or "" for none. */
	frame(_dt: number, _clock: number) {
		const player = this.game.players[0];
		if (player.finished) return "";
		return "Jump over obstacles. Slide on walls, then jump to wall-jump!";
	}
}

/* -------------------------------------------------------------------------- */
/* DOM / skins                                                                */
/* -------------------------------------------------------------------------- */

function generateClientDom(unlockedSkins: string[]) {
	return {
		preferTeam: 0,
		unlockedSkins,

		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({
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
	return `/assets/games/rally/skins/${id}/grid.png`;
}

function getSkinIconPath(id: string) {
	return window.IMG_ROOT_PATH + `/assets/games/rally/skins/${id}/icon.png`;
}

/* -------------------------------------------------------------------------- */
/* Game mode                                                                  */
/* -------------------------------------------------------------------------- */

interface BananaState {
	id: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	owner: number;
	life: number;
	arming: number;
}

interface ShellState {
	id: number;
	kind: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	owner: number;
	target: number;
	life: number;
}

/** Draws shaded, game-style item textures without platform-dependent emoji glyphs. */
function drawItemTexture(
	ctx: CanvasRenderingContext2D,
	item: number,
	cx: number,
	cy: number,
	size: number,
	rotation = 0,
	phase = 0
) {
	if (item === ITEM_NONE || size <= 0) return;
	ctx.save();
	ctx.translate(cx, cy + Math.sin(phase) * size * 0.018);
	ctx.rotate(rotation);
	ctx.scale(size / 100, size / 100);
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.shadowColor = "#0009";
	ctx.shadowBlur = 7;
	ctx.shadowOffsetY = 5;

	if (item === ITEM_BANANA) {
		const body = ctx.createLinearGradient(-34, -34, 30, 30);
		body.addColorStop(0, "#fff59a");
		body.addColorStop(0.22, "#ffe64b");
		body.addColorStop(0.58, "#ffbf13");
		body.addColorStop(0.83, "#e88a08");
		body.addColorStop(1, "#a85708");
		ctx.beginPath();
		ctx.moveTo(-31, -31);
		ctx.bezierCurveTo(-9, -41, 20, -18, 18, 7);
		ctx.bezierCurveTo(17, 23, 7, 34, -8, 33);
		ctx.bezierCurveTo(2, 20, 5, 9, -3, -2);
		ctx.bezierCurveTo(-10, -15, -21, -18, -31, -12);
		ctx.bezierCurveTo(-37, -16, -38, -25, -31, -31);
		ctx.closePath();
		ctx.fillStyle = body;
		ctx.fill();
		ctx.shadowColor = "transparent";
		ctx.strokeStyle = "#8c4c0b";
		ctx.lineWidth = 4.5;
		ctx.stroke();
		ctx.fillStyle = "#6d3710";
		ctx.beginPath(); ctx.roundRect(-35, -33, 12, 9, 3); ctx.fill();
		ctx.beginPath(); ctx.roundRect(-13, 27, 13, 9, 3); ctx.fill();
		ctx.strokeStyle = "#fff7b4";
		ctx.lineWidth = 3;
		ctx.beginPath(); ctx.moveTo(-23, -25); ctx.bezierCurveTo(-5, -29, 9, -10, 10, 3); ctx.stroke();
		ctx.strokeStyle = "#d88a0a";
		ctx.lineWidth = 2;
		ctx.beginPath(); ctx.moveTo(-7, 9); ctx.quadraticCurveTo(-5, 20, -14, 27); ctx.stroke();
	} else if (item === ITEM_GREEN_SHELL || item === ITEM_RED_SHELL || item === ITEM_BLUE_SHELL) {
		const palette = item === ITEM_GREEN_SHELL
			? ["#d9ff9d", "#58c92b", "#208027", "#0c3e22"]
			: item === ITEM_RED_SHELL
				? ["#ffb8a8", "#f33c35", "#b90f27", "#5e1024"]
				: ["#d5f4ff", "#4bc8ff", "#1761d0", "#102b73"];
			const shell = ctx.createLinearGradient(-22, -35, 27, 32);
			shell.addColorStop(0, palette[0]);
			shell.addColorStop(0.28, palette[1]);
			shell.addColorStop(0.7, palette[2]);
			shell.addColorStop(1, palette[3]);
			ctx.beginPath();
			ctx.moveTo(-38, 17);
			ctx.quadraticCurveTo(-43, 10, -34, 1);
			ctx.lineTo(-29, -15);
			ctx.quadraticCurveTo(-22, -34, 0, -36);
			ctx.quadraticCurveTo(24, -35, 31, -13);
			ctx.lineTo(38, 10);
			ctx.quadraticCurveTo(42, 19, 29, 23);
			ctx.lineTo(-28, 23);
			ctx.quadraticCurveTo(-38, 23, -38, 17);
			ctx.closePath();
			ctx.fillStyle = shell; ctx.fill();
			ctx.shadowColor = "transparent";
			ctx.strokeStyle = palette[3]; ctx.lineWidth = 5; ctx.stroke();
			ctx.fillStyle = palette[1];
			ctx.beginPath();
			ctx.moveTo(-22, 12); ctx.lineTo(-25, -6); ctx.lineTo(-12, -25);
			ctx.lineTo(9, -26); ctx.lineTo(25, -8); ctx.lineTo(21, 12); ctx.closePath();
			ctx.fill();
			ctx.strokeStyle = palette[3]; ctx.lineWidth = 2.5; ctx.stroke();
			ctx.beginPath(); ctx.moveTo(-25, -6); ctx.lineTo(-12, -2); ctx.lineTo(-12, -25);
			ctx.moveTo(9, -26); ctx.lineTo(7, -2); ctx.lineTo(25, -8);
			ctx.moveTo(-12, -2); ctx.lineTo(7, -2); ctx.lineTo(21, 12);
			ctx.stroke();
			ctx.fillStyle = "#ffffff70";
			ctx.beginPath(); ctx.ellipse(-12, -22, 8, 4, -0.55, 0, Math.PI * 2); ctx.fill();
			ctx.fillStyle = palette[3];
			for (const x of [-23, -8, 8, 23]) {
				ctx.beginPath(); ctx.ellipse(x, 20, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
			}
	} else if (item === ITEM_MUSHROOM) {
		const stem = ctx.createLinearGradient(-10, 1, 15, 36);
		stem.addColorStop(0, "#fffef0"); stem.addColorStop(0.5, "#e8e2cb"); stem.addColorStop(1, "#aaa28c");
		ctx.beginPath(); ctx.moveTo(-17, -1); ctx.lineTo(17, -1); ctx.lineTo(20, 28);
		ctx.quadraticCurveTo(19, 36, 9, 36); ctx.lineTo(-9, 36); ctx.quadraticCurveTo(-19, 35, -20, 27); ctx.closePath();
		ctx.fillStyle = stem; ctx.fill(); ctx.shadowColor = "transparent"; ctx.strokeStyle = "#655d58"; ctx.lineWidth = 3; ctx.stroke();
		const cap = ctx.createLinearGradient(-15, -38, 12, 11);
		cap.addColorStop(0, "#ff9e9a"); cap.addColorStop(0.32, "#f73537"); cap.addColorStop(0.75, "#c70d27"); cap.addColorStop(1, "#8f1029");
		ctx.beginPath(); ctx.moveTo(-39, 4); ctx.quadraticCurveTo(-43, -24, -18, -34);
		ctx.quadraticCurveTo(0, -44, 19, -32); ctx.quadraticCurveTo(40, -20, 38, 4);
		ctx.quadraticCurveTo(18, 14, 0, 10); ctx.quadraticCurveTo(-22, 15, -39, 4); ctx.closePath();
		ctx.fillStyle = cap; ctx.fill(); ctx.strokeStyle = "#76112b"; ctx.lineWidth = 4; ctx.stroke();
		ctx.fillStyle = "#fffef0";
		ctx.beginPath(); ctx.ellipse(-18, -15, 8, 10, -0.3, 0, Math.PI * 2); ctx.fill();
		ctx.beginPath(); ctx.ellipse(8, -23, 7, 9, 0.2, 0, Math.PI * 2); ctx.fill();
		ctx.beginPath(); ctx.ellipse(25, -6, 5, 7, 0.5, 0, Math.PI * 2); ctx.fill();
		ctx.strokeStyle = "#ffffff9c"; ctx.lineWidth = 3;
		ctx.beginPath(); ctx.moveTo(-28, -3); ctx.quadraticCurveTo(-25, -21, -10, -27); ctx.stroke();
	} else if (item === ITEM_STAR) {
		const star = ctx.createLinearGradient(-25, -38, 26, 35);
		star.addColorStop(0, "#fffda1"); star.addColorStop(0.25, "#ffe94a"); star.addColorStop(0.65, "#ffb90b"); star.addColorStop(1, "#e87500");
		ctx.beginPath();
		for (let i = 0; i < 10; i++) {
			const a = -Math.PI / 2 + i * Math.PI / 5;
			const r = i % 2 === 0 ? 42 : 19;
			const x = Math.cos(a) * r, y = Math.sin(a) * r;
			if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
		}
		ctx.closePath(); ctx.fillStyle = star; ctx.fill(); ctx.shadowColor = "transparent";
		ctx.strokeStyle = "#a95204"; ctx.lineWidth = 4; ctx.stroke();
		ctx.strokeStyle = "#fff8ad"; ctx.lineWidth = 3;
		ctx.beginPath(); ctx.moveTo(-12, -21); ctx.lineTo(-3, -30); ctx.stroke();
		ctx.fillStyle = "#653b12";
		ctx.beginPath(); ctx.ellipse(-9, 2, 3.4, 6, -0.1, 0, Math.PI * 2); ctx.fill();
		ctx.beginPath(); ctx.ellipse(9, 2, 3.4, 6, 0.1, 0, Math.PI * 2); ctx.fill();
		ctx.strokeStyle = "#653b12"; ctx.lineWidth = 2.5;
		ctx.beginPath(); ctx.arc(0, 10, 6, 0.2, Math.PI - 0.2); ctx.stroke();
	}
	ctx.restore();
}


export class GMRally extends GameMode {
	static readonly types = { Player };
	static readonly DATA = { GRAVITY, WIDTH, HEIGHT, RUN_SPEED, JUMP_VELOCITY };

	readonly players: Player[];

	// Shared, authoritative match state.
	redScore = 0;
	blueScore = 0;
	levelIndex = 0; // kept for snapshot compatibility; this game has one map
	levelTime = 0;
	phase = PHASE_RACING;
	intermission = 0; // retained for compatibility with older Rally snapshots
	finishCount = 0;
	lapFinishCounts: number[] = Array.from({ length: LAP_COUNT }, () => 0);
	boxCooldowns: number[] = LEVELS[0].items.map(() => 0);
	bananas: BananaState[] = [];
	shells: ShellState[] = [];
	nextEntityId = 1;

	// The world is local and deterministic. Only dynamic game state is replicated.
	private engine: RallyEngine | null = null;
	private readonly storage: RallyStorage = { skins: [] };
	private readonly isClient: boolean;
	private readonly isAuthoritative: boolean;
	private worldBuilt = false;
	private playerIds: number[] = [];
	private worldIds: number[] = [];
	private currentRng: GameRandomGenerator | null = null;

	private constructor(total: number, isClient: boolean, isAuthoritative: boolean) {
		super();
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
		const game = new GMRally(total, false, true);

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
		const level = LEVELS[0];
		for (const [i, p] of game.players.entries()) {
			p.isRed = teams[i];
			p.resetForLevel(level.spawnX, level.spawnY);
		}
		game.boxCooldowns = level.items.map(() => 0);
		game.syncBlocksFromPlayers(); // handles the case where the engine finished loading first

		const data = StartDataClient.encode({
			players: game.players.map(p => ({ isRed: p.isRed }))
		}).finish();
		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		_playerIdx: number
	) {
		// Solo/tutorial clients are authoritative locally; multiplayer clients are not.
		const game = new GMRally(total, true, origin === 'client');
		const { StartData, StartDataClient } = protocols.get();
		const clientData = new ClientData();

		if (origin === 'server') {
			const decoded = decodeFullMessage(StartDataClient.decode(data));
			game.players.forEach((p, i) => { p.isRed = decoded.players?.[i]?.isRed ?? i % 2 === 0; });
		} else {
			decodeFullMessage(StartData.decode(data));
			game.players.forEach((p, i) => { p.isRed = i % 2 === 0; });
		}

		const level = LEVELS[0];
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
		'item-box': "/assets/games/rally/item-box.png",
		'finish': "/assets/games/rally/finish.png",
		'team-marker': "/assets/games/rally/team-marker.png",
		'background': "/assets/games/rally/background.png",
	};

	/* ---------------------------- Engine / world ---------------------------- */

	override init(): void {}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	currentLevel(): LevelDef { return LEVELS[0]; }

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
			block.direction.dir = (p.hit || p.respawn > 0 || p.finished) ? 0 : p.facing * RUN_SPEED;
			block.stunned = p.hit;
		}
	}

	private getPlayerBlock(index: number): PlayerBlock | null {
		if (!this.engine || !this.worldBuilt) return null;
		return this.engine.getBlock(this.playerIds[index]) as PlayerBlock | null;
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
		p.control(block, dt);
	}

	afterPlayerStep(idx: number, block: PlayerBlock, dt: number) {
		const p = this.players[idx];
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

		if (p.respawn > 0) {
			if (this.isAuthoritative) p.respawn = Math.max(0, p.respawn - dt);
			return;
		}
		if (!this.isAuthoritative || p.finished) return;

		const level = this.currentLevel();
		if (p.y > level.deathY) { this.killPlayer(idx, p, block); return; }
		this.updateCheckpoint(p, level);
		if (p.checkpoint === level.checkpoints.length - 1 && overlapsCenter(
			{ x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H },
			{ x: level.finishX, y: -150, w: 80, h: 450 }
		)) {
			this.completeLap(idx, p, block);
			return;
		}
		this.collectItemBoxes(p, level);
	}

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

	/** Score each lap's finish order, then respawn at the start for the next lap. */
	private completeLap(idx: number, p: Player, block: PlayerBlock) {
		const lapIndex = Math.min(p.lapsCompleted, LAP_COUNT - 1);
		const rank = this.lapFinishCounts[lapIndex] ?? 0;
		this.lapFinishCounts[lapIndex] = rank + 1;
		p.lapsCompleted++;
		p.finishRank = rank;
		p.points += RANK_POINTS[rank] ?? 0;
		this.finishCount++;
		this.recomputeScores();

		const level = this.currentLevel();
		// Wrap to the start without changing height or briefly hiding the player.
		const finishY = p.y;
		p.resetAtSpawn(level.spawnX, finishY);
		block.x = level.spawnX;
		block.y = finishY;
		block.velocity.x = 0;
		block.velocity.y = 0;
		block.direction.dir = 0;
		block.stunned = false;
		if (p.lapsCompleted >= LAP_COUNT) {
			p.finished = true;
			p.respawn = 0;
			p.finishRank = rank;
		}
		// A completed lap always returns to the start, including the final one.
		p.x = block.x;
		p.y = block.y;
		p.vx = 0;
		p.vy = 0;
	}

	private recomputeScores() {
		this.redScore = 0;
		this.blueScore = 0;
		for (const p of this.players) {
			if (p.isRed) this.redScore += p.points;
			else this.blueScore += p.points;
		}
	}

	/** Box objects are part of the static map; only their cooldowns are replicated. */
	private collectItemBoxes(p: Player, level: LevelDef) {
		if (p.item !== ITEM_NONE || p.pendingItem !== ITEM_NONE || p.itemRollTimer > 0) return;
		const playerRect = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H };
		for (const [i, box] of level.items.entries()) {
			if (this.boxCooldowns[i] > 0) continue;
			if (!overlapsCenter(playerRect, { x: box.x, y: box.y, w: BOX_SIZE, h: BOX_SIZE })) continue;
			p.pendingItem = this.rollItem();
			p.itemRollTimer = ITEM_ROLL_TIME;
			this.boxCooldowns[i] = BOX_RESPAWN;
			return;
		}
	}

	/** RNG is consumed only by the authority; the selected item is immediately shared. */
	private rollItem() {
		const r = this.currentRng ? this.currentRng() : Math.random();
		if (r < 0.18) return ITEM_BANANA;
		if (r < 0.40) return ITEM_GREEN_SHELL;
		if (r < 0.60) return ITEM_RED_SHELL;
		if (r < 0.68) return ITEM_BLUE_SHELL;
		if (r < 0.88) return ITEM_MUSHROOM;
		return ITEM_STAR;
	}

	private useItem(idx: number, _block: PlayerBlock) {
		const p = this.players[idx];
		const held = p.item;
		if (held === ITEM_NONE) return;

		switch (held) {
			case ITEM_BANANA:
				this.bananas.push({
					id: this.nextEntityId++,
					x: p.x - p.facing * (PLAYER_W * 0.8),
					y: p.y + PLAYER_H * 0.35,
					vx: -p.facing * 115,
					vy: -70,
					owner: idx, life: BANANA_LIFETIME, arming: 0.45,
				});
				break;
			case ITEM_GREEN_SHELL:
			case ITEM_RED_SHELL:
			case ITEM_BLUE_SHELL:
				this.spawnShell(idx, held, p);
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

	private spawnShell(owner: number, kind: number, player: Player) {
		let target = -1;
		if (kind === ITEM_RED_SHELL) {
			// The red shell locks onto an opponent in the launch direction only.
			// Its horizontal direction is fixed when it leaves the player.
			let bestForwardDistance = Number.POSITIVE_INFINITY;
			for (let i = 0; i < this.players.length; i++) {
				const other = this.players[i];
				if (i === owner || other.finished || other.respawn > 0) continue;
				const forwardDistance = (other.x - player.x) * player.facing;
				if (forwardDistance > 0 && forwardDistance < bestForwardDistance) {
					target = i;
					bestForwardDistance = forwardDistance;
				}
			}
		} else if (kind === ITEM_BLUE_SHELL) {
			target = this.findRaceLeader();
		}

		const blue = kind === ITEM_BLUE_SHELL;
		const launchDirection = blue ? 1 : (player.facing < 0 ? -1 : 1);
		this.shells.push({
			id: this.nextEntityId++, kind,
			x: player.x + launchDirection * (PLAYER_W * 0.9),
			y: player.y,
			vx: blue ? BLUE_SHELL_SPEED : launchDirection * SHELL_SPEED,
			vy: 0,
			owner, target, life: SHELL_LIFETIME,
		});
	}

	/** Highest lap count, then greatest progress along the current lap. */
	private findRaceLeader(): number {
		let leader = -1;
		for (let i = 0; i < this.players.length; i++) {
			const candidate = this.players[i];
			if (candidate.finished || !candidate.connected) continue;
			if (leader < 0 ||
				candidate.lapsCompleted > this.players[leader].lapsCompleted ||
				(candidate.lapsCompleted === this.players[leader].lapsCompleted && candidate.x > this.players[leader].x)) {
				leader = i;
			}
		}
		return leader;
	}

	private hitPlayer(targetIndex: number) {
		const target = this.players[targetIndex];
		if (!target || target.finished || target.hit || target.starTimer > 0) return;
		const block = this.getPlayerBlock(targetIndex);
		if (!block) return;
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

	/** Update authoritative hazards and resolve all projectile contacts. */
	private updateHazards(dt: number) {
		const level = this.currentLevel();
		const platforms = this.getPlatformRects();
		const playerRect = (p: Player) => ({ x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H });

		// Bananas have their own vertical velocity, fall onto platforms, and then
		// stay on the ground. Their full state is replicated in BananaState.
		const liveBananas: BananaState[] = [];
		for (const banana of this.bananas) {
			banana.life -= dt;
			banana.arming = Math.max(0, banana.arming - dt);
			if (banana.life <= 0) continue;
			const supported = this.hazardIsSupported(banana, HAZARD_SIZE, platforms);
			this.moveGroundHazard(banana, dt, platforms, false, false);
			// Projectiles complete a lap by returning to the start at the same height.
			if (banana.x > level.finishX) banana.x = level.spawnX;
			if (supported || this.hazardIsSupported(banana, HAZARD_SIZE, platforms)) {
				banana.vx *= Math.pow(0.035, dt);
				if (Math.abs(banana.vx) < 8) banana.vx = 0;
			}
			if (banana.arming <= 0) {
				let hit = false;
				for (let i = 0; i < this.players.length; i++) {
					if (i === banana.owner || this.players[i].finished || this.players[i].respawn > 0) continue;
					if (overlapsCenter(playerRect(this.players[i]), { x: banana.x, y: banana.y, w: HAZARD_SIZE, h: HAZARD_SIZE })) {
						this.hitPlayer(i);
						hit = true;
						break;
					}
				}
				if (hit) continue;
			}
			liveBananas.push(banana);
		}
		this.bananas = liveBananas;

		// Move shells before collision checks so two shells touching in this frame
		// are always destroyed together, independent of array order.
		const liveShells: ShellState[] = [];
		for (const shell of this.shells) {
			shell.life -= dt;
			if (shell.life <= 0 || Math.abs(shell.x) > 6000 || Math.abs(shell.y) > 3000) continue;

			if (shell.kind === ITEM_BLUE_SHELL) {
				// The blue shell flies only forwards and loops around at the finish
				// line instead of reversing when the leader is behind it.
				shell.target = this.findRaceLeader();
				if (shell.target >= 0) {
					const target = this.players[shell.target];
					shell.vy = Math.max(-520, Math.min(520, (target.y - shell.y) * 2.2));
				} else {
					shell.vy = 0;
				}
				shell.vx = BLUE_SHELL_SPEED;
				shell.x += shell.vx * dt;
				shell.y += shell.vy * dt;
				if (shell.x > level.finishX) shell.x = level.spawnX;
			} else {
				if (shell.kind === ITEM_RED_SHELL && shell.target >= 0) {
					const target = this.players[shell.target];
					if (target && !target.finished) {
						const direction = shell.vx < 0 ? -1 : 1;
						const forwardDx = (target.x - shell.x) * direction;
						const desiredSpeed = Math.max(VX_MIN, Math.min(VX_MAX, VX_MIN + Math.max(0, forwardDx - 90) * 0.32));
						const speed = Math.abs(shell.vx);
						const nextSpeed = speed < desiredSpeed
							? Math.min(desiredSpeed, speed + RED_SHELL_ACCEL * dt)
							: Math.max(desiredSpeed, speed - RED_SHELL_ACCEL * dt);
						// Clamp magnitude and retain its launch-direction sign forever.
						shell.vx = direction * Math.max(VX_MIN, Math.min(VX_MAX, nextSpeed));
						if (target.y < shell.y - 24 && this.hazardIsSupported(shell, HAZARD_SIZE, platforms)) {
							shell.vy = -SHELL_JUMP_VELOCITY;
						}
					}
				}
				this.moveGroundHazard(shell, dt, platforms, shell.kind === ITEM_GREEN_SHELL, shell.kind === ITEM_RED_SHELL);
				// Red-shell wall logic may change vy but must never change vx sign.
				if (shell.kind === ITEM_RED_SHELL) {
					const sign = shell.vx < 0 ? -1 : 1;
					shell.vx = sign * Math.max(VX_MIN, Math.min(VX_MAX, Math.abs(shell.vx)));
				}
			}
			// Every shell wraps at the finish line without changing its vertical position.
			if (shell.x > level.finishX) shell.x = level.spawnX;
			liveShells.push(shell);
		}

		// Shell-to-shell contacts destroy both shells, including blue shells.
		const brokenShells = new Set<number>();
		for (let i = 0; i < liveShells.length; i++) {
			for (let j = i + 1; j < liveShells.length; j++) {
				if (overlapsCenter(
					{ x: liveShells[i].x, y: liveShells[i].y, w: HAZARD_SIZE, h: HAZARD_SIZE },
					{ x: liveShells[j].x, y: liveShells[j].y, w: HAZARD_SIZE, h: HAZARD_SIZE }
				)) {
					brokenShells.add(liveShells[i].id);
					brokenShells.add(liveShells[j].id);
				}
			}
		}

		const survivingShells = liveShells.filter(shell => !brokenShells.has(shell.id));
		const destroyedByPlayer = new Set<number>();
		for (const shell of survivingShells) {
			for (let i = 0; i < this.players.length; i++) {
				// A blue shell can hurt any player, including its owner, and keeps moving.
				if ((i === shell.owner && shell.kind !== ITEM_BLUE_SHELL) || this.players[i].finished || this.players[i].respawn > 0) continue;
				if (overlapsCenter(playerRect(this.players[i]), { x: shell.x, y: shell.y, w: HAZARD_SIZE, h: HAZARD_SIZE })) {
					this.hitPlayer(i);
					if (shell.kind !== ITEM_BLUE_SHELL) destroyedByPlayer.add(shell.id);
					break;
				}
			}
		}
		this.shells = survivingShells.filter(shell => !destroyedByPlayer.has(shell.id));
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
		this.engine!.update(dt);
		if (this.isAuthoritative) this.updateHazards(dt);

		if (this.levelTime >= LEVEL_TIME_LIMIT || this.players.every(p => p.finished || !p.connected)) {
			this.phase = PHASE_DONE;
		}
	}

	/* ---------------------------- Inputs ---------------------------- */

	/** Only modifies player state; the actual use happens in the next frame. */
	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
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

		this.drawLevel(ctx, imageLoader);
		this.drawPlayers(ctx, imageLoader);

		ctx.restore();
	}

	/** Platforms, item boxes and finish line. */
	private drawLevel(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		const level = this.currentLevel();
		const engine = this.engine;

		// Finish line
		const finish = imageLoader.get('finish');
		ctx.drawImage(finish, level.finishX - 32, -300, 64, 1200);


		// Platforms: drawn from the live blocks so moving ones are at the right place
		if (engine) {
			const pattern = ctx.createPattern(imageLoader.get('platform'), 'repeat');
			ctx.fillStyle = pattern ?? "#556";
			for (const entry of engine.getBlocks()) {
				if (entry.category !== 'platform') continue;
				const { width, height } = entry.block.getSize();
				ctx.fillRect(entry.block.x - width / 2, entry.block.y - height / 2, width, height);
			}
		}

		// Item boxes
		const box = imageLoader.get('item-box');
		for (const [i, b] of level.items.entries()) {
			if (this.boxCooldowns[i] > 0) continue;
			ctx.drawImage(box, b.x - BOX_SIZE / 2, b.y - BOX_SIZE / 2, BOX_SIZE, BOX_SIZE);
		}

		// Hazards use shaded in-game textures rather than platform emoji glyphs.
		for (const banana of this.bananas) {
			const tilt = Math.max(-0.45, Math.min(0.45, banana.vy * 0.00045));
			drawItemTexture(ctx, ITEM_BANANA, banana.x, banana.y, 42, tilt, this.levelTime * 2.2);
		}
		for (const shell of this.shells) {
			drawItemTexture(ctx, shell.kind, shell.x, shell.y, 40, 0, this.levelTime * 2.5 + shell.id * 0.13);
		}
	}

	/** Player sprites and team markers. The item roulette now lives in the screen HUD. */
	private drawPlayers(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		const engine = this.engine;
		if (!engine) return;
		for (const [i, p] of this.players.entries()) {
			const id = this.playerIds[i];
			const block = engine.getBlock(id);
			if (!block) continue;
			if (p.respawn > 0 && Math.floor(p.respawn * 10) % 2 === 0) continue;

			engine.getAnimator(id)?.draw(block, ctx, imageLoader);

			/// TODO: improve this drawing
			if (p.starTimer > 0) {
				ctx.save();
				ctx.strokeStyle = "#ffe34d";
				ctx.lineWidth = 4;
				ctx.strokeRect(block.x - PLAYER_W / 2 - 5, block.y - PLAYER_H / 2 - 5, PLAYER_W + 10, PLAYER_H + 10);
				ctx.restore();
			}
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
				jump: { x: 220, xp: 'right', y: 200, yp: 'bottom', size: 220, color: "#44aaff" },
				item: { x: 520, xp: 'right', y: 200, yp: 'bottom', size: 180, color: "#ffaa00" },
			}
		};
	}

	override createTutorial() {
		return new TutorialData(this);
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
			lapFinishCounts: this.lapFinishCounts,
			boxCooldowns: this.boxCooldowns,
			bananas: this.bananas,
			shells: this.shells,
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
		this.levelIndex = 0;
		this.levelTime = obj.levelTime ?? 0;
		this.phase = obj.phase ?? PHASE_RACING;
		this.intermission = 0;
		this.redScore = obj.redScore ?? 0;
		this.blueScore = obj.blueScore ?? 0;
		this.finishCount = obj.finishCount ?? 0;
		this.lapFinishCounts = [...(obj.lapFinishCounts ?? Array.from({ length: LAP_COUNT }, () => 0))];
		this.boxCooldowns = [...(obj.boxCooldowns ?? LEVELS[0].items.map(() => 0))];
		this.bananas = (obj.bananas ?? []).map((banana: any) => ({
			...banana,
			vx: banana.vx ?? 0,
			vy: banana.vy ?? 0,
		}));
		this.shells = [...(obj.shells ?? [])];
		this.nextEntityId = obj.nextEntityId ?? 1;

		// Keep local block IDs and static platforms intact; only restore body state.
		this.syncBlocksFromPlayers();
	}

	/* ---------------------------- Results ---------------------------- */

	/** Teams ranked by score, players ranked by points inside their team. */
	private produceFinish(): FinishGame {
		const groups = [true, false]
			.map(isRed => {
				const members = this.players
					.map((p, i) => ({ p, i }))
					.filter(m => m.p.isRed === isRed)
					.sort((a, b) => b.p.points - a.p.points || a.i - b.i);
				const score = isRed ? this.redScore : this.blueScore;
				return { members, score };
			})
			.sort((a, b) => b.score - a.score);

		const results = groups.map(g => g.members.map(m => m.i));

		const teamEqualities: number[] = [];
		for (let i = 0; i + 1 < groups.length; i++) {
			if (groups[i].score === groups[i + 1].score) teamEqualities.push(i);
		}

		// Two consecutive players of a team with the same points are tied
		const playerEqualities: number[] = [];
		for (const g of groups) {
			for (let k = 0; k + 1 < g.members.length; k++) {
				const a = g.members[k];
				const b = g.members[k + 1];
				if (a.p.points === b.p.points) playerEqualities.push(Math.min(a.i, b.i));
			}
		}
		playerEqualities.sort((a, b) => a - b);

		return { results, teamEqualities, playerEqualities };
	}
}
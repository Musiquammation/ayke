import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { GameRandomGenerator } from "../util/GameRandomGenerator";
import { ImageLoader } from "../util/ImageLoader";
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
const ITEM_ROLL_TIME = 1.35;
const BOOST_TIME = 2;
const BOOST_MULT = 1.6;
const STAR_TIME = 5;
const BANANA_LIFETIME = 14;
const SHELL_LIFETIME = 6;
const SHELL_SPEED = 820;
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
		if (b.wallSliding) return to(S.WALL_SLIDE);
		if (!walker.onFloor()) {
			if (b.velocity.y < 0) {
				return b.wallJumping ? to(S.WALL_JUMP) : to(S.JUMPING);
			}
			return to(S.FALLING);
		}
		return Math.abs(b.velocity.x) > 10 ? to(S.RUNNING) : to(S.IDLE);
	}

	getVisualZoom(): number {
		return 1.3;
	}
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
	readonly walker = new platformEngine.Walker();
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
		this.respawn = RESPAWN_TIME;
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
	readonly banner: HTMLDivElement;

	readonly camera = new Camera();
	private lastLevel = -1;
	private lastRespawn = 0;
	private lastX = Number.NaN;
	private lastY = Number.NaN;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-rally-root");

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

		this.item = document.createElement("div");
		this.item.classList.add("game-rally-item");

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

	/** Refreshes the HTML overlay and the camera for this frame. */
	update(game: GMRally, playerIdx: number) {
		const level = game.currentLevel();
		this.levelName.innerText = `${Math.min(game.players[playerIdx].lapsCompleted + 1, LAP_COUNT)}/${LAP_COUNT} - ${level.name}`;
		this.time.innerText = ClientData.showTime(LEVEL_TIME_LIMIT - game.levelTime);
		this.redScore.innerText = String(game.redScore).padStart(2, "0");
		this.blueScore.innerText = String(game.blueScore).padStart(2, "0");

		const player = game.players[playerIdx];
		const itemNames = ["", "BANANE", "CARAPACE VERTE", "CARAPACE ROUGE", "CARAPACE BLEUE", "CHAMPIGNON", "ÉTOILE"];
		this.item.innerText = player.itemRollTimer > 0 ? "OBJET…" : (itemNames[player.item] ?? "");
		this.banner.innerText = player.finished
			? `Terminé · ${player.lapsCompleted}/${LAP_COUNT} tours (#${player.finishRank + 1})`
			: game.phase === PHASE_DONE ? "Course terminée" : "";

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

const ITEM_GLYPHS: Record<number, string> = {
	[ITEM_BANANA]: "🍌",
	[ITEM_GREEN_SHELL]: "🟢",
	[ITEM_RED_SHELL]: "🔴",
	[ITEM_BLUE_SHELL]: "🔵",
	[ITEM_MUSHROOM]: "🍄",
	[ITEM_STAR]: "⭐",
};

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
		p.resetAtSpawn(level.spawnX, level.spawnY);
		block.x = level.spawnX;
		block.y = level.spawnY;
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
			let bestDistance = Number.POSITIVE_INFINITY;
			for (let i = 0; i < this.players.length; i++) {
				const other = this.players[i];
				if (i === owner || other.finished) continue;
				const distance = other.x - player.x;
				if (distance * player.facing > 0 && Math.abs(distance) < bestDistance) {
					target = i;
					bestDistance = Math.abs(distance);
				}
			}
		} else if (kind === ITEM_BLUE_SHELL) {
			let bestLap = -1;
			let bestX = -Infinity;
			for (let i = 0; i < this.players.length; i++) {
				const other = this.players[i];
				if (i === owner || other.finished) continue;
				if (other.lapsCompleted > bestLap || (other.lapsCompleted === bestLap && other.x > bestX)) {
					target = i;
					bestLap = other.lapsCompleted;
					bestX = other.x;
				}
			}
		}
		this.shells.push({
			id: this.nextEntityId++, kind,
			x: player.x + player.facing * (PLAYER_W * 0.7), y: player.y,
			vx: player.facing * SHELL_SPEED, vy: 0,
			owner, target, life: SHELL_LIFETIME,
		});
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

	/** Update authoritative hazards and resolve collisions using center-based AABBs. */
	private updateHazards(dt: number) {
		const playerRect = (p: Player) => ({ x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H });
		this.bananas = this.bananas.filter(banana => {
			banana.life -= dt;
			banana.arming = Math.max(0, banana.arming - dt);
			if (banana.life <= 0) return false;
			if (banana.arming <= 0) {
				for (let i = 0; i < this.players.length; i++) {
					if (i === banana.owner || this.players[i].finished || this.players[i].respawn > 0) continue;
					if (overlapsCenter(playerRect(this.players[i]), { x: banana.x, y: banana.y, w: 30, h: 30 })) {
						this.hitPlayer(i);
						return false;
					}
				}
			}
			return true;
		});

		this.shells = this.shells.filter(shell => {
			shell.life -= dt;
			if (shell.life <= 0 || Math.abs(shell.x) > 6000) return false;
			if ((shell.kind === ITEM_RED_SHELL || shell.kind === ITEM_BLUE_SHELL) && shell.target >= 0) {
				const target = this.players[shell.target];
				if (target && !target.finished) {
					shell.vx = (target.x >= shell.x ? 1 : -1) * SHELL_SPEED;
					shell.vy = Math.max(-520, Math.min(520, (target.y - shell.y) * 2.2));
				} else if (shell.kind === ITEM_BLUE_SHELL) {
					let leader = -1;
					for (let i = 0; i < this.players.length; i++) {
						const candidate = this.players[i];
						if (i !== shell.owner && !candidate.finished && (leader < 0 ||
							candidate.lapsCompleted > this.players[leader].lapsCompleted ||
							(candidate.lapsCompleted === this.players[leader].lapsCompleted && candidate.x > this.players[leader].x))) leader = i;
					}
					shell.target = leader;
				}
			}
			shell.x += shell.vx * dt;
			shell.y += shell.vy * dt;
			for (let i = 0; i < this.players.length; i++) {
				if (i === shell.owner || this.players[i].finished || this.players[i].respawn > 0) continue;
				if (overlapsCenter(playerRect(this.players[i]), { x: shell.x, y: shell.y, w: 30, h: 30 })) {
					this.hitPlayer(i);
					return false;
				}
			}
			return true;
		});
	}

	/* ---------------------------- Main loop ---------------------------- */

	override run(dt: number, produceFinish: boolean, rng: GameRandomGenerator | null): FinishGame | null {
		if (!this.engine) return null;
		const step = Math.min(dt, platformEngine.MAX_FRAME_DT);
		this.currentRng = rng;
		if (this.phase === PHASE_RACING) this.runRacing(step);
		this.currentRng = null;

		if (produceFinish && this.phase === PHASE_DONE) return this.produceFinish();
		return null;
	}

	private runRacing(step: number) {
		this.levelTime += step;
		this.boxCooldowns = this.boxCooldowns.map(c => Math.max(0, c - step));
		this.engine!.update(step);
		if (this.isAuthoritative) this.updateHazards(step);

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
	private drawLevel(ctx: CanvasRenderingContext2D, imageLoader: platformEngine.ImageLoaderFolder) {
		const level = this.currentLevel();
		const engine = this.engine;

		// Finish line
		const finish = imageLoader.get('finish');
		ctx.drawImage(finish, level.finishX - 32, -300, 64, 1200);

		// Main checkpoints and sub-checkpoints are visible route markers.
		for (const cp of level.checkpoints) {
			const h = cp.h ?? 220;
			ctx.fillStyle = "#ffd34d";
			ctx.fillRect(cp.x - 3, cp.y - h / 2, 6, h);
			ctx.fillRect(cp.x, cp.y - h / 2, 34, 18);
		}
		for (const cp of level.subCheckpoints) {
			const h = cp.h ?? 220;
			ctx.fillStyle = "#cf87ff";
			ctx.fillRect(cp.x - 2, cp.y - h / 2, 4, h);
			ctx.fillRect(cp.x, cp.y - h / 2, 25, 13);
		}

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

		// Hazards are lightweight shared entities, not physics-engine blocks.
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = "30px sans-serif";
		for (const banana of this.bananas) ctx.fillText("🍌", banana.x, banana.y);
		for (const shell of this.shells) ctx.fillText(ITEM_GLYPHS[shell.kind] ?? "●", shell.x, shell.y);
	}

	/** Player sprites, team markers, held-item icons and the item roulette. */
	private drawPlayers(ctx: CanvasRenderingContext2D, imageLoader: platformEngine.ImageLoaderFolder) {
		const engine = this.engine;
		if (!engine) return;
		const rouletteItems = [ITEM_BANANA, ITEM_GREEN_SHELL, ITEM_RED_SHELL, ITEM_BLUE_SHELL, ITEM_MUSHROOM, ITEM_STAR];
		for (const [i, p] of this.players.entries()) {
			const id = this.playerIds[i];
			const block = engine.getBlock(id);
			if (!block) continue;
			if (p.respawn > 0 && Math.floor(p.respawn * 10) % 2 === 0) continue;

			engine.getAnimator(id)?.draw(block, ctx, imageLoader);
			const top = block.y - PLAYER_H / 2;
			ctx.drawImage(imageLoader.get('team-marker', p.isRed ? 0 : 1), block.x - 12, top - 36, 24, 24);

			const itemToDraw = p.itemRollTimer > 0
				? rouletteItems[Math.floor(this.levelTime * 14) % rouletteItems.length]
				: p.item;
			if (itemToDraw !== ITEM_NONE) {
				ctx.save();
				ctx.font = "30px sans-serif";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(ITEM_GLYPHS[itemToDraw] ?? "?", block.x, top - 58);
				ctx.restore();
			}
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
		this.bananas = [...(obj.bananas ?? [])];
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

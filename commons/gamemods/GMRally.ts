import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
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

// Items
const BOX_RESPAWN = 6;
const BOX_SIZE = 56;
const BOOST_TIME = 2;
const BOOST_MULT = 1.6;
const SLOW_TIME = 2.5;
const SLOW_MULT = 0.45;
const SPRING_VELOCITY = 1250;
const SLOW_RANGE = 1400;            // max distance ahead for the SLOW item to hit someone

// Round flow
const RESPAWN_TIME = 1;
const LEVEL_TIME_LIMIT = 90;
const INTERMISSION_TIME = 4;
const RANK_POINTS = [4, 3, 2, 1];   // points given to 1st, 2nd, ... to finish

const PHASE_RACING = 0;
const PHASE_INTERMISSION = 1;
const PHASE_DONE = 2;

const ITEM_NONE = 0;
const ITEM_BOOST = 1;
const ITEM_SPRING = 2;
const ITEM_SLOW = 3;

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

interface LevelDef {
	name: string;
	spawnX: number;
	spawnY: number;
	finishX: number;
	deathY: number;
	platforms: PlatformDef[];
	items: { x: number; y: number }[];
	checkpoints: { x: number; y: number }[];
}

/** Example levels: replace them with the real ones. */
const LEVELS: LevelDef[] = [
	{
		name: "Warm-up",
		spawnX: 0, spawnY: 380,
		finishX: 3000, deathY: 900,
		platforms: [
			{ x: 700, y: 525, w: 1800, h: 150 },   // ground 1 (x: -200..1600)
			{ x: 1000, y: 400, w: 40, h: 100 },    // low wall to jump over
			{ x: 1750, y: 470, w: 150, h: 30, move: { ax: 0, ay: 60, period: 3, phase: 0 } },
			{ x: 2400, y: 525, w: 1000, h: 150 },  // ground 2 (x: 1900..2900)
			{ x: 2150, y: 0, w: 40, h: 500 },      // shaft left wall (open at the bottom)
			{ x: 2450, y: 125, w: 40, h: 650 },    // shaft right wall
			{ x: 2800, y: -150, w: 600, h: 40 },   // exit ledge
		],
		items: [{ x: 1300, y: 380 }, { x: 2300, y: 380 }],
		checkpoints: [{ x: 1950, y: 380 }],
	},
	{
		name: "Moving bridges",
		spawnX: 0, spawnY: 380,
		finishX: 3200, deathY: 900,
		platforms: [
			{ x: 400, y: 525, w: 1200, h: 150 },
			{ x: 1100, y: 470, w: 160, h: 30, move: { ax: 120, ay: 0, period: 4, phase: 0 } },
			{ x: 1700, y: 470, w: 160, h: 30, move: { ax: 0, ay: 80, period: 3, phase: 0.5 } },
			{ x: 2500, y: 525, w: 1500, h: 150 },
		],
		items: [{ x: 800, y: 380 }, { x: 2200, y: 380 }],
		checkpoints: [{ x: 1800, y: 380 }],
	},
];

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
		super(32, 32, texture, null, RallyAnimator.ANIMATION_LINES, 100);
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
		this.velocity.y += dt * GRAVITY;

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

	// Mirror of the physical state (refreshed from the block every frame)
	x = 0;
	y = 0;
	vx = 0;
	vy = 0;

	facing = 1;            // +1 = right, -1 = left. This is what the "dir" is derived from.
	jumpBuffer = 0;
	wallBoost = 0;
	boostTimer = 0;
	slowTimer = 0;
	item = ITEM_NONE;
	itemQueued = false;    // set by runInput, consumed in the next frame
	respawn = 0;
	checkpoint = -1;
	finished = false;
	finishRank = -1;
	points = 0;

	/** Resets everything for the beginning of a level (points are kept). */
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
		this.item = ITEM_NONE;
		this.itemQueued = false;
		this.respawn = 0;
		this.checkpoint = -1;
		this.finished = false;
		this.finishRank = -1;
	}

	/** Counts all timers down (never below 0). */
	private tickTimers(dt: number) {
		this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
		this.wallBoost = Math.max(0, this.wallBoost - dt);
		this.boostTimer = Math.max(0, this.boostTimer - dt);
		this.slowTimer = Math.max(0, this.slowTimer - dt);
	}

	/**
	 * Called before the engine moves the block. Decides facing, jumps, wall behaviour
	 * and finally the target horizontal speed. Only `direction.dir` is written for
	 * horizontal movement, never `velocity.x`.
	 */
	control(block: PlayerBlock, dt: number) {
		this.tickTimers(dt);
		block.wallSliding = false;
		block.wallJumping = this.wallBoost > 0;
		block.stunned = this.slowTimer > 0;

		if (this.respawn > 0) {
			this.freeze(block);
			return;
		}
		if (this.finished) {
			block.direction.dir = 0;
			return;
		}

		const onFloor = block.walker.onFloor();
		const pushingWall =
			(this.facing > 0 && block.walker.onRight()) ||
			(this.facing < 0 && block.walker.onLeft());

		if (pushingWall && onFloor) {
			// Wall on the ground: just turn around.
			this.facing = -this.facing;
		} else if (pushingWall) {
			this.slideOnWall(block, dt);
		} else if (onFloor && this.jumpBuffer > 0) {
			block.velocity.y = -JUMP_VELOCITY;
			this.jumpBuffer = 0;
		}

		this.applyDirection(block);
	}

	/** Holds the player in place while respawning. */
	private freeze(block: PlayerBlock) {
		block.velocity.x = 0;
		block.velocity.y = 0;
		block.direction.dir = 0;
		this.jumpBuffer = 0;
		this.itemQueued = false;
	}

	/**
	 * In the air against a wall: gravity is partly cancelled (WALL_GRAVITY_FACTOR),
	 * and a jump turns the player around with a wall jump.
	 */
	private slideOnWall(block: PlayerBlock, dt: number) {
		block.wallSliding = true;

		if (block.velocity.y > 0) {
			block.velocity.y -= GRAVITY * (1 - WALL_GRAVITY_FACTOR) * dt;
			block.velocity.y = Math.min(block.velocity.y, WALL_SLIDE_MAX_SPEED);
		}

		if (this.jumpBuffer > 0) {
			this.facing = -this.facing;             // leave the wall
			this.wallBoost = WALLJUMP_BOOST_TIME;   // dir uses WALLJUMP_VELOCITY for a moment
			block.velocity.y = -WALLJUMP_Y;
			this.jumpBuffer = 0;
			block.wallSliding = false;
			block.wallJumping = true;
		}
	}

	/** Computes the target horizontal speed from facing and active effects. */
	private applyDirection(block: PlayerBlock) {
		let speed = this.wallBoost > 0 ? WALLJUMP_VELOCITY : RUN_SPEED;
		if (this.boostTimer > 0) speed *= BOOST_MULT;
		if (this.slowTimer > 0) speed *= SLOW_MULT;
		block.direction.dir = this.facing * speed;
	}

	save() {
		return {
			x: this.x, y: this.y, vx: this.vx, vy: this.vy,
			connected: this.connected,
			isRed: this.isRed,
			facing: this.facing,
			jumpBuffer: this.jumpBuffer,
			wallBoost: this.wallBoost,
			boostTimer: this.boostTimer,
			slowTimer: this.slowTimer,
			item: this.item,
			itemQueued: this.itemQueued,
			respawn: this.respawn,
			checkpoint: this.checkpoint,
			finished: this.finished,
			finishRank: this.finishRank,
			points: this.points,
		};
	}

	load(obj: Fields) {
		this.x = obj.x; this.y = obj.y; this.vx = obj.vx; this.vy = obj.vy;
		this.connected = obj.connected;
		this.isRed = obj.isRed;
		this.facing = obj.facing === 0 ? 1 : obj.facing;
		this.jumpBuffer = obj.jumpBuffer;
		this.wallBoost = obj.wallBoost;
		this.boostTimer = obj.boostTimer;
		this.slowTimer = obj.slowTimer;
		this.item = obj.item;
		this.itemQueued = obj.itemQueued;
		this.respawn = obj.respawn;
		this.checkpoint = obj.checkpoint;
		this.finished = obj.finished;
		this.finishRank = obj.finishRank;
		this.points = obj.points;
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
		this.levelName.innerText = `${game.levelIndex + 1}/${LEVELS.length} - ${level.name}`;
		this.time.innerText = ClientData.showTime(LEVEL_TIME_LIMIT - game.levelTime);
		this.redScore.innerText = String(game.redScore).padStart(2, "0");
		this.blueScore.innerText = String(game.blueScore).padStart(2, "0");

		const player = game.players[playerIdx];
		this.item.innerText = ["", "BOOST", "SPRING", "SLOW"][player.item] ?? "";
		this.banner.innerText =
			game.phase === PHASE_INTERMISSION ? "Level finished!" :
			player.finished ? `Finished #${player.finishRank + 1}` : "";

		// Snap on new level and on respawn
		if (this.lastLevel !== game.levelIndex || (this.lastRespawn > 0 && player.respawn <= 0)) {
			this.camera.teleport(player.x, player.y);
		}
		this.lastLevel = game.levelIndex;
		this.lastRespawn = player.respawn;

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

export class GMRally extends GameMode {
	static readonly types = { Player };

	static readonly DATA = { GRAVITY, WIDTH, HEIGHT, RUN_SPEED, JUMP_VELOCITY };

	readonly players: Player[];

	// ---- Shared state (saved) ----
	redScore = 0;
	blueScore = 0;
	levelIndex = 0;
	levelTime = 0;          // the "t" of moving platforms
	phase = PHASE_RACING;
	intermission = 0;
	finishCount = 0;        // how many players already crossed the line this level
	boxCooldowns: number[] = [];
	itemRoll = 0.5;         // next random item value, produced by the server
	rollDirty = true;       // true when itemRoll was consumed and must be redrawn

	// ---- Non shared (rebuilt) ----
	private engine: RallyEngine | null = null;
	private readonly storage: RallyStorage = { skins: [] };
	private isClient = false;
	private playerIds: number[] = [];
	private worldIds: number[] = [];

	private constructor(total: number) {
		super();
		this.players = Array.from({ length: total }, () => new Player());
		
		platformEngine.createPlatformerEngine<RallyEngineData>(
			this.isClient,
			this.storage,
			this,
			{ x: 0, y: GRAVITY }
		).then(engine => {
			this.engine = engine;
			this.rebuildWorld();
		});
	}

	/* ---------------------------- Creation ---------------------------- */

	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();
		const game = new GMRally(total);

		const decode = (i: number) =>
			i < players.length
				? decodeFullMessage(StartData.decode(players[i].data))
				: generateClientDom([]);

		// Decode every start message once and validate skin ownership
		const infos = await Promise.all(
			game.players.map(async (_p, i) => {
				const d = decode(i);
				const pseudo = i < players.length ? players[i].pseudo : null;
				return {pref: (d.preferTeam ?? 0) as number};
			})
		);

		const teams = GMRally.assignTeams(infos.map(i => i.pref));
		const level = LEVELS[0];
		for (const [i, p] of game.players.entries()) {
			p.isRed = teams[i];
			p.resetForLevel(level.spawnX, level.spawnY);
		}
		game.boxCooldowns = level.items.map(() => 0);

		const data = StartDataClient.encode({
			players: game.players.map((p, i) => ({ isRed: p.isRed }))
		}).finish();

		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		_playerIdx: number
	) {
		const game = new GMRally(total);
		game.isClient = true;
		const { StartData, StartDataClient } = protocols.get();
		const clientData = new ClientData();

		if (origin === 'server') {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
		} else { // origin === 'client' (tutorial / solo)
			const {} = decodeFullMessage(StartData.decode(data));
			game.players.forEach((p, i) => { p.isRed = i % 2 === 0; });
		}

		const level = LEVELS[0];
		game.players.forEach(p => p.resetForLevel(level.spawnX, level.spawnY));
		game.boxCooldowns = level.items.map(() => 0);

		return { game, data: clientData, html: clientData.html, skins: {} };
	}

	/**
	 * Splits players into two balanced teams, honouring preferences when possible.
	 * pref: 1 = red, -1 = blue, 0 = none. Returns true for red.
	 */
	private static assignTeams(prefs: number[]): boolean[] {
		const total = prefs.length;
		const maxPerTeam = Math.ceil(total / 2);
		const isRed: (boolean | undefined)[] = new Array(total).fill(undefined);
		let red = 0;
		let blue = 0;

		// Phase 1: valid explicit preferences
		for (let i = 0; i < total; i++) {
			if (prefs[i] === 1 && red < maxPerTeam) { isRed[i] = true; red++; }
			else if (prefs[i] === -1 && blue < maxPerTeam) { isRed[i] = false; blue++; }
		}
		// Phase 2: fill by balancing
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
		'item-boost': "/assets/games/rally/item-boost.png",
		'item-spring': "/assets/games/rally/item-spring.png",
		'item-slow': "/assets/games/rally/item-slow.png",
		'finish': "/assets/games/rally/finish.png",
		'team-marker': "/assets/games/rally/team-marker.png",
		'background': "/assets/games/rally/background.png",
	};

	/* ---------------------------- Engine / world ---------------------------- */

	/** Creates the Rapier engine (async) then builds the current level. */
	override init(): void {
		
	}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	currentLevel(): LevelDef {
		return LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
	}

	/**
	 * Removes every block and recreates them from shared state (levelIndex + Player).
	 * Used at level start and after load().
	 */
	private rebuildWorld() {
		const engine = this.engine;
		if (!engine) return;

		for (const id of [...this.worldIds, ...this.playerIds]) engine.removeBlock(id);
		this.worldIds = [];
		this.playerIds = [];

		for (const def of this.currentLevel().platforms) {
			this.worldIds.push(engine.addBlock(new PlatformBlock(def), 'platform'));
		}

		for (const [i, p] of this.players.entries()) {
			const block = new PlayerBlock(i);
			block.x = p.x;
			block.y = p.y;
			block.velocity.x = p.vx;
			block.velocity.y = p.vy;
			this.playerIds.push(engine.addBlock(block, 'player'));
		}
	}

	/** Resets everything for level `index` and recreates the world. */
	private startLevel(index: number) {
		this.levelIndex = index;
		this.levelTime = 0;
		this.phase = PHASE_RACING;
		this.finishCount = 0;
		const level = this.currentLevel();
		this.boxCooldowns = level.items.map(() => 0);
		for (const p of this.players) p.resetForLevel(level.spawnX, level.spawnY);
		this.rebuildWorld();
	}

	/* ---------------------------- Player hooks (called by blocks) ---------------------------- */

	/** Before the engine step: apply the queued item then the player's control logic. */
	beforePlayerStep(idx: number, block: PlayerBlock, dt: number) {
		const p = this.players[idx];
		if (p.itemQueued) {
			p.itemQueued = false;
			if (p.respawn <= 0 && !p.finished) this.useItem(idx, block);
		}
		p.control(block, dt);
	}

	/** After the engine step: mirror state, then resolve death, checkpoints, finish and item boxes. */
	afterPlayerStep(idx: number, block: PlayerBlock, dt: number) {
		const p = this.players[idx];
		p.x = block.x; p.y = block.y;
		p.vx = block.velocity.x; p.vy = block.velocity.y;

		if (p.respawn > 0) {
			p.respawn -= dt;
			return;
		}
		if (p.finished) return;

		const level = this.currentLevel();

		if (p.y > level.deathY) { this.killPlayer(p, block); return; }
		this.updateCheckpoint(p, level);
		if (p.x >= level.finishX) this.finishPlayer(p);
		this.collectItemBoxes(p, level);
	}

	/** Sends the player back to its last checkpoint (or the spawn) and freezes it shortly. */
	private killPlayer(p: Player, block: PlayerBlock) {
		const level = this.currentLevel();
		const cp = p.checkpoint >= 0 ? level.checkpoints[p.checkpoint] : { x: level.spawnX, y: level.spawnY };
		block.x = cp.x; block.y = cp.y;
		block.velocity.x = 0; block.velocity.y = 0;
		p.x = cp.x; p.y = cp.y; p.vx = 0; p.vy = 0;
		p.facing = 1;
		p.wallBoost = 0;
		p.respawn = RESPAWN_TIME;
	}

	private updateCheckpoint(p: Player, level: LevelDef) {
		for (let i = level.checkpoints.length - 1; i > p.checkpoint; i--) {
			if (p.x >= level.checkpoints[i].x) { p.checkpoint = i; break; }
		}
	}

	/** Gives rank points to the player and refreshes team scores. */
	private finishPlayer(p: Player) {
		p.finished = true;
		p.finishRank = this.finishCount++;
		p.points += RANK_POINTS[p.finishRank] ?? 0;
		this.recomputeScores();
	}

	private recomputeScores() {
		this.redScore = 0;
		this.blueScore = 0;
		for (const p of this.players) {
			if (p.isRed) this.redScore += p.points;
			else this.blueScore += p.points;
		}
	}

	/** Picks up an item box if the player's hands are empty. */
	private collectItemBoxes(p: Player, level: LevelDef) {
		if (p.item !== ITEM_NONE) return;
		const me = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H };
		for (const [i, box] of level.items.entries()) {
			if (this.boxCooldowns[i] > 0) continue;
			if (!collisions.RectRect(me, { x: box.x, y: box.y, w: BOX_SIZE, h: BOX_SIZE })) continue;
			p.item = this.rollItem();
			this.boxCooldowns[i] = BOX_RESPAWN;
			this.rollDirty = true; // the server will draw a new value
			return;
		}
	}

	/** Maps the shared random value to an item. */
	private rollItem() {
		if (this.itemRoll < 0.4) return ITEM_BOOST;
		if (this.itemRoll < 0.7) return ITEM_SPRING;
		return ITEM_SLOW;
	}

	/** Consumes the held item. */
	private useItem(idx: number, block: PlayerBlock) {
		const p = this.players[idx];
		switch (p.item) {
			case ITEM_BOOST: p.boostTimer = BOOST_TIME; break;
			case ITEM_SPRING: block.velocity.y = -SPRING_VELOCITY; break;
			case ITEM_SLOW: this.slowNearestOpponentAhead(p); break;
		}
		p.item = ITEM_NONE;
	}

	/** SLOW: slows the closest opponent that is ahead (greater x), within range. */
	private slowNearestOpponentAhead(user: Player) {
		let best: Player | null = null;
		let bestDist = SLOW_RANGE;
		for (const o of this.players) {
			if (o.isRed === user.isRed || o.finished) continue;
			const d = o.x - user.x;
			if (d > 0 && d < bestDist) { best = o; bestDist = d; }
		}
		if (best) best.slowTimer = SLOW_TIME;
	}

	/* ---------------------------- Main loop ---------------------------- */

	override run(
		dt: number,
		produceFinish: boolean,
		rng: GameRandomGenerator | null
	): FinishGame | null {
		if (!this.engine) return null; // engine is still loading

		const step = Math.min(dt, platformEngine.MAX_FRAME_DT);

		if (this.phase === PHASE_RACING) {
			this.runRacing(step);
		} else if (this.phase === PHASE_INTERMISSION) {
			this.runIntermission(step);
		}

		// Server only: refresh the random value once it has been consumed.
		// It is part of the State so clients get the same value.
		if (rng && this.rollDirty) {
			this.itemRoll = rng();
			this.rollDirty = false;
		}

		if (produceFinish && this.phase === PHASE_DONE) {
			return this.produceFinish();
		}
		return null;
	}

	/** One racing step: timers, physics, then end-of-level check. */
	private runRacing(step: number) {
		this.levelTime += step;
		this.boxCooldowns = this.boxCooldowns.map(c => Math.max(0, c - step));
		this.engine!.update(step);

		if (this.isLevelOver()) {
			this.phase = PHASE_INTERMISSION;
			this.intermission = INTERMISSION_TIME;
		}
	}

	private runIntermission(step: number) {
		this.intermission -= step;
		if (this.intermission > 0) return;

		if (this.levelIndex + 1 >= LEVELS.length) this.phase = PHASE_DONE;
		else this.startLevel(this.levelIndex + 1);
	}

	/** Level ends when everyone present has finished, or on timeout. */
	private isLevelOver() {
		if (this.levelTime >= LEVEL_TIME_LIMIT) return true;
		return this.players.every(p => p.finished || !p.connected);
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
		ctx.drawImage(finish, level.finishX - 32, level.spawnY - 400, 64, 800);

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
	}

	/** Player sprites, team markers and held-item icons. */
	private drawPlayers(ctx: CanvasRenderingContext2D, imageLoader: platformEngine.ImageLoaderFolder) {
		const engine = this.engine;
		if (!engine) return;

		const icons = [null, 'item-boost', 'item-spring', 'item-slow'];
		for (const [i, p] of this.players.entries()) {
			const id = this.playerIds[i];
			const block = engine.getBlock(id);
			if (!block) continue;

			if (p.respawn > 0 && Math.floor(p.respawn * 10) % 2 === 0) continue; // blink

			engine.getAnimator(id)?.draw(block, ctx, imageLoader);

			const top = block.y - PLAYER_H / 2;
			ctx.drawImage(imageLoader.get('team-marker', p.isRed ? 0 : 1), block.x - 12, top - 36, 24, 24);

			const icon = icons[p.item];
			if (icon) ctx.drawImage(imageLoader.get(icon), block.x - 16, top - 72, 32, 32);
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
		if (!this.engine) return;
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
			itemRoll: this.itemRoll,
			rollDirty: this.rollDirty,
		};
		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = State.decode(data);

		for (let i = 0; i < obj.players.length; i++) {
			this.players[i].load(obj.players[i]);
		}
		this.levelIndex = obj.levelIndex;
		this.levelTime = obj.levelTime;
		this.phase = obj.phase;
		this.intermission = obj.intermission;
		this.redScore = obj.redScore;
		this.blueScore = obj.blueScore;
		this.finishCount = obj.finishCount;
		this.boxCooldowns = [...obj.boxCooldowns];
		this.itemRoll = obj.itemRoll;
		this.rollDirty = obj.rollDirty;

		// Blocks are not saved: recreate them from the loaded state.
		this.rebuildWorld();
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

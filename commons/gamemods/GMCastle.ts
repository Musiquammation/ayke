import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";
import { platformEngine } from "../util/platformEngine";
import { GameRandomGenerator } from "../util/GameRandomGenerator";

const protocols = getProtocol('castle', 'multiplayer', [
	'BlockData',
	'SpikeData',
	'TrampolineData',
	'ArcherData',
	'FireBarData',
	'ThwompData',
	'SpawnerData',
	'RampData',
]);

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

/* ========================================================================== */
/* CONSTANTS                                                                  */
/* ========================================================================== */

// ---- Canvas (logical resolution, see getSize) ------------------------------
const WIDTH = 1600;
const HEIGHT = 900;

// ---- Level geometry (everything is expressed on a grid of square cells) ----
const CELL = 40;
const LEVEL_COLS = 60;
const LEVEL_ROWS = 18;
const LEVEL_WIDTH = LEVEL_COLS * CELL;
const LEVEL_HEIGHT = LEVEL_ROWS * CELL;

/** First row of the neutral floor (the floor is FLOOR_ROWS cells thick). */
const FLOOR_ROWS = 2;
const FLOOR_ROW = LEVEL_ROWS - FLOOR_ROWS;
const FLOOR_TOP_Y = FLOOR_ROW * CELL;

/** Players may only build in columns [BUILD_MIN_COL, BUILD_MAX_COL). */
const BUILD_MIN_COL = 5;
const CASTLE_COLS = 5;
const CASTLE_ROWS = 5;
const CASTLE_COL = LEVEL_COLS - CASTLE_COLS;
const BUILD_MAX_COL = CASTLE_COL;

/** Axis-aligned rectangle of the castle (top-left anchored, like collisions.Rect). */
const CASTLE_RECT = {
	x: CASTLE_COL * CELL,
	y: FLOOR_TOP_Y - CASTLE_ROWS * CELL,
	w: CASTLE_COLS * CELL,
	h: CASTLE_ROWS * CELL,
};

/** Anything falling below this line is considered lost in the void. */
const VOID_Y = LEVEL_HEIGHT + CELL * 3;

// ---- Match rules -----------------------------------------------------------
const CASTLE_HP = 20;
const MATCH_DURATION = 300;          // 5 minutes
const TIMER_VISIBLE_SECONDS = 60;    // the clock is only displayed during the last minute
const NEUTRAL_BLOCK_LIFETIME = 180;  // neutral floor blocks break after one minute
const NO_OWNER = -1;
const GRAVITY = 1500;

// ---- Elixir ----------------------------------------------------------------
const ELIXIR_MAX = 10;
const ELIXIR_START = 5;
const ELIXIR_REGEN_PER_SECOND = 0.6;
/** Removing an enemy element costs (1 + hp / maxHp) * price. */
const REMOVAL_BASE_FACTOR = 1;

// ---- Bots (waves) ----------------------------------------------------------
const BOT_SIZE = 30;
const BOT_RUN_SPEED = 140;           // target horizontal speed (px/s) written into Direction.dir
const BOT_JUMP_SPEED = 560;
const BOT_ACCELERATION = 800;
const BOT_SOFT_DECELERATION = 600;
const BOT_HARD_DECELERATION = 1200;
const BOT_JUMP_HOLD_TIME = 0.08;
const BOT_JUMP_COOLDOWN = 0.20;
const BOT_WALL_JUMP_SPEED = 1000;
const BOT_WALL_JUMP_LOCK_TIME = 0.16;
const BOT_WALL_JUMP_REVERSE_TIME = 0.10;
const BOT_WALL_JUMP_MAX_REPEAT_PER_SECOND = 5;
const BOT_JUMP_ACCELERATION = 1000;
const BOT_FALL_ACCELERATION = 2000;
const BOT_WALL_SLIDE_MAX_SPEED = 100;
const BOT_STUCK_DISTANCE = 6;
const BOT_SPAWN_X = 2 * CELL;
const BOT_SPAWN_Y = FLOOR_TOP_Y - BOT_SIZE / 2 - 2;
const SPAWN_MIN_Y = BOT_SIZE / 2;
const SPAWN_MAX_Y = LEVEL_HEIGHT - BOT_SIZE / 2;
const BOT_FRAME_SIZE = 32;           // size of one sprite frame in the sheet
const BOT_RUNNING_SPEED = 100;       // speed from which the 'running' animation is used
/** A bot that dies of the void is credited to the last element that touched it within this window. */
const KILL_CREDIT_WINDOW = 2;

const WAVE_FIRST_DELAY = 0.1;
const WAVE_INTERVAL = 2;
const WAVE_BASE_SIZE = 3;
const WAVE_SIZE_GROWTH = 1;
const WAVE_MAX_SIZE = 14;
const BOT_SPAWN_INTERVAL = 0.9;

// ---- Element: block --------------------------------------------------------
const BLOCK_PRICE = 1;
const BLOCK_HP = 30;

// ---- Element: spike --------------------------------------------------------
const SPIKE_PRICE = 2;
const SPIKE_HP = 25;

// ---- Element: trampoline ---------------------------------------------------
const TRAMPOLINE_PRICE = 2;
const TRAMPOLINE_HP = 30;
const TRAMPOLINE_BOUNCE_SPEED = 900;

// ---- Element: archer tower (1x2 cells) + arrows ----------------------------
const ARCHER_PRICE = 4;
const ARCHER_HP = 25;
const ARCHER_ROWS = 2;
const ARCHER_RANGE = 450;
const ARCHER_COOLDOWN = 1.2;
const ARCHER_MUZZLE_OFFSET = 10;     // distance of the muzzle below the tower top
const ARROW_SPEED = 600;
const ARROW_LIFETIME = 2.5;
const ARROW_LENGTH = 28;
const ARROW_THICKNESS = 8;

// ---- Element: rotating fire bar -------------------------------------------
const FIREBAR_PRICE = 3;
const FIREBAR_HP = 25;
const FIREBAR_BALLS = 5;
const FIREBAR_BALL_SPACING = 22;
const FIREBAR_BALL_RADIUS = 10;
const FIREBAR_ROTATION_SPEED = 2.2;  // radians / second

// ---- Element: thwomp (2x2 cells) ------------------------------------------
const THWOMP_PRICE = 4;
const THWOMP_HP = 25;
const THWOMP_CELLS = 2;
const THWOMP_TRIGGER_HALF_WIDTH = 60;
const THWOMP_TRIGGER_DEPTH = 400;
const THWOMP_SLAM_SPEED = 1100;
const THWOMP_RISE_SPEED = 200;
const THWOMP_REST_TIME = 0.6;
const THWOMP_MAX_DROP = 400;
const THWOMP_PHASE_IDLE = 0;
const THWOMP_PHASE_SLAM = 1;
const THWOMP_PHASE_REST = 2;
const THWOMP_PHASE_RISE = 3;

// ---- Element: monster spawner + monsters ----------------------------------
const SPAWNER_PRICE = 5;
const SPAWNER_HP = 20;
const SPAWNER_INTERVAL = 3;
const MONSTER_SIZE = 30;
const MONSTER_LIFETIME = 8;
const MONSTER_KILL_LIFETIME_COST = 2;
const MONSTER_SPEED = 90;
const MONSTER_JUMP_SPEED = 450;
const MONSTER_ACCELERATION = 600;
const MONSTER_SOFT_DECELERATION = 500;
const MONSTER_HARD_DECELERATION = 900;
const MONSTER_SPAWN_OFFSET_X = CELL * 0.7;

// ---- Element: ramp ---------------------------------------------------------
const RAMP_PRICE = 1;
const RAMP_HP = 30;

// ---- Damage visuals --------------------------------------------------------
const DAMAGE_THRESHOLD_INTACT = 0.60;    // 100% - 60%
const DAMAGE_THRESHOLD_CRACKED = 0.35;   // 60% - 35%
const DAMAGE_THRESHOLD_FRAGILE = 0.20;   // 35% - 20%
const DAMAGE_BAR_THRESHOLD = 0.10;       // below 20% = "sensitive"; the bar appears in the last 10%
const DAMAGE_TIER_INTACT = 0;
const DAMAGE_TIER_CRACKED = 1;
const DAMAGE_TIER_FRAGILE = 2;
const DAMAGE_TIER_SENSITIVE = 3;
const DAMAGE_OVERLAY_OPACITY_BY_TIER = [0, 0.08, 0.16, 0.24];
const DAMAGE_BAR_HEIGHT = 5;
const DAMAGE_BAR_OFFSET = 8;
const DAMAGE_BAR_BG = 'rgba(0, 0, 0, 0.6)';
const DAMAGE_BAR_FG = '#ff3b30';

// ---- Textures --------------------------------------------------------------
const GAME_FOLDER = 'castleDefense';
const ASSET_ROOT = '/assets/games/castleDefense';
const TEX_BLOCK = 'block';
const TEX_SPIKE = 'spike';
const TEX_TRAMPOLINE = 'trampoline';
const TEX_ARCHER = 'archer';
const TEX_FIREBAR = 'firebar';
const TEX_FIREBALL = 'fireball';
const TEX_THWOMP = 'thwomp';
const TEX_SPAWNER = 'spawner';
const TEX_RAMP = 'ramp';
const TEX_ARROW = 'arrow';
const TEX_MONSTER = 'monster';
const TEX_BOT = 'bot';
const TEX_CASTLE = 'castle';
const TEXTURE_NAMES = [
	TEX_BLOCK, TEX_SPIKE, TEX_TRAMPOLINE, TEX_ARCHER, TEX_FIREBAR, TEX_FIREBALL,
	TEX_THWOMP, TEX_SPAWNER, TEX_RAMP, TEX_ARROW, TEX_MONSTER, TEX_BOT, TEX_CASTLE,
];
/** Textures that exist in a red (0) and a blue (1) version. */
const COLORED_TEXTURES = [
	TEX_BLOCK, TEX_SPIKE, TEX_TRAMPOLINE, TEX_ARCHER, TEX_FIREBAR, TEX_THWOMP,
	TEX_SPAWNER, TEX_RAMP, TEX_ARROW, TEX_MONSTER,
];
const TEXTURE_PLACEHOLDER_COLOR = '#ff00ff';       // colour painted in the PNG files
const TEAM_COLORS = ['#ff0044', '#0044ff'];        // index 0 = red, 1 = blue
const COLOR_ID_RED = 0;
const COLOR_ID_BLUE = 1;
const PLACEHOLDER_MAX_SIZE = 2;                    // ImageLoader's placeholder is 2x2 px
const ANIMATION_LINES_PER_STATE = 1;               // sprite-sheet lines used by each animator state

// ---- Colours used when a texture is missing / for the UI -------------------
const COLOR_SKY_TOP = '#6ec6ff';
const COLOR_SKY_BOTTOM = '#d6f0ff';
const COLOR_VOID = '#101820';
const COLOR_FALLBACK_OUTLINE = 'rgba(0, 0, 0, 0.5)';
const COLOR_FIREBALL = '#ff9100';
const COLOR_ARROW = '#5d4037';
const COLOR_CASTLE = '#78909c';
const COLOR_CASTLE_BAR_BG = 'rgba(0, 0, 0, 0.6)';
const COLOR_CASTLE_BAR_FG = '#4caf50';
const COLOR_PORTAL = 'rgba(180, 60, 255, 0.55)';
const COLOR_FORBIDDEN_ZONE = 'rgba(0, 0, 0, 0.25)';
const COLOR_PREVIEW_OK = 'rgba(80, 255, 120, 0.9)';
const COLOR_PREVIEW_KO = 'rgba(255, 70, 70, 0.9)';
const COLOR_REMOVE_TARGET = 'rgba(255, 70, 70, 0.9)';
const COLOR_GRID_BG = '40, 110, 255';
const COLOR_GRID_LINE = '200, 225, 255';
const COLOR_CARD_BG = 'rgba(20, 24, 40, 0.88)';
const COLOR_CARD_SELECTED = '#ffd54f';
const COLOR_CARD_TEXT = '#ffffff';
const COLOR_ELIXIR_BG = 'rgba(20, 24, 40, 0.88)';
const COLOR_ELIXIR_FG = '#c13cff';
const COLOR_ELIXIR_TEXT = '#ffffff';
const COLOR_DISABLED = 'rgba(0, 0, 0, 0.55)';
const COLOR_REMOVE_TOOL = '#b71c1c';
const COLOR_LOADING = '#ffffff';

// ---- Placement preview grid (blue grid whose opacity fades with the radius) -
const GRID_RADIUS_CELLS = 6;
const GRID_BG_MAX_ALPHA = 0.35;
const GRID_LINE_MAX_ALPHA = 0.8;
const PREVIEW_ALPHA = 0.7;
const PREVIEW_OUTLINE_WIDTH = 3;
const PREVIEW_LABEL_OFFSET_Y = 18;

// ---- Camera ----------------------------------------------------------------
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.2;
const ZOOM_DEFAULT = 0.8;
const WHEEL_ZOOM_SPEED = 0.0015;
const CAMERA_MARGIN = CELL * 2;
const MIN_PINCH_DISTANCE = 10;

// ---- Pointers / UI layout --------------------------------------------------
const MOUSE_POINTER_ID = -1;
const TOOL_REMOVE = -1;                  // pseudo "card" used to delete elements
const ELEMENT_TYPE_COUNT = 8;
const SLOT_COUNT = ELEMENT_TYPE_COUNT + 1;
const CARD_W = 130;
const CARD_H = 100;
const CARD_GAP = 10;
const CARD_BOTTOM_MARGIN = 20;
const CARD_ICON_SIZE = 52;
const PLACEMENT_OPTION_SIZE = 34;
const PLACEMENT_OPTION_GAP = 6;
const PLACEMENT_OPTION_MARGIN = 6;
const CARD_CLICK_SLOP = 8;
const CARD_BAR_WIDTH = SLOT_COUNT * CARD_W + (SLOT_COUNT - 1) * CARD_GAP;
const CARD_BAR_LEFT = (WIDTH - CARD_BAR_WIDTH) / 2;
const CARD_BAR_TOP = HEIGHT - CARD_H - CARD_BOTTOM_MARGIN;
const ELIXIR_BAR_HEIGHT = 26;
const ELIXIR_BAR_GAP = 10;
const ELIXIR_BAR_TOP = CARD_BAR_TOP - ELIXIR_BAR_GAP - ELIXIR_BAR_HEIGHT;
const UI_PADDING = 12;
const UI_TOP = CARD_BAR_TOP - PLACEMENT_OPTION_MARGIN - PLACEMENT_OPTION_SIZE - UI_PADDING;
const UI_RIGHT = CARD_BAR_LEFT + CARD_BAR_WIDTH + UI_PADDING;
const UI_LEFT = CARD_BAR_LEFT - UI_PADDING;
/** A finger released this close to the canvas border is considered "off screen" -> cancel. */
const EDGE_CANCEL_MARGIN = 8;
const FONT_CARD = 'bold 15px sans-serif';
const FONT_PRICE = 'bold 18px sans-serif';
const FONT_ELIXIR = 'bold 18px sans-serif';
const FONT_PREVIEW = 'bold 22px sans-serif';
const FONT_LOADING = 'bold 40px sans-serif';
const FONT_PLACEMENT_OPTION = 'bold 20px sans-serif';
const FONT_REMOVE = 'bold 30px sans-serif';
const PRICE_BADGE_RADIUS = 15;
const PRICE_BADGE_MARGIN = 6;

const DEFAULT_TEAM_RED = 'red' as const;
const DEFAULT_TEAM_BLUE = 'blue' as const;

/* ========================================================================== */
/* SMALL HELPERS                                                              */
/* ========================================================================== */

type NoData = null;
type BlockId = platformEngine.BlockId;
type Side = platformEngine.Side;
type Size = platformEngine.Size;
type Polygon = platformEngine.Polygon;
type Velocity = platformEngine.Velocity;
type Direction = platformEngine.Direction;
type Folder = platformEngine.ImageLoaderFolder;
type Engine = platformEngine.IBlockEngine<CDEngineData>;
type Entry = platformEngine.BlockEntry<CDEngineData>;

type CDBlockTypes = {
	elements: PlacedElement;
	bots: Bot;
	arrows: Arrow;
	monsters: Monster;
};
type CDStorage = platformEngine.BlockStorage<CDBlockTypes>;

interface CDEngineData extends platformEngine.EngineData {
	Game: GMCastle;
	Storage: CDStorage;
}

/** Circle shape (same layout as collisions' circles). */
interface Circle {
	x: number;
	y: number;
	r: number;
}

/** Minimal shape of a pointer (mouse button or finger) in canvas coordinates. */
interface Pointer {
	id: number;
	x: number;
	y: number;
}

/** The mouse controller of the framework is not guaranteed to expose the wheel: read it optionally. */
interface WheelSource {
	getWheelDelta?(): number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const cellKey = (col: number, row: number) => row * LEVEL_COLS + col;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Deterministic pseudo random number in [0, 1[ (used for cosmetic cracks only). */
function hash01(a: number, b: number): number {
	const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
	return s - Math.floor(s);
}

/** Top-left anchored rectangle of a block (collisions.Rect convention). */
function rectOf(block: platformEngine.Block<any, any>) {
	const size = block.getSize();
	return {
		x: block.x - size.width / 2,
		y: block.y - size.height / 2,
		w: size.width,
		h: size.height,
	};
}

/**
 * Draws a texture centered on (cx, cy).
 * If the texture is not available yet (2x2 placeholder), a coloured rectangle is drawn instead,
 * so the game stays playable without any art.
 */
function drawTexture(
	ctx: CanvasRenderingContext2D,
	folder: Folder,
	name: string,
	colorId: number | undefined,
	cx: number,
	cy: number,
	w: number,
	h: number,
	fallback: string
) {
	const tex = colorId === undefined ? folder.get(name) : folder.get(name, colorId);
	if (tex.width <= PLACEHOLDER_MAX_SIZE) {
		ctx.fillStyle = fallback;
		ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
		ctx.strokeStyle = COLOR_FALLBACK_OUTLINE;
		ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
		return;
	}
	ctx.drawImage(tex, cx - w / 2, cy - h / 2, w, h);
}

/** Returns 0 (intact), 1 (cracked), 2 (fragile) or 3 (sensitive) from the remaining life ratio. */
function damageTier(ratio: number): number {
	if (ratio > DAMAGE_THRESHOLD_INTACT) return DAMAGE_TIER_INTACT;
	if (ratio > DAMAGE_THRESHOLD_CRACKED) return DAMAGE_TIER_CRACKED;
	if (ratio > DAMAGE_THRESHOLD_FRAGILE) return DAMAGE_TIER_FRAGILE;
	return DAMAGE_TIER_SENSITIVE;
}

/** Draws a deliberately simple wear effect: a progressively darker overlay and a final life bar. */
function drawDamageOverlay(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	w: number,
	h: number,
	ratio: number,
	_seed: number
) {
	const tier = damageTier(ratio);
	if (tier === DAMAGE_TIER_INTACT) return;

	const left = cx - w / 2;
	const top = cy - h / 2;

	ctx.save();
	ctx.globalAlpha = DAMAGE_OVERLAY_OPACITY_BY_TIER[tier];
	ctx.fillStyle = '#000000';
	ctx.fillRect(left, top, w, h);
	ctx.restore();

	if (ratio < DAMAGE_BAR_THRESHOLD) {
		const y = top - DAMAGE_BAR_OFFSET;
		ctx.fillStyle = DAMAGE_BAR_BG;
		ctx.fillRect(left, y, w, DAMAGE_BAR_HEIGHT);
		ctx.fillStyle = DAMAGE_BAR_FG;
		ctx.fillRect(left, y, w * clamp(ratio / DAMAGE_BAR_THRESHOLD, 0, 1), DAMAGE_BAR_HEIGHT);
	}
}

/* ========================================================================== */
/* BOT AI                                                                     */
/* ========================================================================== */

namespace Bots {
	/* -------------------------------------------------------------------------- */
	/* Navigation and tactical constants                                          */
	/* -------------------------------------------------------------------------- */

	/*
	 * The navigation layer follows the same architecture used by dedicated
	 * platformer navigation systems: represent traversable surfaces as nodes,
	 * validate jump trajectories against geometry, then use A* to select a route.
	 * The important addition here is a reactive hazard layer which is evaluated
	 * every frame because fire bars, thwomps and arrows are dynamic.
	 *
	 * Reference:
	 * - https://devlog.levi.dev/2021/09/building-platformer-ai-part-4-platform.html
	 * - https://devlog.levi.dev/2021/09/building-platformer-ai-part-3.html
	 */

	const PATH_REPLAN_INTERVAL = 0.75;
	const PATH_STUCK_TIMEOUT = 0.55;
	const PATH_NODE_REACHED_DISTANCE = 14;
	const PATH_X_TOLERANCE = 8;

	const NAV_WALK_MAX_VERTICAL_DELTA = CELL * 0.65;
	const NAV_GRAVITY = BOT_FALL_ACCELERATION;
	const NAV_JUMP_SPEED = BOT_JUMP_SPEED;
	const NAV_MAX_JUMP_UP =
		NAV_JUMP_SPEED * NAV_JUMP_SPEED / (2 * NAV_GRAVITY) + CELL * 0.15;
	const NAV_MAX_JUMP_DOWN = CELL * 7;
	const NAV_MAX_JUMP_TIME = 1.35;
	const NAV_JUMP_HORIZONTAL_MARGIN = 0.82;
	const NAV_JUMP_SAMPLES = 18;

	const NAV_GOAL_X = CASTLE_RECT.x - BOT_SIZE * 0.45;
	const NAV_GOAL_MIN_Y = CASTLE_RECT.y - BOT_SIZE * 1.5;
	const NAV_GOAL_MAX_Y = CASTLE_RECT.y + CASTLE_RECT.h + BOT_SIZE * 1.5;

	// Wall-jumps are stateful actions, not a side effect of merely touching a wall.
	const WALL_JUMP_COOLDOWN = 0.22;
	const WALL_JUMP_LOCK_TIME = 0.16;
	const WALL_JUMP_REVERSE_TIME = 0.10;
	const WALL_JUMP_MIN_UPWARD_VELOCITY = -80;
	const WALL_JUMP_MAX_REPEAT_PER_SECOND = 5;

	// Hazard margins are deliberately larger than the actual collision shape.
	const SPIKE_LOOK_AHEAD = CELL * 1.65;
	const SPIKE_JUMP_LOOK_AHEAD = CELL * 2.25;
	const FIREBAR_DANGER_RADIUS = FIREBAR_BALL_RADIUS + BOT_SIZE * 0.65;
	const FIREBAR_PREDICTION_TIME = 0.90;
	const FIREBAR_SAMPLES = 9;
	const THWOMP_HORIZONTAL_MARGIN = BOT_SIZE * 0.80;
	const THWOMP_VERTICAL_MARGIN = BOT_SIZE * 0.50;
	const THWOMP_PREDICTION_TIME = 0.80;
	const ARROW_DANGER_RADIUS = BOT_SIZE * 0.75;
	const ARROW_PREDICTION_TIME = 0.45;
	const ARROW_SAMPLES = 5;

	type WallSide = 'left' | 'right';

	type Waypoint = {
		x: number;
		y: number;
		jump: boolean;
	};

	type NavNode = {
		x: number;
		y: number;
		col: number;
		row: number;
		supportUid: number;
		support: PlacedElement;
		supportLeftX: number;
		supportRightX: number;
	};

	type NavEdge = {
		to: number;
		cost: number;
		jump: boolean;
	};

	type NavigationGraph = {
		revision: number;
		nodes: NavNode[];
		edges: NavEdge[][];
	};

	type HazardDecision = {
		xDir: number | null;
		jump: boolean;
		priority: number;
	};

	class MinHeap {
		private readonly values: { node: number; priority: number }[] = [];

		get size(): number {
			return this.values.length;
		}

		push(value: { node: number; priority: number }): void {
			this.values.push(value);

			let index = this.values.length - 1;
			while (index > 0) {
				const parent = (index - 1) >> 1;
				if (this.values[parent].priority <= this.values[index].priority) break;

				[this.values[parent], this.values[index]] =
					[this.values[index], this.values[parent]];
				index = parent;
			}
		}

		pop(): { node: number; priority: number } | null {
			if (this.values.length === 0) return null;

			const result = this.values[0];
			const last = this.values.pop()!;

			if (this.values.length > 0) {
				this.values[0] = last;

				let index = 0;
				while (true) {
					const left = index * 2 + 1;
					const right = left + 1;
					let smallest = index;

					if (
						left < this.values.length &&
						this.values[left].priority < this.values[smallest].priority
					) {
						smallest = left;
					}

					if (
						right < this.values.length &&
						this.values[right].priority < this.values[smallest].priority
					) {
						smallest = right;
					}

					if (smallest === index) break;

					[this.values[index], this.values[smallest]] =
						[this.values[smallest], this.values[index]];
					index = smallest;
				}
			}

			return result;
		}
	}

	/**
	 * Runtime state is intentionally not serialized.
	 *
	 * The bot remembers its current route and, more importantly, the state of its
	 * wall-jump controller. This prevents the classic "touch wall -> jump ->
	 * immediately turn around -> jump again" oscillation.
	 */
	export class BotData {
		engineId = -1;

		navigationRevision = -1;
		path: Waypoint[] = [];
		pathIndex = 0;
		repathTimer = PATH_REPLAN_INTERVAL;
		stuckTimer = 0;

		lastX = NaN;
		lastY = NaN;
		lastProgressTime = 0;

		jumpCooldown = 0;
		jumpHoldTimer = 0;

		wallJumpLockTimer = 0;
		wallJumpReverseTimer = 0;
		lastWallJumpSide: WallSide | null = null;
		lastWallJumpAt = -Infinity;
		wallJumpCountWindow = 0;
		wallJumpWindowAge = 0;

		hazardCooldown = 0;

		reset(): void {
			this.engineId = -1;

			this.navigationRevision = -1;
			this.path.length = 0;
			this.pathIndex = 0;
			this.repathTimer = PATH_REPLAN_INTERVAL;
			this.stuckTimer = 0;

			this.lastX = NaN;
			this.lastY = NaN;
			this.lastProgressTime = 0;

			this.jumpCooldown = 0;
			this.jumpHoldTimer = 0;

			this.wallJumpLockTimer = 0;
			this.wallJumpReverseTimer = 0;
			this.lastWallJumpSide = null;
			this.lastWallJumpAt = -Infinity;
			this.wallJumpCountWindow = 0;
			this.wallJumpWindowAge = 0;

			this.hazardCooldown = 0;
		}
	}

	const graphCache = new WeakMap<GMCastle, NavigationGraph>();

	function getSurfaceY(element: PlacedElement, col: number): number {
		const top = element.y - element.getSize().height / 2;

		if (!(element instanceof RampElement)) return top;

		const localX = clamp(
			(col + 0.5 - element.col) / element.getSpec().cols,
			0,
			1,
		);

		/*
		 * RampElement.variant 0 rises toward +X, so its surface is highest on
		 * the right side. The navigation graph uses the exact same slope.
		 */
		return element.variant === 0
			? top + CELL * (1 - localX)
			: top + CELL * localX;
	}

	function botRectAt(x: number, y: number) {
		return {
			x: x - BOT_SIZE / 2,
			y: y - BOT_SIZE / 2,
			w: BOT_SIZE,
			h: BOT_SIZE,
		};
	}

	function intersectsElement(
		x: number,
		y: number,
		element: PlacedElement,
	): boolean {
		return collisions.RectRect(botRectAt(x, y), rectOf(element));
	}

	function isDangerousSupport(element: PlacedElement): boolean {
		/*
		 * These objects are useful geometry but poor surfaces to route through.
		 * A thwomp can move, a fire bar is continuously lethal, and spikes kill
		 * immediately. The bot can still jump across all three.
		 */
		return (
			element instanceof SpikeElement
			|| element instanceof FireBarElement
			|| element instanceof ThwompElement
		);
	}

	function getSupportAt(
		game: GMCastle,
		x: number,
		y: number,
	): PlacedElement | null {
		const feetY = y + BOT_SIZE / 2;
		let best: PlacedElement | null = null;
		let bestDistance = Infinity;

		for (const element of game.storage.elements.values()) {
			if (isDangerousSupport(element)) continue;

			const r = rectOf(element);
			if (x < r.x - 2 || x > r.x + r.w + 2) continue;

			const surfaceY = element instanceof RampElement
				? getSurfaceY(
					element,
					clamp(
						Math.floor((x - r.x) / CELL) + element.col,
						element.col,
						element.col + element.getSpec().cols - 1,
					),
				)
				: r.y;

			const distance = Math.abs(feetY - surfaceY);
			if (distance <= BOT_SIZE * 0.75 && distance < bestDistance) {
				best = element;
				bestDistance = distance;
			}
		}

		return best;
	}

	/**
	 * A surface node is created only when the bot can actually stand there.
	 * This is stricter than the old implementation and prevents spikes, fire
	 * bars and thwomps from accidentally becoming valid navigation platforms.
	 */
	function buildNodes(game: GMCastle): NavNode[] {
		const nodes: NavNode[] = [];

		for (const element of game.storage.elements.values()) {
			if (isDangerousSupport(element)) continue;

			const spec = element.getSpec();
			const rect = rectOf(element);

			for (let r = 0; r < spec.rows; r++) {
				const row = element.row + r;

				for (let c = 0; c < spec.cols; c++) {
					const col = element.col + c;

					// Only the highest exposed cell has a usable top surface.
					if (game.elementAtCell(col, row - 1) !== null) continue;

					const x = (col + 0.5) * CELL;
					const y = getSurfaceY(element, col) - BOT_SIZE / 2;

					if (
						y < BOT_SIZE / 2
						|| y > LEVEL_HEIGHT - BOT_SIZE / 2
					) {
						continue;
					}

					/*
					 * Do not create a node if a spike/firebar/thwomp is already
					 * occupying the bot's standing rectangle.
					 */
					if (
						[...game.storage.elements.values()].some(other =>
							other.uid !== element.uid
							&& isDangerousSupport(other)
							&& intersectsElement(x, y, other)
						)
					) {
						continue;
					}

					nodes.push({
						x,
						y,
						col,
						row,
						supportUid: element.uid,
						support: element,
						supportLeftX: rect.x,
						supportRightX: rect.x + rect.w,
					});
				}
			}
		}

		return nodes;
	}

	function horizontalJumpDistance(time: number): number {
		/*
		 * The actual controller accelerates toward BOT_RUN_SPEED. Planning with
		 * the full speed is optimistic, so use a conservative factor.
		 */
		return BOT_RUN_SPEED * time * 0.90;
	}

	function getJumpTakeoff(
		from: NavNode,
		to: NavNode,
	): { x: number; y: number } {
		const direction = Math.sign(to.x - from.x);

		if (direction === 0) {
			return { x: from.x, y: from.y };
		}

		const x = direction > 0
			? from.supportRightX - BOT_SIZE / 2 - 3
			: from.supportLeftX + BOT_SIZE / 2 + 3;

		const localX = clamp(
			x - from.supportLeftX,
			0,
			from.supportRightX - from.supportLeftX,
		);

		let surfaceY =
			from.support.y - from.support.getSize().height / 2;

		if (from.support instanceof RampElement) {
			const width = from.supportRightX - from.supportLeftX;
			const ratio = width > 0 ? localX / width : 0.5;

			surfaceY = from.support.variant === 0
				? surfaceY + CELL * (1 - ratio)
				: surfaceY + CELL * ratio;
		}

		return {
			x,
			y: surfaceY - BOT_SIZE / 2,
		};
	}

	function getJumpTime(deltaY: number): number | null {
		const discriminant =
			NAV_JUMP_SPEED * NAV_JUMP_SPEED
			+ 2 * NAV_GRAVITY * deltaY;

		if (discriminant <= 0) return null;

		const time =
			(NAV_JUMP_SPEED + Math.sqrt(discriminant))
			/ NAV_GRAVITY;

		if (time <= 0 || time > NAV_MAX_JUMP_TIME) return null;
		return time;
	}

	function pointHitsThwomp(
		game: GMCastle,
		x: number,
		y: number,
		time: number,
	): boolean {
		const rect = botRectAt(x, y);

		for (const element of game.storage.elements.values()) {
			if (!(element instanceof ThwompElement)) continue;

			const triggerLeft =
				element.x - THWOMP_TRIGGER_HALF_WIDTH - THWOMP_HORIZONTAL_MARGIN;
			const triggerRight =
				element.x + THWOMP_TRIGGER_HALF_WIDTH + THWOMP_HORIZONTAL_MARGIN;

			const triggerTop = element.y + THWOMP_VERTICAL_MARGIN;
			const triggerBottom =
				element.y + THWOMP_TRIGGER_DEPTH + BOT_SIZE;

			/*
			 * During the rising phase the danger shrinks with the thwomp.
			 * During idle/slam/rest, entering the trigger corridor is unsafe.
			 */
			if (element.phase === THWOMP_PHASE_RISE) {
				continue;
			}

			if (
				rect.x + rect.w > triggerLeft
				&& rect.x < triggerRight
				&& rect.y + rect.h > triggerTop
				&& rect.y < triggerBottom
			) {
				return true;
			}

			/*
			 * The thwomp is about to be triggered when the bot is below it.
			 * Predicting the trigger prevents the bot from "running under it"
			 * during the same frame in which the state switches to SLAM.
			 */
			if (
				time <= THWOMP_PREDICTION_TIME
				&& Math.abs(x - element.x)
					<= THWOMP_TRIGGER_HALF_WIDTH + BOT_SIZE
				&& y > element.y
				&& y - element.y <= THWOMP_TRIGGER_DEPTH
			) {
				return true;
			}
		}

		return false;
	}

	function pointHitsFireBar(
		game: GMCastle,
		x: number,
		y: number,
		time: number,
	): boolean {
		const rect = botRectAt(x, y);

		for (const element of game.storage.elements.values()) {
			if (!(element instanceof FireBarElement)) continue;

			for (let i = 0; i < FIREBAR_SAMPLES; i++) {
				const t = time + FIREBAR_PREDICTION_TIME * i / FIREBAR_SAMPLES;
				const angle =
					element.angle + FIREBAR_ROTATION_SPEED * t;

				for (let ballIndex = 1; ballIndex <= FIREBAR_BALLS; ballIndex++) {
					const ball = {
						x:
							element.x
							+ Math.cos(angle)
								* ballIndex
								* FIREBAR_BALL_SPACING,
						y:
							element.y
							+ Math.sin(angle)
								* ballIndex
								* FIREBAR_BALL_SPACING,
						r: FIREBAR_BALL_RADIUS,
					};

					/*
					 * RectCircle is exact enough for the actual collision model;
					 * the extra danger radius is handled by a second circle test.
					 */
					if (collisions.RectCircle(rect, ball)) return true;

					const dx = x - ball.x;
					const dy = y - ball.y;
					if (
						dx * dx + dy * dy
						<= (ball.r + FIREBAR_DANGER_RADIUS) ** 2
					) {
						return true;
					}
				}
			}
		}

		return false;
	}

	function pointHitsArrow(
		game: GMCastle,
		x: number,
		y: number,
		time: number,
	): boolean {
		const rect = botRectAt(x, y);

		for (const arrow of game.storage.arrows.values()) {
			if (arrow.consumed) continue;

			for (let i = 0; i <= ARROW_SAMPLES; i++) {
				const t = time + ARROW_PREDICTION_TIME * i / ARROW_SAMPLES;
				const ax = arrow.x + (arrow as any).forced.x * t;
				const ay = arrow.y + (arrow as any).forced.y * t;

				if (
					collisions.RectRect(
						rect,
						{
							x: ax - ARROW_LENGTH / 2,
							y: ay - ARROW_THICKNESS / 2,
							w: ARROW_LENGTH,
							h: ARROW_THICKNESS,
						},
					)
				) {
					return true;
				}

				const dx = x - ax;
				const dy = y - ay;
				if (dx * dx + dy * dy <= ARROW_DANGER_RADIUS ** 2) {
					return true;
				}
			}
		}

		return false;
	}

	function isStaticArcClear(
		game: GMCastle,
		from: NavNode,
		to: NavNode,
		takeoff: { x: number; y: number },
		time: number,
	): boolean {
		const direction = Math.sign(to.x - takeoff.x);

		for (let i = 1; i <= NAV_JUMP_SAMPLES; i++) {
			const t = time * i / NAV_JUMP_SAMPLES;
			const x =
				takeoff.x
				+ direction * horizontalJumpDistance(t);
			const y =
				takeoff.y
				- NAV_JUMP_SPEED * t
				+ 0.5 * NAV_GRAVITY * t * t;

			for (const element of game.storage.elements.values()) {
				if (
					element.uid === from.supportUid
					|| element.uid === to.supportUid
				) {
					continue;
				}

				/*
				 * Spikes are lethal but not solid. They must therefore be
				 * explicitly rejected rather than treated as normal geometry.
				 */
				if (
					element instanceof SpikeElement
					&& intersectsElement(x, y, element)
				) {
					return false;
				}

				/*
				 * Fire bars and thwomps are moving hazards. A trajectory which
				 * intersects their predicted danger volume is rejected.
				 */
				if (
					element instanceof FireBarElement
					&& pointHitsFireBar(game, x, y, t)
				) {
					return false;
				}

				if (
					element instanceof ThwompElement
					&& pointHitsThwomp(game, x, y, t)
				) {
					return false;
				}

				/*
				 * Ordinary solid geometry remains a hard obstacle.
				 * Ramps are intentionally included here because their AABB is
				 * conservative during a jump; being conservative is safer.
				 */
				if (
					!(element instanceof SpikeElement)
					&& !(element instanceof FireBarElement)
					&& !(element instanceof ThwompElement)
					&& intersectsElement(x, y, element)
				) {
					return false;
				}
			}

			if (pointHitsArrow(game, x, y, t)) return false;
		}

		return true;
	}

	function buildEdges(
		game: GMCastle,
		nodes: NavNode[],
	): NavEdge[][] {
		const edges = nodes.map(() => [] as NavEdge[]);
		const byColumn = new Map<number, number[]>();

		nodes.forEach((node, index) => {
			const list = byColumn.get(node.col) ?? [];
			list.push(index);
			byColumn.set(node.col, list);
		});

		for (let fromIndex = 0; fromIndex < nodes.length; fromIndex++) {
			const from = nodes[fromIndex];

			/*
			 * Adjacent-cell walking handles flat blocks and ramps. For ramps,
			 * the vertical difference is measured from the exact surface height,
			 * so the bot naturally walks up/down the slope instead of jumping.
			 */
			for (let column = from.col - 1; column <= from.col + 1; column++) {
				const candidates = byColumn.get(column);
				if (!candidates) continue;

				for (const toIndex of candidates) {
					if (toIndex === fromIndex) continue;

					const to = nodes[toIndex];
					const walkingDx = Math.abs(to.x - from.x);
					const walkingDy = to.y - from.y;

					if (
						Math.abs(column - from.col) <= 1
						&& Math.abs(walkingDy) <= NAV_WALK_MAX_VERTICAL_DELTA
					) {
						edges[fromIndex].push({
							to: toIndex,
							cost:
								walkingDx
								+ Math.abs(walkingDy) * 0.75,
							jump: false,
						});
					}
				}
			}

			/*
			 * Jump candidates are deliberately local. A single jump cannot
			 * magically cross half the map, and keeping the graph sparse makes
			 * replanning cheap even with many bots.
			 */
			for (
				let column = from.col - 4;
				column <= from.col + 4;
				column++
			) {
				const candidates = byColumn.get(column);
				if (!candidates) continue;

				for (const toIndex of candidates) {
					if (toIndex === fromIndex) continue;

					const to = nodes[toIndex];
					const takeoff = getJumpTakeoff(from, to);
					const dx = Math.abs(to.x - takeoff.x);
					const dy = to.y - takeoff.y;

					if (dy < -NAV_MAX_JUMP_UP || dy > NAV_MAX_JUMP_DOWN) {
						continue;
					}

					const time = getJumpTime(dy);
					if (time === null) continue;

					const horizontalReach =
						horizontalJumpDistance(time)
						* NAV_JUMP_HORIZONTAL_MARGIN
						+ CELL * 0.20;

					if (dx > horizontalReach) continue;

					if (!isStaticArcClear(game, from, to, takeoff, time)) {
						continue;
					}

					/*
					 * Prefer walking when both choices are valid. This keeps the
					 * bot stable and reserves jumps for genuine traversal.
					 */
					edges[fromIndex].push({
						to: toIndex,
						cost:
							Math.hypot(dx, dy)
							+ CELL * 1.10,
						jump: true,
					});
				}
			}
		}

		return edges;
	}

	function getNavigationGraph(game: GMCastle): NavigationGraph {
		const revision = game.getNavigationRevision();
		const cached = graphCache.get(game);

		if (cached?.revision === revision) return cached;

		const nodes = buildNodes(game);
		const graph: NavigationGraph = {
			revision,
			nodes,
			edges: buildEdges(game, nodes),
		};

		graphCache.set(game, graph);
		return graph;
	}

	function heuristic(node: NavNode): number {
		return Math.max(0, NAV_GOAL_X - node.x);
	}

	function isGoalNode(node: NavNode): boolean {
		return (
			node.x >= NAV_GOAL_X
			&& node.y >= NAV_GOAL_MIN_Y
			&& node.y <= NAV_GOAL_MAX_Y
		);
	}

	function findStartNode(bot: Bot, nodes: NavNode[]): number {
		let best = -1;
		let bestScore = Infinity;

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];

			/*
			 * A grounded bot should start on the same vertical layer. An airborne
			 * bot is allowed to select the nearest reachable surface, which makes
			 * replanning during a jump much less destructive.
			 */
			const heightPenalty = bot.walker.onFloor()
				? Math.abs(node.y - bot.y) * 2.5
				: Math.abs(node.y - bot.y) * 0.35;

			const hazardPenalty =
				node.support instanceof TrampolineElement
					? 8
					: 0;

			const score =
				Math.hypot(node.x - bot.x, node.y - bot.y)
				+ heightPenalty
				+ hazardPenalty;

			if (score < bestScore) {
				bestScore = score;
				best = i;
			}
		}

		return best;
	}

	function findPath(
		bot: Bot,
		graph: NavigationGraph,
	): Waypoint[] {
		const start = findStartNode(bot, graph.nodes);
		if (start < 0) return [];

		const gScore = new Array<number>(graph.nodes.length).fill(Infinity);
		const cameFrom = new Int32Array(graph.nodes.length);
		const cameJump = new Array<boolean>(graph.nodes.length).fill(false);
		cameFrom.fill(-1);

		const open = new MinHeap();
		gScore[start] = 0;
		open.push({
			node: start,
			priority: heuristic(graph.nodes[start]),
		});

		let goal = -1;

		while (open.size > 0) {
			const currentItem = open.pop()!;
			const current = currentItem.node;

			if (
				currentItem.priority
				> gScore[current]
					+ heuristic(graph.nodes[current])
					+ 0.0001
			) {
				continue;
			}

			if (isGoalNode(graph.nodes[current])) {
				goal = current;
				break;
			}

			for (const edge of graph.edges[current]) {
				const tentative = gScore[current] + edge.cost;

				if (tentative >= gScore[edge.to]) continue;

				gScore[edge.to] = tentative;
				cameFrom[edge.to] = current;
				cameJump[edge.to] = edge.jump;

				open.push({
					node: edge.to,
					priority:
						tentative + heuristic(graph.nodes[edge.to]),
				});
			}
		}

		if (goal < 0) return [];

		const reversed: Waypoint[] = [];
		let current = goal;

		while (current !== start) {
			const node = graph.nodes[current];
			const parent = cameFrom[current];

			if (parent < 0) return [];

			if (cameJump[current]) {
				const takeoff =
					getJumpTakeoff(graph.nodes[parent], node);

				reversed.push({
					x: node.x,
					y: node.y,
					jump: true,
				});

				reversed.push({
					x: takeoff.x,
					y: takeoff.y,
					jump: false,
				});
			} else {
				reversed.push({
					x: node.x,
					y: node.y,
					jump: false,
				});
			}

			current = parent;
		}

		reversed.reverse();

		while (
			reversed.length > 0
			&& Math.hypot(
				reversed[0].x - bot.x,
				reversed[0].y - bot.y,
			) <= PATH_NODE_REACHED_DISTANCE
		) {
			reversed.shift();
		}

		return reversed;
	}

	function advancePath(bot: Bot): void {
		const data = bot.botData;

		while (data.pathIndex < data.path.length) {
			const waypoint = data.path[data.pathIndex];

			if (
				Math.abs(waypoint.x - bot.x) <= PATH_NODE_REACHED_DISTANCE
				&& Math.abs(waypoint.y - bot.y) <= PATH_NODE_REACHED_DISTANCE
			) {
				data.pathIndex++;
				continue;
			}

			/*
			 * Takeoff waypoints are crossed by the actual jump. Once the bot is
			 * clearly past them, never let a tiny collision correction make it
			 * walk backwards to the old waypoint.
			 */
			if (
				waypoint.jump
				&& bot.y < waypoint.y - CELL * 0.75
				&& bot.velocity.y < 0
			) {
				data.pathIndex++;
				continue;
			}

			break;
		}
	}

	function shouldReplan(bot: Bot, game: GMCastle): boolean {
		const data = bot.botData;

		return (
			data.navigationRevision !== game.getNavigationRevision()
			|| (
				data.path.length > 0
				&& data.pathIndex >= data.path.length
			)
			|| (
				data.path.length === 0
				&& data.repathTimer >= PATH_REPLAN_INTERVAL
			)
			|| data.stuckTimer >= PATH_STUCK_TIMEOUT
		);
	}

	function replan(bot: Bot, game: GMCastle): void {
		const data = bot.botData;
		const graph = getNavigationGraph(game);

		data.path = findPath(bot, graph);
		data.pathIndex = 0;
		data.navigationRevision = graph.revision;
		data.repathTimer = 0;
		data.stuckTimer = 0;
	}

	function getWallSide(bot: Bot): WallSide | null {
		if (bot.walker.onLeft()) return 'left';
		if (bot.walker.onRight()) return 'right';
		return null;
	}

	function wallSideSign(side: WallSide): number {
		return side === 'left' ? -1 : 1;
	}

	function chooseBaseDirection(
		bot: Bot,
		waypoint: Waypoint | undefined,
	): number {
		if (!waypoint) return 1;

		const dx = waypoint.x - bot.x;

		/*
		 * Hysteresis prevents a bot from alternating left/right every frame when
		 * it is centered over a waypoint or when collision resolution jitters it.
		 */
		if (Math.abs(dx) <= PATH_X_TOLERANCE) {
			if (Math.abs(bot.velocity.x) < BOT_RUN_SPEED * 0.25) return 0;
			return Math.sign(bot.velocity.x);
		}

		return Math.sign(dx);
	}

	function isSpikeAhead(
		game: GMCastle,
		bot: Bot,
		xDir: number,
	): boolean {
		if (!bot.walker.onFloor() || xDir === 0) return false;

		const start = BOT_SIZE / 2;
		const end = SPIKE_LOOK_AHEAD;

		for (const element of game.storage.elements.values()) {
			if (!(element instanceof SpikeElement)) continue;

			const rect = rectOf(element);
			const centerDistance = (element.x - bot.x) * xDir;

			if (
				centerDistance >= start
				&& centerDistance <= end
				&& Math.abs(bot.y - rect.y) <= BOT_SIZE
			) {
				return true;
			}
		}

		return false;
	}

	function isSpikeUnderLanding(
		game: GMCastle,
		x: number,
		y: number,
	): boolean {
		for (const element of game.storage.elements.values()) {
			if (!(element instanceof SpikeElement)) continue;

			if (
				collisions.RectRect(
					botRectAt(x, y),
					rectOf(element),
				)
			) {
				return true;
			}
		}

		return false;
	}

	function chooseFireBarResponse(
		game: GMCastle,
		bot: Bot,
		baseDir: number,
	): HazardDecision {
		let nearestDistance = Infinity;
		let nearestDx = 0;
		let nearestDy = 0;
		let dangerous = false;

		for (const element of game.storage.elements.values()) {
			if (!(element instanceof FireBarElement)) continue;

			for (const ball of element.getBalls()) {
				const dx = bot.x - ball.x;
				const dy = bot.y - ball.y;
				const distance = Math.hypot(dx, dy);

				if (distance < nearestDistance) {
					nearestDistance = distance;
					nearestDx = dx;
					nearestDy = dy;
				}
			}
		}

		if (
			nearestDistance === Infinity
			|| nearestDistance > FIREBAR_DANGER_RADIUS * 1.8
		) {
			if (pointHitsFireBar(game, bot.x, bot.y, 0)) {
				dangerous = true;
			} else {
				return { xDir: null, jump: false, priority: 0 };
			}
		} else {
			dangerous = true;
		}

		if (!dangerous) {
			return { xDir: null, jump: false, priority: 0 };
		}

		/*
		 * Escape radially first. A fire bar rotates around a fixed center, so
		 * simply jumping every time is unreliable; moving away from the current
		 * fireball gives the controller a deterministic escape direction.
		 */
		let escapeDir =
			Math.abs(nearestDx) > BOT_SIZE * 0.25
				? Math.sign(nearestDx)
				: -baseDir;

		if (escapeDir === 0) escapeDir = 1;

		const shouldJump =
			bot.walker.onFloor()
			&& Math.abs(nearestDy) <= FIREBAR_DANGER_RADIUS
			&& bot.botData.jumpCooldown <= 0;

		return {
			xDir: escapeDir,
			jump: shouldJump,
			priority: 100,
		};
	}

	function chooseThwompResponse(
		game: GMCastle,
		bot: Bot,
		baseDir: number,
	): HazardDecision {
		for (const element of game.storage.elements.values()) {
			if (!(element instanceof ThwompElement)) continue;

			const dx = bot.x - element.x;
			const dy = bot.y - element.y;

			if (
				Math.abs(dx)
					> THWOMP_TRIGGER_HALF_WIDTH + BOT_SIZE
				|| dy <= 0
				|| dy > THWOMP_TRIGGER_DEPTH + BOT_SIZE
			) {
				continue;
			}

			/*
			 * Never continue deeper into a thwomp trigger. If the bot is already
			 * inside it, move to the nearest side. During SLAM/REST, waiting is
			 * safer than trying to jump through the crusher.
			 */
			if (element.phase !== THWOMP_PHASE_RISE) {
				const escapeDir =
					Math.abs(dx) < BOT_SIZE * 0.5
						? (baseDir <= 0 ? -1 : 1)
						: Math.sign(dx);

				return {
					xDir: escapeDir,
					jump:
						element.phase === THWOMP_PHASE_SLAM
						&& bot.walker.onFloor()
						&& bot.botData.jumpCooldown <= 0
						&& dy > THWOMP_MAX_DROP * 0.85,
					priority: 95,
				};
			}

			/*
			 * The thwomp is rising: cross only if the bot is moving out of the
			 * trigger, otherwise brake and let the safe window open.
			 */
			if (
				Math.abs(dx)
					< THWOMP_TRIGGER_HALF_WIDTH + BOT_SIZE * 0.4
				&& Math.sign(dx) === baseDir
			) {
				return {
					xDir: 0,
					jump: false,
					priority: 80,
				};
			}
		}

		return { xDir: null, jump: false, priority: 0 };
	}

	function chooseArrowResponse(
		game: GMCastle,
		bot: Bot,
		baseDir: number,
	): HazardDecision {
		if (!pointHitsArrow(game, bot.x, bot.y, 0)) {
			return { xDir: null, jump: false, priority: 0 };
		}

		let nearestDx = 0;
		let nearestDy = 0;
		let nearest = Infinity;

		for (const arrow of game.storage.arrows.values()) {
			if (arrow.consumed) continue;

			const dx = bot.x - arrow.x;
			const dy = bot.y - arrow.y;
			const distance = Math.hypot(dx, dy);

			if (distance < nearest) {
				nearest = distance;
				nearestDx = dx;
				nearestDy = dy;
			}
		}

		const horizontalEscape =
			Math.abs(nearestDx) > BOT_SIZE * 0.3
				? Math.sign(nearestDx)
				: -baseDir;

		return {
			xDir: horizontalEscape || 1,
			jump:
				bot.walker.onFloor()
				&& Math.abs(nearestDy) < BOT_SIZE * 1.2
				&& bot.botData.jumpCooldown <= 0,
			priority: 90,
		};
	}

	function chooseHazardResponse(
		game: GMCastle,
		bot: Bot,
		baseDir: number,
	): HazardDecision {
		/*
		 * Highest priority first. A lethal collision must always override the
		 * navigation objective.
		 */
		const fireBar = chooseFireBarResponse(game, bot, baseDir);
		if (fireBar.priority > 0) return fireBar;

		const thwomp = chooseThwompResponse(game, bot, baseDir);
		if (thwomp.priority > 0) return thwomp;

		const arrow = chooseArrowResponse(game, bot, baseDir);
		if (arrow.priority > 0) return arrow;

		if (isSpikeAhead(game, bot, baseDir)) {
			return {
				xDir: baseDir,
				jump:
					bot.botData.jumpCooldown <= 0
					&& bot.walker.onFloor(),
				priority: 85,
			};
		}

		return { xDir: null, jump: false, priority: 0 };
	}

	function shouldWallJump(
		bot: Bot,
		data: BotData,
		waypoint: Waypoint | undefined,
		xDir: number,
	): { jump: boolean; wallSide: WallSide | null; xDir: number } {
		const wallSide = getWallSide(bot);

		if (!wallSide) {
			return {
				jump: false,
				wallSide: null,
				xDir,
			};
		}

		/*
		 * Do not immediately jump just because a wall is touched. That was the
		 * source of the old chaotic wall-jump behaviour.
		 */
		if (data.jumpCooldown > 0 || data.wallJumpLockTimer > 0) {
			return {
				jump: false,
				wallSide,
				xDir,
			};
		}

		if (
			data.lastWallJumpSide === wallSide
			&& data.wallJumpReverseTimer > 0
		) {
			return {
				jump: false,
				wallSide,
				xDir: wallSide === 'left' ? 1 : -1,
			};
		}

		const targetDx = waypoint
			? waypoint.x - bot.x
			: CASTLE_RECT.x - bot.x;
		const targetDy = waypoint
			? waypoint.y - bot.y
			: -CELL;

		/*
		 * A wall-jump is justified when:
		 * 1. the target is above us and the current wall blocks progress, or
		 * 2. the bot is moving into the wall and is genuinely stuck.
		 *
		 * The second condition is intentionally conservative.
		 */
		const targetIsAbove = targetDy < -BOT_SIZE * 0.75;
		const pushingIntoWall =
			(wallSide === 'left' && xDir < 0)
			|| (wallSide === 'right' && xDir > 0);

		const stuckAgainstWall =
			pushingIntoWall
			&& data.stuckTimer >= 0.16;

		if (!targetIsAbove && !stuckAgainstWall) {
			return {
				jump: false,
				wallSide,
				xDir: wallSide === 'left' ? 1 : -1,
			};
		}

		/*
		 * Avoid pathological infinite wall-jump loops. A healthy bot can still
		 * climb several times per second, but it cannot spam the same wall every
		 * frame.
		 */
		if (
			data.wallJumpWindowAge < 1
			&& data.wallJumpCountWindow >= WALL_JUMP_MAX_REPEAT_PER_SECOND
		) {
			return {
				jump: false,
				wallSide,
				xDir: wallSide === 'left' ? 1 : -1,
			};
		}

		const away = wallSide === 'left' ? 1 : -1;

		return {
			jump: true,
			wallSide,
			xDir: away,
		};
	}

	function chooseJump(
		game: GMCastle,
		bot: Bot,
		data: BotData,
		waypoint: Waypoint | undefined,
		xDir: number,
	): { jump: boolean; xDir: number } {
		if (data.jumpCooldown > 0) {
			return { jump: false, xDir };
		}

		const wall = shouldWallJump(bot, data, waypoint, xDir);
		if (wall.jump) return { jump: true, xDir: wall.xDir };

		if (
			bot.walker.onFloor()
			&& waypoint?.jump === true
		) {
			/*
			 * Do not jump from a trampoline. The trampoline collision already
			 * supplies the vertical impulse; manually jumping would fight it.
			 */
			const support = getSupportAt(
				game,
				bot.x,
				bot.y,
			);

			if (!(support instanceof TrampolineElement)) {
				return { jump: true, xDir };
			}
		}

		return { jump: false, xDir };
	}

	function chooseNavigationDirection(
		bot: Bot,
		waypoint: Waypoint | undefined,
	): number {
		if (!waypoint) {
			/*
			 * When A* cannot find a path, the tactical controller still knows the
			 * global objective. This is preferable to stopping forever.
			 */
			return bot.x < NAV_GOAL_X ? 1 : 0;
		}

		return chooseBaseDirection(bot, waypoint);
	}

	/**
	 * Main bot decision function.
	 *
	 * The function intentionally returns only intent:
	 * - xDir: -1, 0 or +1
	 * - jump: a one-frame jump request
	 *
	 * Physics remain in Bot.processBeforeEngine, which keeps the AI deterministic
	 * and prevents the navigation code from bypassing the engine's collision model.
	 */
	export function getBotInput<TEngineData extends platformEngine.EngineData>(
		engine: platformEngine.IBlockEngine<TEngineData>,
		bot: Bot,
	): { xDir: number; jump: boolean } {
		const game = engine.getGame() as unknown as GMCastle;
		const data = bot.botData;

		if (bot.x >= CASTLE_RECT.x - BOT_SIZE / 2) {
			return { xDir: 1, jump: false };
		}

		advancePath(bot);

		if (shouldReplan(bot, game)) {
			replan(bot, game);
		}

		const waypoint = data.path[data.pathIndex];
		let xDir = chooseNavigationDirection(bot, waypoint);

		/*
		 * Tactical hazards are evaluated after pathfinding. This is a classic
		 * layered controller: global route first, local collision avoidance second.
		 */
		const hazard = chooseHazardResponse(game, bot, xDir);

		if (hazard.priority > 0 && hazard.xDir !== null) {
			xDir = hazard.xDir;
		}

		let jump = hazard.jump;

		/*
		 * A spike is a static, one-shot hazard. If a planned landing is directly
		 * on it, abandon that jump rather than blindly following A*.
		 */
		if (
			waypoint?.jump
			&& isSpikeUnderLanding(game, waypoint.x, waypoint.y)
		) {
			jump = false;
			data.pathIndex++;
		}

		if (!jump) {
			const jumpDecision = chooseJump(
				game,
				bot,
				data,
				waypoint,
				xDir,
			);

			if (jumpDecision.jump) {
				jump = true;
				xDir = jumpDecision.xDir;
			}
		}

		/*
		 * During a wall-jump the horizontal input must remain directed away from
		 * the wall. This is the key difference from the old "push into wall"
		 * behaviour and removes most wall-jump oscillation.
		 */
		if (data.wallJumpLockTimer > 0 && data.lastWallJumpSide) {
			xDir = data.lastWallJumpSide === 'left' ? 1 : -1;
		}

		return { xDir, jump };
	}
}

/*
 * Export only the bot-AI API used by the game mode.
 */
export import BotData = Bots.BotData;
export import getBotInput = Bots.getBotInput;

/* ========================================================================== */
/* PLAYER                                                                     */
/* ========================================================================== */



class Player {
	connected = true;
	team: 'red' | 'blue' = DEFAULT_TEAM_RED;
	elixir = ELIXIR_START;
	kills = 0;

	/** Elixir recharges with time, up to ELIXIR_MAX. */
	regen(dt: number) {
		this.elixir = Math.min(ELIXIR_MAX, this.elixir + ELIXIR_REGEN_PER_SECOND * dt);
	}

	save(): Fields {
		return {
			connected: this.connected,
			isRed: this.team === DEFAULT_TEAM_RED,
			elixir: this.elixir,
			kills: this.kills,
		};
	}

	load(obj: Fields) {
		this.connected = obj.connected;
		this.team = obj.isRed ? DEFAULT_TEAM_RED : DEFAULT_TEAM_BLUE;
		this.elixir = obj.elixir;
		this.kills = obj.kills;
	}
}

/* ========================================================================== */
/* ENGINE BLOCKS: COMMON BASE                                                 */
/* ========================================================================== */

/**
 * Pairs of blocks that never push each other but still receive "ghost" collision
 * callbacks (so that they can kill / bounce / be consumed).
 */
function isGhostPair(a: GameBlock, b: GameBlock): boolean {
	// Arrows fly through everything (they only generate callbacks)
	if (a instanceof Arrow || b instanceof Arrow) return true;
	// Walking creatures never push each other
	const aMob = a instanceof Bot || a instanceof Monster;
	const bMob = b instanceof Bot || b instanceof Monster;
	if (aMob && bMob) return true;
	// Spikes are not solid: creatures touching them simply die
	if (a instanceof SpikeElement || b instanceof SpikeElement) return true;
	return false;
}

/**
 * Base class of everything living in the engine.
 * `uid` is a STABLE network id: engine ids are not stable across load(), so the
 * "blockId" exchanged in inputs / saves is this uid.
 */
abstract class GameBlock extends platformEngine.Block<NoData, CDEngineData> {
	uid = -1;
	engineId = -1;

	override applyCollision(_id: BlockId, _data: NoData | null, other: Entry): boolean {
		return !isGhostPair(this, other.block as GameBlock);
	}
}

/* ========================================================================== */
/* PLACEABLE ELEMENTS                                                         */
/* ========================================================================== */

interface ElementSpec {
	id: string;
	label: string;
	texture: string;
	price: number;
	maxHp: number;
	cols: number;
	rows: number;
	fallbackColor: string;
	/** Optional selectable placement variants shown above this element's card. */
	placementVariants?: readonly string[];
}

interface ElementInit {
	col: number;
	row: number;
	owner: number;
	variant: number;
}

type CastleProtocolTypes = ReturnType<typeof protocols.get>;

interface ElementClass {
	readonly SPEC: ElementSpec;
	readonly DATA_MESSAGE: keyof CastleProtocolTypes;
	create(init: ElementInit): PlacedElement;
}

/** Positions and fills a freshly constructed element. */
function initElement<T extends PlacedElement>(el: T, init: ElementInit): T {
	el.col = init.col;
	el.row = init.row;
	el.owner = init.owner;
	el.variant = init.variant;
	el.hp = el.getMaxHp();
	el.snapToCell();
	return el;
}

/**
 * Common behaviour of all grid elements:
 * - owner (player index, NO_OWNER for the neutral floor),
 * - hp = remaining lifetime in seconds (hp -= dt every frame),
 * - save() / load(), drawing with the damage overlay.
 */
abstract class PlacedElement extends GameBlock {
	col = 0;
	row = 0;
	owner = NO_OWNER;
	hp = 0;
	/** Free integer parameter chosen by the player at placement time (ramp: 0 = rises to the right, 1 = left). */
	variant = 0;

	abstract getSpec(): ElementSpec;
	abstract getTypeIdx(): number;

	getMaxHp(): number {
		return this.owner === NO_OWNER ? NEUTRAL_BLOCK_LIFETIME : this.getSpec().maxHp;
	}

	override getSize(): Size {
		const spec = this.getSpec();
		return { width: spec.cols * CELL, height: spec.rows * CELL };
	}

	/** Moves the block so that it exactly covers its grid cells. */
	snapToCell() {
		const spec = this.getSpec();
		this.x = (this.col + spec.cols / 2) * CELL;
		this.y = (this.row + spec.rows / 2) * CELL;
	}

	save(): Fields {
		return { hp: this.hp, owner: this.owner, col: this.col, row: this.row, variant: this.variant };
	}

	load(obj: Fields) {
		this.hp = obj.hp;
		this.owner = obj.owner;
		this.col = obj.col;
		this.row = obj.row;
		this.variant = obj.variant;
		this.snapToCell();
	}

	override processBeforeEngine(_id: BlockId, dt: number, engine: Engine): void {
		this.hp -= dt;
		if (this.hp <= 0) {
			engine.getGame().queueRemoval(this.uid);
			return;
		}
		this.tick(dt, engine);
	}

	/** Per-element logic, executed every frame while the element is alive. */
	protected tick(_dt: number, _engine: Engine): void {}

	/** Draws the sprite (default: the texture stretched over the footprint). */
	protected drawBody(ctx: CanvasRenderingContext2D, folder: Folder, colorId: number | undefined) {
		const spec = this.getSpec();
		const size = this.getSize();
		drawTexture(ctx, folder, spec.texture, colorId, this.x, this.y, size.width, size.height, spec.fallbackColor);
	}

	/** Draws the element and its wear effect. */
	draw(ctx: CanvasRenderingContext2D, folder: Folder, colorId: number | undefined, alpha: number) {
		ctx.save();
		ctx.globalAlpha = alpha;
		this.drawBody(ctx, folder, colorId);
		const size = this.getSize();
		drawDamageOverlay(ctx, this.x, this.y, size.width, size.height, this.hp / this.getMaxHp(), this.uid);
		ctx.restore();
	}
}

/* -------------------------------- block ---------------------------------- */

class BlockElement extends PlacedElement {
	static readonly SPEC: ElementSpec = {
		id: 'block', label: 'Block', texture: TEX_BLOCK, price: BLOCK_PRICE,
		maxHp: BLOCK_HP, cols: 1, rows: 1, fallbackColor: '#8d6e63',
	};
	static readonly DATA_MESSAGE = 'BlockData';
	static create(init: ElementInit) { return initElement(new BlockElement(), init); }

	getSpec() { return BlockElement.SPEC; }
	getTypeIdx() { return TYPE_BLOCK; }
}

/* --------------------------------- spike --------------------------------- */

class SpikeElement extends PlacedElement {
	static readonly SPEC: ElementSpec = {
		id: 'spike', label: 'Spikes', texture: TEX_SPIKE, price: SPIKE_PRICE,
		maxHp: SPIKE_HP, cols: 1, rows: 1, fallbackColor: '#b0bec5',
	};
	static readonly DATA_MESSAGE = 'SpikeData';
	static create(init: ElementInit) { return initElement(new SpikeElement(), init); }

	getSpec() { return SpikeElement.SPEC; }
	getTypeIdx() { return TYPE_SPIKE; }

	/** Anything walking into the spikes dies; the owner gets the point. */
	override detectCollision(_id: BlockId, other: Entry, _side: Side, engine: Engine): void {
		if (other.block instanceof Bot) {
			engine.getGame().killBot(other.block, this.owner);
		}
	}
}

/* ------------------------------- trampoline ------------------------------ */

class TrampolineElement extends PlacedElement {
	static readonly SPEC: ElementSpec = {
		id: 'trampoline', label: 'Trampoline', texture: TEX_TRAMPOLINE, price: TRAMPOLINE_PRICE,
		maxHp: TRAMPOLINE_HP, cols: 1, rows: 1, fallbackColor: '#ffb300',
	};
	static readonly DATA_MESSAGE = 'TrampolineData';
	static create(init: ElementInit) { return initElement(new TrampolineElement(), init); }

	getSpec() { return TrampolineElement.SPEC; }
	getTypeIdx() { return TYPE_TRAMPOLINE; }

	/**
	 * A creature landing on the top of the trampoline (= our "ceiling" side) is thrown upward.
	 * The velocity is set directly (same mechanism as a jump).
	 */
	override detectCollision(_id: BlockId, other: Entry, side: Side, _engine: Engine): void {
		if (side !== 'ceiling') return;
		const velocity = other.block.getVelocity();
		if (!velocity) return;
		velocity.y = -TRAMPOLINE_BOUNCE_SPEED;
		if (other.block instanceof Bot) other.block.markTouched(this.owner);
	}
}

/* ------------------------------ archer tower ----------------------------- */

class ArcherTowerElement extends PlacedElement {
	static readonly SPEC: ElementSpec = {
		id: 'archer', label: 'Archers', texture: TEX_ARCHER, price: ARCHER_PRICE,
		maxHp: ARCHER_HP, cols: 1, rows: ARCHER_ROWS, fallbackColor: '#6d4c41',
	};
	static readonly DATA_MESSAGE = 'ArcherData';
	static create(init: ElementInit) { return initElement(new ArcherTowerElement(), init); }

	/** Time before the next arrow. */
	cooldown = 0;

	getSpec() { return ArcherTowerElement.SPEC; }
	getTypeIdx() { return TYPE_ARCHER; }

	override save(): Fields { return { ...super.save(), cooldown: this.cooldown }; }
	override load(obj: Fields) { super.load(obj); this.cooldown = obj.cooldown; }

	/** Shoots a straight arrow at the closest bot in range. */
	protected override tick(dt: number, engine: Engine): void {
		this.cooldown = Math.max(0, this.cooldown - dt);
		if (this.cooldown > 0) return;

		const game = engine.getGame();
		const muzzleX = this.x;
		const muzzleY = this.y - this.getSize().height / 2 + ARCHER_MUZZLE_OFFSET;
		const target = game.findNearestBot(muzzleX, muzzleY, ARCHER_RANGE);
		if (!target) return;

		const dx = target.x - muzzleX;
		const dy = target.y - muzzleY;
		const len = Math.sqrt(norm2(dx, dy)) || 1;
		game.queueArrow(this.owner, muzzleX, muzzleY, (dx / len) * ARROW_SPEED, (dy / len) * ARROW_SPEED);
		this.cooldown = ARCHER_COOLDOWN;
	}
}

/* ----------------------------- rotating fire bar ------------------------- */

class FireBarElement extends PlacedElement {
	static readonly SPEC: ElementSpec = {
		id: 'firebar', label: 'Fire bar', texture: TEX_FIREBAR, price: FIREBAR_PRICE,
		maxHp: FIREBAR_HP, cols: 1, rows: 1, fallbackColor: '#e65100',
	};
	static readonly DATA_MESSAGE = 'FireBarData';
	static create(init: ElementInit) { return initElement(new FireBarElement(), init); }

	/** Current rotation angle in radians. */
	angle = 0;

	getSpec() { return FireBarElement.SPEC; }
	getTypeIdx() { return TYPE_FIREBAR; }

	override save(): Fields { return { ...super.save(), angle: this.angle }; }
	override load(obj: Fields) { super.load(obj); this.angle = obj.angle; }

	/** World positions of the fireballs (as circles) for the current angle. */
	getBalls(): Circle[] {
		const balls: Circle[] = [];
		for (let i = 1; i <= FIREBAR_BALLS; i++) {
			balls.push({
				x: this.x + Math.cos(this.angle) * i * FIREBAR_BALL_SPACING,
				y: this.y + Math.sin(this.angle) * i * FIREBAR_BALL_SPACING,
				r: FIREBAR_BALL_RADIUS,
			});
		}
		return balls;
	}

	protected override tick(dt: number, _engine: Engine): void {
		this.angle = (this.angle + FIREBAR_ROTATION_SPEED * dt) % (Math.PI * 2);
	}

	/** After the physics step: every bot touched by a fireball burns. */
	override processAfterEngine(_id: BlockId, _dt: number, engine: Engine): void {
		const game = engine.getGame();
		const balls = this.getBalls();
		for (const bot of game.storage.bots.values()) {
			if (bot.dead) continue;
			const rect = rectOf(bot);
			if (balls.some(ball => collisions.RectCircle(rect, ball))) {
				game.killBot(bot, this.owner);
			}
		}
	}

	protected override drawBody(ctx: CanvasRenderingContext2D, folder: Folder, colorId: number | undefined) {
		super.drawBody(ctx, folder, colorId);
		for (const ball of this.getBalls()) {
			drawTexture(ctx, folder, TEX_FIREBALL, undefined, ball.x, ball.y, ball.r * 2, ball.r * 2, COLOR_FIREBALL);
		}
	}
}

/* --------------------------------- thwomp -------------------------------- */

class ThwompElement extends PlacedElement {
	static readonly SPEC: ElementSpec = {
		id: 'thwomp', label: 'Thwomp', texture: TEX_THWOMP, price: THWOMP_PRICE,
		maxHp: THWOMP_HP, cols: THWOMP_CELLS, rows: THWOMP_CELLS, fallbackColor: '#607d8b',
	};
	static readonly DATA_MESSAGE = 'ThwompData';
	static create(init: ElementInit) { return initElement(new ThwompElement(), init); }

	/** One of THWOMP_PHASE_* */
	phase = THWOMP_PHASE_IDLE;
	/** Remaining rest time once landed. */
	timer = 0;
	/** Velocity controlled by the block itself (moving-platform style). */
	private readonly forced: Velocity = { x: 0, y: 0 };

	getSpec() { return ThwompElement.SPEC; }
	getTypeIdx() { return TYPE_THWOMP; }

	/** Y of the center when the thwomp rests at the top. */
	private homeY(): number {
		return (this.row + THWOMP_CELLS / 2) * CELL;
	}

	override getForcedVelocity(): Velocity | null { return this.forced; }

	override save(): Fields {
		return { ...super.save(), phase: this.phase, timer: this.timer, offsetY: this.y - this.homeY() };
	}

	override load(obj: Fields) {
		super.load(obj);
		this.phase = obj.phase;
		this.timer = obj.timer;
		this.y = this.homeY() + obj.offsetY;
	}

	/** State machine: idle -> slam -> rest -> rise -> idle. */
	protected override tick(dt: number, engine: Engine): void {
		const home = this.homeY();
		switch (this.phase) {
			case THWOMP_PHASE_IDLE:
				this.forced.y = 0;
				if (this.hasBotBelow(engine.getGame())) this.phase = THWOMP_PHASE_SLAM;
				break;

			case THWOMP_PHASE_SLAM:
				this.forced.y = THWOMP_SLAM_SPEED;
				if (this.y - home >= THWOMP_MAX_DROP) this.land();
				break;

			case THWOMP_PHASE_REST:
				this.forced.y = 0;
				this.timer -= dt;
				if (this.timer <= 0) this.phase = THWOMP_PHASE_RISE;
				break;

			case THWOMP_PHASE_RISE:
				if (this.y - THWOMP_RISE_SPEED * dt <= home) {
					// Arrived: snap to the exact home position
					this.y = home;
					this.forced.y = 0;
					this.phase = THWOMP_PHASE_IDLE;
				} else {
					this.forced.y = -THWOMP_RISE_SPEED;
				}
				break;
		}
	}

	private land() {
		this.phase = THWOMP_PHASE_REST;
		this.timer = THWOMP_REST_TIME;
		this.forced.y = 0;
	}

	/** True when a bot stands in the trigger zone below the thwomp. */
	private hasBotBelow(game: GMCastle): boolean {
		for (const bot of game.storage.bots.values()) {
			if (bot.dead) continue;
			const dy = bot.y - this.y;
			if (Math.abs(bot.x - this.x) <= THWOMP_TRIGGER_HALF_WIDTH && dy > 0 && dy <= THWOMP_TRIGGER_DEPTH) {
				return true;
			}
		}
		return false;
	}

	/** Crushes bots while slamming; stops on the first solid thing below. */
	override detectCollision(_id: BlockId, other: Entry, side: Side, engine: Engine): void {
		if (this.phase !== THWOMP_PHASE_SLAM) return;

		if (other.block instanceof Bot) {
			engine.getGame().killBot(other.block, this.owner);
		} else if (other.block instanceof PlacedElement && side === 'floor') {
			this.land();
		}
	}
}

/* ----------------------------- monster spawner --------------------------- */

class SpawnerElement extends PlacedElement {
	static readonly SPEC: ElementSpec = {
		id: 'spawner', label: 'Spawner', texture: TEX_SPAWNER, price: SPAWNER_PRICE,
		maxHp: SPAWNER_HP, cols: 1, rows: 1, fallbackColor: '#7b1fa2',
	};
	static readonly DATA_MESSAGE = 'SpawnerData';
	static create(init: ElementInit) { return initElement(new SpawnerElement(), init); }

	cooldown = 0;

	getSpec() { return SpawnerElement.SPEC; }
	getTypeIdx() { return TYPE_SPAWNER; }

	override save(): Fields { return { ...super.save(), cooldown: this.cooldown }; }
	override load(obj: Fields) { super.load(obj); this.cooldown = obj.cooldown; }

	/** Periodically releases a monster walking toward the incoming bots (leftwards). */
	protected override tick(dt: number, engine: Engine): void {
		this.cooldown -= dt;
		if (this.cooldown > 0) return;
		this.cooldown += SPAWNER_INTERVAL;
		console.log('[CastleDefense] Spawner tick', { uid: this.uid, owner: this.owner, x: this.x, y: this.y });
		engine.getGame().queueMonster(
			this.owner,
			this.x - MONSTER_SPAWN_OFFSET_X,
			this.y - this.getSize().height / 2 - MONSTER_SIZE / 2 - 1
		);
	}
}

/* ---------------------------------- ramp --------------------------------- */

class RampElement extends PlacedElement {
	static readonly SPEC: ElementSpec = {
		id: 'ramp', label: 'Ramp', texture: TEX_RAMP, price: RAMP_PRICE,
		maxHp: RAMP_HP, cols: 1, rows: 1, fallbackColor: '#8d6e63',
		placementVariants: ['\u2197', '\u2196'],
	};
	static readonly DATA_MESSAGE = 'RampData';
	static create(init: ElementInit) { return initElement(new RampElement(), init); }

	getSpec() { return RampElement.SPEC; }
	getTypeIdx() { return TYPE_RAMP; }

	/** Right triangle. variant 0 rises toward the right (+x), variant 1 toward the left. */
	override getPolygon(): Polygon | null {
		return {
			sides: this.variant === 0
				? [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }]
				: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }],
		};
	}

	protected override drawBody(ctx: CanvasRenderingContext2D, folder: Folder, colorId: number | undefined) {
		const poly = this.getPolygon()!;
		const left = this.x - CELL / 2;
		const top = this.y - CELL / 2;

		ctx.save();
		ctx.beginPath();
		poly.sides.forEach((p, i) => {
			const px = left + p.x * CELL;
			const py = top + p.y * CELL;
			if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
		});
		ctx.closePath();
		ctx.clip();

		// The texture is drawn for a ramp rising to the right: mirror it for variant 1
		if (this.variant === 1) {
			ctx.translate(this.x, 0);
			ctx.scale(-1, 1);
			ctx.translate(-this.x, 0);
		}
		super.drawBody(ctx, folder, colorId);
		ctx.restore();
	}
}

/* ------------------------------ element registry ------------------------- */

const TYPE_BLOCK = 0;
const TYPE_SPIKE = 1;
const TYPE_TRAMPOLINE = 2;
const TYPE_ARCHER = 3;
const TYPE_FIREBAR = 4;
const TYPE_THWOMP = 5;
const TYPE_SPAWNER = 6;
const TYPE_RAMP = 7;

/** Index in this array == typeIdx sent over the network. */
const ELEMENT_CLASSES: ElementClass[] = [
	BlockElement, SpikeElement, TrampolineElement, ArcherTowerElement,
	FireBarElement, ThwompElement, SpawnerElement, RampElement,
];

/* ========================================================================== */
/* MOBILE BLOCKS: BOT, MONSTER, ARROW                                         */
/* ========================================================================== */

/** All animator states use the same number of sprite-sheet lines. */
const ANIMATION_LINES = Object.fromEntries(
	platformEngine.ANIMATOR_STATES.map(s => [s, ANIMATION_LINES_PER_STATE])
) as Record<platformEngine.AnimatorState, number>;

/** An enemy walking toward the castle. Dies on the first hit. */
class Bot extends GameBlock {
	readonly walker = new platformEngine.Walker();
	readonly velocity: Velocity = { x: 0, y: 0 };
	readonly direction: Direction = {
		dir: 0,
		acc: BOT_ACCELERATION,
		softDec: BOT_SOFT_DECELERATION,
		hardDec: BOT_HARD_DECELERATION,
	};
	readonly effects = new platformEngine.VelocityEffectHandler();
	readonly animator = new platformEngine.Animator(
		BOT_FRAME_SIZE,
		BOT_FRAME_SIZE,
		TEX_BOT,
		null,
		ANIMATION_LINES,
		BOT_RUNNING_SPEED
	);

	/** Per-bot navigation cache shared with the bot controller. */
	readonly botData = new BotData();

	/** Set when the bot has been killed / consumed; it is removed right after the engine step. */
	dead = false;
	/** Last player whose element interacted with this bot (credit for void deaths). */
	lastToucher = NO_OWNER;
	lastTouchAge = KILL_CREDIT_WINDOW + 1;

	static create(): Bot {
		const bot = new Bot();
		bot.x = BOT_SPAWN_X;
		bot.y = BOT_SPAWN_Y;
		return bot;
	}

	override getSize(): Size {
		return {
			width: BOT_SIZE,
			height: BOT_SIZE,
		};
	}

	override getWalker() {
		return this.walker;
	}

	override getDirection() {
		return this.direction;
	}

	override getVelocity() {
		return this.velocity;
	}

	override getVelocityEffects() {
		return this.effects;
	}

	markTouched(player: number) {
		this.lastToucher = player;
		this.lastTouchAge = 0;
	}

	/** Player credited for a death that has no direct killer (void). */
	creditedPlayer(): number {
		return this.lastTouchAge <= KILL_CREDIT_WINDOW
			? this.lastToucher
			: NO_OWNER;
	}

	override processBeforeEngine(
		id: BlockId,
		dt: number,
		engine: Engine
	): void {
		this.lastTouchAge = Math.min(
			this.lastTouchAge + dt,
			KILL_CREDIT_WINDOW + 1,
		);

		this.botData.engineId = id;

		this.botData.repathTimer += dt;
		this.botData.jumpCooldown = Math.max(
			0,
			this.botData.jumpCooldown - dt,
		);
		this.botData.wallJumpLockTimer = Math.max(
			0,
			this.botData.wallJumpLockTimer - dt,
		);
		this.botData.wallJumpReverseTimer = Math.max(
			0,
			this.botData.wallJumpReverseTimer - dt,
		);
		this.botData.hazardCooldown = Math.max(
			0,
			this.botData.hazardCooldown - dt,
		);

		this.botData.wallJumpWindowAge += dt;
		if (this.botData.wallJumpWindowAge >= 1) {
			this.botData.wallJumpWindowAge = 0;
			this.botData.wallJumpCountWindow = 0;
		}

		/*
		 * Measure progress only while grounded. Airborne motion is expected and
		 * should never be mistaken for being stuck.
		 */
		if (
			Number.isFinite(this.botData.lastX)
			&& this.walker.onFloor()
		) {
			const moved = Math.abs(this.x - this.botData.lastX);

			if (moved < BOT_STUCK_DISTANCE) {
				this.botData.stuckTimer += dt;
			} else {
				this.botData.stuckTimer = 0;
				this.botData.lastProgressTime = 0;
			}
		} else {
			this.botData.stuckTimer = 0;
		}

		this.botData.lastX = this.x;
		this.botData.lastY = this.y;

		const input = getBotInput(engine, this);

		const left = input.xDir < 0;
		const right = input.xDir > 0;

		if (left === right) {
			this.direction.dir = 0;
		} else if (left) {
			this.direction.dir = -BOT_RUN_SPEED;
		} else {
			this.direction.dir = BOT_RUN_SPEED;
		}

		/*
		 * A jump request is consumed exactly once. The AI does not directly move
		 * the bot; it only requests the same physical actions a player would use.
		 */
		if (input.jump) {
			const wallJumpLeft =
				this.walker.onLeft()
				&& this.direction.dir < 0;

			const wallJumpRight =
				this.walker.onRight()
				&& this.direction.dir > 0;

			if (this.walker.onFloor()) {
				this.velocity.y = -BOT_JUMP_SPEED;
				this.botData.jumpHoldTimer = BOT_JUMP_HOLD_TIME;
				this.botData.jumpCooldown = BOT_JUMP_COOLDOWN;
			} else if (wallJumpLeft || wallJumpRight) {
				const wallSide = wallJumpLeft ? 'left' as const : 'right' as const;

				/*
				 * The wall jump always launches away from the wall. We also lock
				 * the steering direction briefly so the acceleration system cannot
				 * immediately cancel the impulse.
				 */
				this.velocity.x =
					wallSide === 'left'
						? BOT_WALL_JUMP_SPEED
						: -BOT_WALL_JUMP_SPEED;
				this.velocity.y = -BOT_JUMP_SPEED;

				this.botData.jumpHoldTimer = BOT_JUMP_HOLD_TIME;
				this.botData.jumpCooldown = BOT_WALL_JUMP_LOCK_TIME + BOT_JUMP_COOLDOWN;
				this.botData.wallJumpLockTimer = BOT_WALL_JUMP_LOCK_TIME;
				this.botData.wallJumpReverseTimer = BOT_WALL_JUMP_REVERSE_TIME;
				this.botData.lastWallJumpSide = wallSide;
				this.botData.lastWallJumpAt = 0;
				this.botData.wallJumpCountWindow++;
				this.botData.stuckTimer = 0;
			}
		}

		/*
		 * Variable-height jump:
		 * - while the short jump-hold window is active, use the lighter
		 *   acceleration;
		 * - otherwise use the normal fall acceleration.
		 *
		 * This mirrors the player physics instead of giving bots an artificial
		 * movement advantage.
		 */
		const holdingJump =
			this.botData.jumpHoldTimer > 0
			&& this.velocity.y < 0;

		if (holdingJump) {
			this.velocity.y += BOT_JUMP_ACCELERATION * dt;
		} else {
			this.velocity.y += BOT_FALL_ACCELERATION * dt;
		}

		this.botData.jumpHoldTimer = Math.max(
			0,
			this.botData.jumpHoldTimer - dt,
		);

		/*
		 * Wall slide is allowed only while actually pushing into the wall. During
		 * the post-wall-jump lock, the launch velocity must remain untouched.
		 */
		if (this.botData.wallJumpLockTimer <= 0) {
			if (
				(this.direction.dir < 0 && this.walker.onLeft())
				|| (this.direction.dir > 0 && this.walker.onRight())
			) {
				this.velocity.y = Math.min(
					this.velocity.y,
					BOT_WALL_SLIDE_MAX_SPEED,
				);
			}
		}
	}
	override processAfterEngine(
		_id: BlockId,
		dt: number,
		_engine: Engine
	): void {
		/*
		 * Safety net for collision resolution.
		 * The engine already resolves these contacts; this keeps the bot state
		 * exact even when a numerical contact leaves a tiny residual velocity.
		 */
		if (
			this.walker.onFloor()
			&& this.velocity.y > 0
		) {
			this.velocity.y = 0;
		}

		if (
			this.walker.onCeiling()
			&& this.velocity.y < 0
		) {
			this.velocity.y = 0;
		}

		if (
			this.walker.onLeft()
			&& this.velocity.x < 0
		) {
			this.velocity.x = 0;
		}

		if (
			this.walker.onRight()
			&& this.velocity.x > 0
		) {
			this.velocity.x = 0;
		}

		this.animator.update(
			this,
			this.walker,
			this.direction,
			dt
		);
	}

	save(): Fields {
		return {
			x: this.x,
			y: this.y,
			vx: this.velocity.x,
			vy: this.velocity.y,
			lastToucher: this.lastToucher,
			lastTouchAge: this.lastTouchAge,
		};
	}

	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.velocity.x = obj.vx;
		this.velocity.y = obj.vy;
		this.lastToucher = obj.lastToucher;
		this.lastTouchAge = obj.lastTouchAge;

		/*
		 * Navigation is derived from the current level.
		 * It is intentionally not serialized as part of the game state.
		 */
		this.botData.reset();
	}
}


/** A friendly creature released by a spawner: walks toward the bots, kills them on contact, expires. */
class Monster extends GameBlock {
	readonly walker = new platformEngine.Walker();
	readonly velocity: Velocity = { x: 0, y: 0 };
	readonly direction: Direction = {
		dir: 0, acc: MONSTER_ACCELERATION, softDec: MONSTER_SOFT_DECELERATION, hardDec: MONSTER_HARD_DECELERATION,
	};
	readonly effects = new platformEngine.VelocityEffectHandler();
	readonly animator: platformEngine.Animator;

	lifetime = MONSTER_LIFETIME;

	constructor(public owner: number, colorId: number) {
		super();
		this.animator = new platformEngine.Animator(
			BOT_FRAME_SIZE, BOT_FRAME_SIZE, TEX_MONSTER, colorId, ANIMATION_LINES, BOT_RUNNING_SPEED
		);
	}

	static create(owner: number, colorId: number, x: number, y: number): Monster {
		const monster = new Monster(owner, colorId);
		monster.x = x;
		monster.y = y;
		return monster;
	}

	override getSize(): Size { return { width: MONSTER_SIZE, height: MONSTER_SIZE }; }
	override getWalker() { return this.walker; }
	override getDirection() { return this.direction; }
	override getVelocity() { return this.velocity; }
	override getVelocityEffects() { return this.effects; }

	override processBeforeEngine(_id: BlockId, dt: number, engine: Engine): void {
		this.lifetime -= dt;
		if (this.lifetime <= 0) {
			engine.getGame().queueRemoval(this.uid);
			return;
		}

		// Walk toward the incoming bots (leftwards) and hop over obstacles
		this.direction.dir = -MONSTER_SPEED;
		if (this.walker.onLeft() && this.walker.onFloor()) {
			this.velocity.y = -MONSTER_JUMP_SPEED;
		}
	}

	override processAfterEngine(_id: BlockId, dt: number, _engine: Engine): void {
		this.animator.update(this, this.walker, this.direction, dt);
	}

	/** Touching a bot kills it, at the price of some of the monster's remaining lifetime. */
	override detectCollision(_id: BlockId, other: Entry, _side: Side, engine: Engine): void {
		if (other.block instanceof Bot && !other.block.dead) {
			engine.getGame().killBot(other.block, this.owner);
			this.lifetime -= MONSTER_KILL_LIFETIME_COST;
		}
	}

	save(): Fields {
		return {
			x: this.x, y: this.y, vx: this.velocity.x, vy: this.velocity.y,
			lifetime: this.lifetime, owner: this.owner,
		};
	}

	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.velocity.x = obj.vx;
		this.velocity.y = obj.vy;
		this.lifetime = obj.lifetime;
	}
}

/** Arrow shot by an archer tower: flies straight (forced velocity), ghost to everything. */
class Arrow extends GameBlock {
	private readonly forced: Velocity = { x: 0, y: 0 };
	life = ARROW_LIFETIME;
	consumed = false;

	constructor(public owner: number) {
		super();
	}

	static create(owner: number, x: number, y: number, vx: number, vy: number): Arrow {
		const arrow = new Arrow(owner);
		arrow.x = x;
		arrow.y = y;
		arrow.forced.x = vx;
		arrow.forced.y = vy;
		return arrow;
	}

	override getSize(): Size { return { width: ARROW_LENGTH, height: ARROW_THICKNESS }; }
	override getForcedVelocity(): Velocity | null { return this.forced; }

	override processBeforeEngine(_id: BlockId, dt: number, engine: Engine): void {
		this.life -= dt;
		if (this.life <= 0 || this.consumed) {
			engine.getGame().queueRemoval(this.uid);
		}
	}

	/** Kills the first bot it hits; stops against any element except archer towers. */
	override detectCollision(_id: BlockId, other: Entry, _side: Side, engine: Engine): void {
		if (this.consumed) return;

		if (other.block instanceof Bot) {
			if (other.block.dead) return;
			engine.getGame().killBot(other.block, this.owner);
			this.consumed = true;
		} else if (other.block instanceof PlacedElement && !(other.block instanceof ArcherTowerElement)) {
			this.consumed = true;
		}
	}

	save(): Fields {
		return {
			x: this.x, y: this.y, vx: this.forced.x, vy: this.forced.y,
			life: this.life, owner: this.owner,
		};
	}

	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.forced.x = obj.vx;
		this.forced.y = obj.vy;
		this.life = obj.life;
	}

	draw(ctx: CanvasRenderingContext2D, folder: Folder, colorId: number | undefined) {
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.rotate(Math.atan2(this.forced.y, this.forced.x));
		drawTexture(ctx, folder, TEX_ARROW, colorId, 0, 0, ARROW_LENGTH, ARROW_THICKNESS, COLOR_ARROW);
		ctx.restore();
	}
}

/* ========================================================================== */
/* CLIENT-ONLY DATA: CAMERA, POINTERS, HUD                                    */
/* ========================================================================== */

/** Free camera. Pans when dragging on the level, zooms with the wheel / pinch. */
class Camera {
	x = LEVEL_WIDTH / 2;
	y = LEVEL_HEIGHT / 2;
	zoom = ZOOM_DEFAULT;

	/** Keeps the view over the level (plus a small margin); centers it if the level is smaller. */
	clamp() {
		const halfW = WIDTH / 2 / this.zoom;
		const halfH = HEIGHT / 2 / this.zoom;
		this.x = this.clampAxis(this.x, halfW, LEVEL_WIDTH);
		this.y = this.clampAxis(this.y, halfH, LEVEL_HEIGHT);
	}

	private clampAxis(value: number, half: number, total: number): number {
		const min = half - CAMERA_MARGIN;
		const max = total - half + CAMERA_MARGIN;
		return min > max ? total / 2 : clamp(value, min, max);
	}

	screenToWorld(sx: number, sy: number) {
		return {
			x: (sx - WIDTH / 2) / this.zoom + this.x,
			y: (sy - HEIGHT / 2) / this.zoom + this.y,
		};
	}

	/** Dragging the world with a finger: the world follows the finger. */
	panByScreen(dx: number, dy: number) {
		this.x -= dx / this.zoom;
		this.y -= dy / this.zoom;
		this.clamp();
	}

	/** Zoom while keeping the world point under (sx, sy) fixed on screen. */
	zoomAt(sx: number, sy: number, factor: number) {
		const before = this.screenToWorld(sx, sy);
		this.zoom = clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
		this.x = before.x - (sx - WIDTH / 2) / this.zoom;
		this.y = before.y - (sy - HEIGHT / 2) / this.zoom;
		this.clamp();
	}
}

type PointerRole = 'drag' | 'camera' | 'ui' | 'blockPaint';

interface DragState {
	pointerId: number;
	/** Element type index, or TOOL_REMOVE. */
	tool: number;
	x: number;
	y: number;
	startX: number;
	startY: number;
}

type UiHit =
	| { kind: 'card'; tool: number }
	| { kind: 'placementVariant'; tool: number; variant: number; location: 'bottom' | 'top' }
	| { kind: 'bar' };

/** Maps a card slot (0..SLOT_COUNT-1) to a tool id. The last slot is the remove tool. */
const slotToTool = (slot: number) => (slot < ELEMENT_TYPE_COUNT ? slot : TOOL_REMOVE);

function cardRect(slot: number) {
	return { x: CARD_BAR_LEFT + slot * (CARD_W + CARD_GAP), y: CARD_BAR_TOP, w: CARD_W, h: CARD_H };
}

/** Which part of the bottom UI is under the point (if any). */
function placementVariantRect(tool: number, variant: number, variantCount: number) {
	const slot = tool;
	const card = cardRect(slot);
	const totalW = variantCount * PLACEMENT_OPTION_SIZE + (variantCount - 1) * PLACEMENT_OPTION_GAP;
	const left = card.x + (card.w - totalW) / 2;
	return {
		x: left + variant * (PLACEMENT_OPTION_SIZE + PLACEMENT_OPTION_GAP),
		y: card.y - PLACEMENT_OPTION_MARGIN - PLACEMENT_OPTION_SIZE,
		w: PLACEMENT_OPTION_SIZE,
		h: PLACEMENT_OPTION_SIZE,
	};
}

/** Generic top toolbar for any element exposing placementVariants. */
/** Which part of the UI is under the point (if any). */
function hitTestUi(x: number, y: number, _variantMenuTool: number | null = null): UiHit | null {
	if (x < UI_LEFT || x > UI_RIGHT || y < UI_TOP) return null;

	for (let slot = 0; slot < ELEMENT_TYPE_COUNT; slot++) {
		const spec = ELEMENT_CLASSES[slot].SPEC;
		const variants = spec.placementVariants;
		if (!variants || variants.length < 2) continue;
		for (let variant = 0; variant < variants.length; variant++) {
			const r = placementVariantRect(slot, variant, variants.length);
			if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
				return { kind: 'placementVariant', tool: slot, variant, location: 'bottom' };
			}
		}
	}

	for (let slot = 0; slot < SLOT_COUNT; slot++) {
		const r = cardRect(slot);
		if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
			return { kind: 'card', tool: slotToTool(slot) };
		}
	}
	return { kind: 'bar' };
}

class ClientData {
	firstFrame = true;
	localPlayer = 0;

	/** Raw mouse position in canvas coordinates (filled by evalMouseCoords). */
	rawMouseX = 0;
	rawMouseY = 0;
	/** Mouse position in world coordinates. */
	mouseX = 0;
	mouseY = 0;

	readonly camera = new Camera();
	drag: DragState | null = null;
	/** Selected placement variant for the next placement. */
	variant = 0;
	/** Generic card whose placement variants are currently exposed in the top toolbar. */
	variantMenuTool: number | null = null;
	/** True after clicking the Block card; dragging on the level then paints blocks. */
	blockPlacementMode = false;
	/** Grid coordinates already emitted while the current Block placement mode is active. */
	private readonly blockPlacementCells = new Set<string>();
	/** Card currently selected in the HUD, independent from an active pointer drag. */
	selectedTool: number | null = null;

	private readonly roles = new Map<number, PointerRole>();
	private previous = new Map<number, Pointer>();

	readonly html: HTMLDivElement;
	readonly time: HTMLDivElement;
	readonly castle: HTMLDivElement;
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-castleDefense-root");

		this.castle = document.createElement("div");
		this.castle.classList.add("game-castleDefense-castle");

		this.time = document.createElement("div");
		this.time.classList.add("game-castleDefense-time");

		const scores = document.createElement("div");
		scores.classList.add("game-castleDefense-scores");
		this.redScore = document.createElement("div");
		this.blueScore = document.createElement("div");
		this.redScore.classList.add("game-castleDefense-red-score");
		this.blueScore.classList.add("game-castleDefense-blue-score");

		const dash = document.createElement("div");
		dash.textContent = "-";

		scores.appendChild(this.redScore);
		scores.appendChild(dash);
		scores.appendChild(this.blueScore);

		this.html.appendChild(this.castle);
		this.html.appendChild(scores);
		this.html.appendChild(this.time);

		this.camera.clamp();
	}

	static showTime(time: number) {
		const minutes = Math.floor(time / 60);
		const seconds = Math.floor(time % 60);
		return `${minutes}:${pad2(seconds)}`;
	}

	/** Refreshes the DOM HUD (castle, scores, last-minute timer). */
	update(game: GMCastle, _playerIdx: number) {
		this.time.textContent = ClientData.showTime(game.time);
		// The clock only shows up during the last minute
		this.time.style.display = game.time <= TIMER_VISIBLE_SECONDS ? '' : 'none';
		this.redScore.textContent = pad2(game.redScore);
		this.blueScore.textContent = pad2(game.blueScore);
		this.castle.textContent = `Castle ${game.castleHp}/${CASTLE_HP}`;
	}

	/* ---------------------------- pointer handling --------------------------- */

	/**
	 * Turns the raw pointers of this frame into:
	 * - a card drag (place / remove), executed when the pointer is released,
	 * - camera pan (1 pointer on the level) and pinch zoom (2 pointers).
	 * Returns the network actions to send. Never mutates the game state.
	 */
	processPointers(game: GMCastle, pointers: Pointer[], wheel: number): Fields[] {
		const actions: Fields[] = [];
		const current = new Map(pointers.map(p => [p.id, p] as [number, Pointer]));

		// 1. Pointers that disappeared: a released drag is resolved here.
		for (const id of [...this.roles.keys()]) {
			if (current.has(id)) continue;

			if (this.roles.get(id) === 'drag' && this.drag?.pointerId === id) {
				const action = this.finishDrag(game);
				if (action) actions.push(action);
				this.drag = null;
			} else if (this.roles.get(id) === 'blockPaint' && this.drag?.pointerId === id) {
				// Releasing a Block-paint pointer only stops painting; placement already
				// happened cell by cell while the pointer was moving.
				this.drag = null;
			}

			this.roles.delete(id);
		}

		// 2. New pointers: decide what they are going to do.
		for (const p of pointers) {
			if (!this.roles.has(p.id)) this.roles.set(p.id, this.classifyNewPointer(p));
		}

		// 3. Follow the active placement pointer.
		if (this.drag) {
			const p = current.get(this.drag.pointerId);
			if (p) {
				this.drag.x = p.x;
				this.drag.y = p.y;

				if (this.roles.get(this.drag.pointerId) === 'blockPaint') {
					const action = this.paintBlockAtPointer(game, p.x, p.y);
					if (action) actions.push(action);
				}
			}
		}

		// 4. Camera
		this.updateCamera(pointers, wheel);
		this.previous = current;
		return actions;
	}

	private classifyNewPointer(p: Pointer): PointerRole {
		const hit = hitTestUi(p.x, p.y, this.variantMenuTool);

		// A click outside the active variant toolbar closes it. The new pointer
		// can still be used normally (camera/card drag) in the same frame.
		if (this.variantMenuTool !== null && hit?.kind !== 'placementVariant') {
			this.variantMenuTool = null;
		}

		if (hit?.kind === 'card' && !this.drag) {
			// Keep the pointer as a drag candidate. The persistent selection is
			// committed on release so a click can also toggle the current selection.
			this.drag = {
				pointerId: p.id,
				tool: hit.tool,
				x: p.x,
				y: p.y,
				startX: p.x,
				startY: p.y,
			};
			return 'drag';
		}

		if (!hit) {
			if (this.blockPlacementMode && !this.drag) {
				this.drag = {
				pointerId: p.id,
					tool: TYPE_BLOCK,
					x: p.x,
					y: p.y,
					startX: p.x,
					startY: p.y,
				};
				return 'blockPaint';
			}

			// A selected non-Block card owns level clicks until it is deselected.
			// This prevents the same click/drag from falling through to camera pan.
			if (this.selectedTool !== null && !this.drag) {
				this.drag = {
					pointerId: p.id,
					tool: this.selectedTool,
					x: p.x,
					y: p.y,
					startX: p.x,
					startY: p.y,
				};
				return 'drag';
			}
			return 'camera';
		}

		if (hit.kind === 'placementVariant') {
			this.variant = hit.variant;
			this.variantMenuTool = hit.tool;
		}
		return 'ui';
	}

	private enableBlockPlacementMode(): void {
		this.blockPlacementMode = true;
		this.blockPlacementCells.clear();
		this.variantMenuTool = null;
	}

	private disableBlockPlacementMode(): void {
		this.blockPlacementMode = false;
		this.blockPlacementCells.clear();
	}

	/**
	 * Places one Block when the pointer enters a new grid cell.
	 * The local coordinate set prevents duplicate actions at the same (col, row).
	 */
	private paintBlockAtPointer(game: GMCastle, sx: number, sy: number): Fields | null {
		const { col, row } = this.getDragCell(TYPE_BLOCK, sx, sy);
		const key = `${col},${row}`;

		if (this.blockPlacementCells.has(key)) return null;
		this.blockPlacementCells.add(key);

		if (game.checkPlacement(this.localPlayer, TYPE_BLOCK, col, row).status !== 'ok') {
			return null;
		}

		return {
			action: 'place',
			place: { typeIdx: TYPE_BLOCK, col, row, variant: this.variant },
		};
	}

	private updateCamera(pointers: Pointer[], wheel: number) {
		const cams = pointers.filter(p => this.roles.get(p.id) === 'camera');

		if (cams.length === 1) {
			const prev = this.previous.get(cams[0].id);
			if (prev) this.camera.panByScreen(cams[0].x - prev.x, cams[0].y - prev.y);
		} else if (cams.length >= 2) {
			const [a, b] = cams;
			const pa = this.previous.get(a.id);
			const pb = this.previous.get(b.id);
			if (pa && pb) {
				const before = Math.hypot(pa.x - pb.x, pa.y - pb.y);
				const after = Math.hypot(a.x - b.x, a.y - b.y);
				const midBefore = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
				const midAfter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				this.camera.panByScreen(midAfter.x - midBefore.x, midAfter.y - midBefore.y);
				if (before > MIN_PINCH_DISTANCE) this.camera.zoomAt(midAfter.x, midAfter.y, after / before);
			}
		}

		if (wheel !== 0) {
			this.camera.zoomAt(this.rawMouseX, this.rawMouseY, Math.exp(-wheel * WHEEL_ZOOM_SPEED));
		}
	}

	/** Grid cell targeted by a drag: the footprint is centered under the pointer. */
	getDragCell(tool: number, sx: number, sy: number) {
		const world = this.camera.screenToWorld(sx, sy);
		if (tool === TOOL_REMOVE) {
			return { col: Math.floor(world.x / CELL), row: Math.floor(world.y / CELL) };
		}
		const spec = ELEMENT_CLASSES[tool].SPEC;
		const pointerCol = Math.floor(world.x / CELL);
		const pointerRow = Math.floor(world.y / CELL);
		return {
			col: pointerCol - Math.floor((spec.cols - 1) / 2) - (spec.cols % 2 === 0 ? 1 : 0),
			row: pointerRow - Math.floor((spec.rows - 1) / 2) - (spec.rows % 2 === 0 ? 1 : 0),
		};
	}

	/** A release outside the canvas, on its border or over the card bar cancels the action. */
	private isReleaseCancelled(d: DragState): boolean {
		const outside =
			d.x < EDGE_CANCEL_MARGIN || d.y < EDGE_CANCEL_MARGIN ||
			d.x > WIDTH - EDGE_CANCEL_MARGIN || d.y > HEIGHT - EDGE_CANCEL_MARGIN;
		return outside || hitTestUi(d.x, d.y, this.variantMenuTool) !== null;
	}

	private finishDrag(game: GMCastle): Fields | null {
		const d = this.drag!;
		const hit = hitTestUi(d.x, d.y, this.variantMenuTool);

		// A short press on a variant-enabled card is a click, not a build drag.
		// It opens the generic variant buttons above the card and leaves them
		// visible until another click happens elsewhere.
		const wasClick = Math.hypot(d.x - d.startX, d.y - d.startY) <= CARD_CLICK_SLOP;
		const startHit = hitTestUi(d.startX, d.startY);
		if (wasClick && startHit?.kind === 'card' && startHit.tool === TYPE_BLOCK) {
			// Clicking the selected Block card toggles the continuous placement mode.
			if (this.selectedTool === TYPE_BLOCK) {
				this.selectedTool = null;
				this.disableBlockPlacementMode();
			} else {
				this.selectedTool = TYPE_BLOCK;
				this.enableBlockPlacementMode();
			}
			return null;
		}

		if (wasClick && startHit?.kind === 'card' && startHit.tool === d.tool) {
			// Clicking an already selected card gives the camera control back.
			if (this.selectedTool === d.tool) {
				this.selectedTool = null;
				if (d.tool === TYPE_BLOCK) this.disableBlockPlacementMode();
				return null;
			}

			this.selectedTool = d.tool;
			if (d.tool !== TYPE_BLOCK) this.disableBlockPlacementMode();
			const variants = ELEMENT_CLASSES[d.tool]?.SPEC.placementVariants;
			if (variants && variants.length > 1) {
				this.variantMenuTool = d.tool;
			}
			return null;
		}

		if (hit?.kind === 'placementVariant' && hit.tool === d.tool) {
			this.variant = hit.variant;
			this.variantMenuTool = hit.tool;
			return null;
		}
		if (this.isReleaseCancelled(d)) return null;

		// A real drag that starts on a card is the explicit way to deselect it.
		// A placement made from an already selected card keeps that selection active,
		// exactly like the Block selection mode.
		if (startHit?.kind === 'card') {
			this.selectedTool = null;
			if (d.tool === TYPE_BLOCK) this.disableBlockPlacementMode();
		}

		const { col, row } = this.getDragCell(d.tool, d.x, d.y);

		if (d.tool === TOOL_REMOVE) {
			const target = game.elementAtCell(col, row);
			if (target && game.checkRemoval(this.localPlayer, target.uid).status === 'ok') {
				return { action: 'remove', remove: { blockId: target.uid } };
			}
			return null;
		}

		if (game.checkPlacement(this.localPlayer, d.tool, col, row).status !== 'ok') return null;
		return { action: 'place', place: { typeIdx: d.tool, col, row, variant: this.variant } };
	}
}

/* ========================================================================== */
/* TUTORIAL                                                                   */
/* ========================================================================== */

class TutorialData {
	constructor(private readonly game: GMCastle) {}

	frame(_dt: number, clock: number) {
		if (clock < 8) return "Drag a card onto the level and release to build.";
		if (clock < 16) return "Drag on the level to move the camera, pinch or use the wheel to zoom.";
		if (clock < 24) return "Use the trash tool to remove elements. Your own are free!";
		return "";
	}
}

/* ========================================================================== */
/* START DATA (HTML FORM)                                                     */
/* ========================================================================== */

function generateClientDom(_unlockedSkins: string[]) {
	return {
		preferTeam: 0,

		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({ preferTeam: this.preferTeam }).finish();
		},
	};
}

/* ========================================================================== */
/* GAME MODE                                                                  */
/* ========================================================================== */

type PlacementStatus = 'ok' | 'invalid' | 'outOfZone' | 'occupied' | 'noElixir';
interface PlacementCheck {
	status: PlacementStatus;
	cost: number;
	/** uid of the same-type element that this placement refreshes / replaces. */
	replaceUid: number | null;
}

type RemovalStatus = 'ok' | 'invalid' | 'neutral' | 'noElixir';
interface RemovalCheck {
	status: RemovalStatus;
	cost: number;
}

export class GMCastle extends GameMode {
	static readonly types = { Player };

	static readonly DATA = {
		GRAVITY, WIDTH, HEIGHT, CELL, LEVEL_COLS, LEVEL_ROWS, CASTLE_HP,
	};

	readonly players: Player[];
	redScore = 0;
	blueScore = 0;
	castleHp = CASTLE_HP;
	time = MATCH_DURATION;

	// ---- Wave state (shared) ----
	waveTimer = WAVE_FIRST_DELAY;
	waveIndex = 0;
	spawnQueue = 0;
	spawnTimer = 0;
	nextUid = 0;

	/** Engine storage (typed per block kind, keyed by engine BlockId). */
	readonly storage: CDStorage = {
		elements: new Map(),
		bots: new Map(),
		arrows: new Map(),
		monsters: new Map(),
	};

	/** Resolves when the engine is created and the level is built. */
	readonly engineReady: Promise<void>;
	private engine: Engine | null = null;
	/** State received through load() before the engine was ready. */
	private pendingState: Uint8Array | null = null;

	/** uid -> entity (stable ids). */
	private readonly entities = new Map<number, GameBlock>();
	/** grid cell -> uid of the element covering it. */
	private readonly cellOwner = new Map<number, number>();
	/** Incremented whenever the static navigation geometry changes. */
	private navigationRevision = 0;

	// Deferred changes: applied right after the engine step, never during it.
	private readonly removalQueue: number[] = [];
	private readonly arrowQueue: { owner: number; x: number; y: number; vx: number; vy: number }[] = [];
	private readonly monsterQueue: { owner: number; x: number; y: number }[] = [];

	private constructor(total: number, isClient: boolean) {
		super();

		this.players = Array.from({ length: total }, () => new Player());
		this.engineReady = this.initEngine(isClient);
	}

	/* ------------------------------ engine setup ----------------------------- */

	private async initEngine(isClient: boolean) {
		this.engine = await platformEngine.createPlatformerEngine<CDEngineData>(
			isClient, this.storage, this, { x: 0, y: GRAVITY }
		);

		if (this.pendingState) {
			this.applyState(this.pendingState);
			this.pendingState = null;
		} else {
			this.buildInitialLevel();
		}
	}

	/** Neutral, unbreakable-by-players floor that disappears after one minute. */
	private buildInitialLevel() {
		for (let col = 0; col < LEVEL_COLS; col++) {
			for (let r = 0; r < FLOOR_ROWS; r++) {
				this.registerElement(
					BlockElement.create({ col, row: FLOOR_ROW + r, owner: NO_OWNER, variant: 0 })
				);
			}
		}
	}

	/* --------------------------- entity bookkeeping -------------------------- */

	private register<T extends GameBlock>(
		block: T, category: string, store: Map<BlockId, T>, uid: number | null = null
	): T {
		block.uid = uid ?? this.nextUid++;
		block.engineId = this.engine!.addBlock(block, category);
		store.set(block.engineId, block);
		this.entities.set(block.uid, block);
		return block;
	}

	private registerElement(el: PlacedElement, uid: number | null = null) {
		this.register(el, 'element', this.storage.elements, uid);
		this.navigationRevision++;
		const spec = el.getSpec();
		for (let r = 0; r < spec.rows; r++) {
			for (let c = 0; c < spec.cols; c++) {
				this.cellOwner.set(cellKey(el.col + c, el.row + r), el.uid);
			}
		}
		return el;
	}

	/** Removes any entity (tolerates entities that are already gone). */
	private removeEntity(uid: number) {
		const entity = this.entities.get(uid);
		if (!entity) return;

		this.engine!.removeBlock(entity.engineId);
		this.entities.delete(uid);

		if (entity instanceof PlacedElement) {
			this.navigationRevision++;
			this.storage.elements.delete(entity.engineId);
			const spec = entity.getSpec();
			for (let r = 0; r < spec.rows; r++) {
				for (let c = 0; c < spec.cols; c++) {
					const key = cellKey(entity.col + c, entity.row + r);
					if (this.cellOwner.get(key) === uid) this.cellOwner.delete(key);
				}
			}
		} else if (entity instanceof Bot) {
			this.storage.bots.delete(entity.engineId);
		} else if (entity instanceof Arrow) {
			this.storage.arrows.delete(entity.engineId);
		} else if (entity instanceof Monster) {
			this.storage.monsters.delete(entity.engineId);
		}
	}

	private clearWorld() {
		for (const uid of [...this.entities.keys()]) this.removeEntity(uid);
		this.cellOwner.clear();
	}

	/* ----------------- API used by the blocks (deferred actions) ------------- */

	queueRemoval(uid: number) { this.removalQueue.push(uid); }

	queueArrow(owner: number, x: number, y: number, vx: number, vy: number) {
		this.arrowQueue.push({ owner, x, y, vx, vy });
	}

	queueMonster(owner: number, x: number, y: number) {
		const safeX = clamp(x, MONSTER_SIZE / 2, LEVEL_WIDTH - MONSTER_SIZE / 2);
		const safeY = clamp(y, SPAWN_MIN_Y, SPAWN_MAX_Y);
		console.log('[CastleDefense] Monster spawn queued', { owner, x, y, safeX, safeY });
		this.monsterQueue.push({ owner, x: safeX, y: safeY });
	}

	/** Kills a bot; the owner of the killing element scores a point. */
	killBot(bot: Bot, creditPlayer: number) {
		if (bot.dead) return;
		bot.dead = true;
		this.removalQueue.push(bot.uid);

		const player = this.players[creditPlayer];
		if (!player) return;
		player.kills++;
		if (player.team === DEFAULT_TEAM_RED) this.redScore++; else this.blueScore++;
	}

	findNearestBot(x: number, y: number, range: number): Bot | null {
		let best: Bot | null = null;
		let bestDist = range * range;
		for (const bot of this.storage.bots.values()) {
			if (bot.dead) continue;
			const d = norm2(bot.x - x, bot.y - y);
			if (d <= bestDist) { best = bot; bestDist = d; }
		}
		return best;
	}

	private colorIdOf(owner: number): number | undefined {
		const player = this.players[owner];
		if (!player) return undefined;
		return player.team === DEFAULT_TEAM_RED ? COLOR_ID_RED : COLOR_ID_BLUE;
	}

	/* ------------------------------ queries / rules --------------------------- */

	/** Returns the revision used to invalidate cached bot navigation. */
	getNavigationRevision(): number {
		return this.navigationRevision;
	}

	elementAtCell(col: number, row: number): PlacedElement | null {
		const uid = this.cellOwner.get(cellKey(col, row));
		const entity = uid === undefined ? undefined : this.entities.get(uid);
		return entity instanceof PlacedElement ? entity : null;
	}

	/** Cost to delete an opponent's element: (1 + hp / maxHp) * price. */
	private removalCost(el: PlacedElement): number {
		return (REMOVAL_BASE_FACTOR + el.hp / el.getMaxHp()) * el.getSpec().price;
	}

	/**
	 * Validates a placement. Used both by the preview (client) and by runInput (all peers).
	 * Placing the same type exactly over an existing element replaces it (and refreshes its life).
	 * Replacing an opponent's element costs the price PLUS the removal cost.
	 */
	checkPlacement(playerIdx: number, typeIdx: number, col: number, row: number): PlacementCheck {
		const def = ELEMENT_CLASSES[typeIdx];
		const player = this.players[playerIdx];
		if (!def || !player) return { status: 'invalid', cost: 0, replaceUid: null };

		const { cols, rows, price } = def.SPEC;
		if (col < BUILD_MIN_COL || col + cols > BUILD_MAX_COL || row < 0 || row + rows > LEVEL_ROWS) {
			return { status: 'outOfZone', cost: price, replaceUid: null };
		}

		const occupants = new Set<number>();
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const uid = this.cellOwner.get(cellKey(col + c, row + r));
				if (uid !== undefined) occupants.add(uid);
			}
		}

		let cost = price;
		let replaceUid: number | null = null;

		if (occupants.size > 0) {
			const uid = occupants.values().next().value as number;
			const other = this.entities.get(uid) as PlacedElement;
			const replaceable =
				occupants.size === 1 &&
				other.getTypeIdx() === typeIdx &&
				other.col === col && other.row === row &&
				other.owner !== NO_OWNER;
			if (!replaceable) return { status: 'occupied', cost, replaceUid: null };

			replaceUid = uid;
			if (this.players[other.owner]?.team !== player.team) cost += this.removalCost(other);
		}

		if (player.elixir < cost) return { status: 'noElixir', cost, replaceUid };
		return { status: 'ok', cost, replaceUid };
	}

	/** Validates the removal of an element (own elements are free, neutral ones are untouchable). */
	checkRemoval(playerIdx: number, uid: number): RemovalCheck {
		const player = this.players[playerIdx];
		const el = this.entities.get(uid);
		if (!player || !(el instanceof PlacedElement)) return { status: 'invalid', cost: 0 };
		if (el.owner === NO_OWNER) return { status: 'neutral', cost: 0 };

		const own = this.players[el.owner]?.team === player.team;
		const cost = own ? 0 : this.removalCost(el);
		if (player.elixir < cost) return { status: 'noElixir', cost };
		return { status: 'ok', cost };
	}

	private tryPlace(playerIdx: number, typeIdx: number, col: number, row: number, variant: number) {
		const check = this.checkPlacement(playerIdx, typeIdx, col, row);
		if (check.status !== 'ok') return;

		this.players[playerIdx].elixir -= check.cost;
		if (check.replaceUid !== null) this.removeEntity(check.replaceUid);
		this.registerElement(ELEMENT_CLASSES[typeIdx].create({ col, row, owner: playerIdx, variant }));
	}

	private tryRemove(playerIdx: number, uid: number) {
		const check = this.checkRemoval(playerIdx, uid);
		if (check.status !== 'ok') return;

		this.players[playerIdx].elixir -= check.cost;
		this.removeEntity(uid);
	}

	/* ---------------------------------- waves --------------------------------- */

	private runWaves(dt: number) {
		this.waveTimer -= dt;
		while (this.waveTimer <= 0) {
			const waveSize = Math.min(WAVE_MAX_SIZE, WAVE_BASE_SIZE + this.waveIndex * WAVE_SIZE_GROWTH);
			this.spawnQueue += waveSize;
			this.waveIndex++;
			this.waveTimer += WAVE_INTERVAL;
			console.log('[CastleDefense] Wave spawned', { wave: this.waveIndex, size: waveSize, queuedBots: this.spawnQueue });
		}

		this.spawnTimer -= dt;
		while (this.spawnQueue > 0 && this.spawnTimer <= 0) {
			const bot = Bot.create();
			const registered = this.register(bot, 'bot', this.storage.bots);
			this.spawnQueue--;
			this.spawnTimer += BOT_SPAWN_INTERVAL;
			console.log('[CastleDefense] Bot spawned', {
				uid: registered.uid, engineId: registered.engineId, x: registered.x, y: registered.y,
				queuedBots: this.spawnQueue,
			});
		}
	}

	/* --------------------------- frame post-processing ------------------------- */

	/** Applies the changes requested during the engine step. */
	private flushQueues() {
		for (const uid of this.removalQueue.splice(0)) this.removeEntity(uid);

		for (const a of this.arrowQueue.splice(0)) {
			this.register(Arrow.create(a.owner, a.x, a.y, a.vx, a.vy), 'arrow', this.storage.arrows);
		}
		for (const m of this.monsterQueue.splice(0)) {
			const colorId = this.colorIdOf(m.owner) ?? COLOR_ID_RED;
			const monster = Monster.create(m.owner, colorId, m.x, m.y);
			const registered = this.register(monster, 'monster', this.storage.monsters);
			console.log('[CastleDefense] Monster spawned', {
				uid: registered.uid, engineId: registered.engineId, owner: registered.owner,
				x: registered.x, y: registered.y, monsters: this.storage.monsters.size,
			});
		}
	}

	/** Castle contact (-1 hp) and void deaths. */
	private checkBotsAfterUpdate() {
		for (const bot of [...this.storage.bots.values()]) {
			if (bot.dead) continue;

			if (collisions.RectRect(rectOf(bot), CASTLE_RECT)) {
				bot.dead = true;
				this.castleHp = Math.max(0, this.castleHp - 1);
				this.removeEntity(bot.uid);
			} else if (bot.y > VOID_Y) {
				this.killBot(bot, bot.creditedPlayer());
				this.removeEntity(bot.uid);
			}
		}
	}

	private isFinished() {
		return this.time <= 0 || this.castleHp <= 0;
	}

	/* ------------------------------- static factory ---------------------------- */

	static async createServ(
		players: PlayerInput[],
		total: number,
		_hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();

		const game = new GMCastle(total, false);

		const preferences = game.players.map((_, i) =>
			i < players.length ? (decodeFullMessage(StartData.decode(players[i].data)).preferTeam ?? 0) : 0
		);

		// Balanced team assignment, honouring preferences when the team has room
		const maxPerTeam = Math.ceil(total / 2);
		const isRed = new Array<boolean | undefined>(total).fill(undefined);
		let redCount = 0;
		let blueCount = 0;

		for (let i = 0; i < total; i++) {
			if (preferences[i] === 1 && redCount < maxPerTeam) { isRed[i] = true; redCount++; }
			else if (preferences[i] === -1 && blueCount < maxPerTeam) { isRed[i] = false; blueCount++; }
		}
		for (let i = 0; i < total; i++) {
			if (isRed[i] !== undefined) continue;
			const red = (redCount < blueCount || (redCount === blueCount && i % 2 === 0)) && redCount < maxPerTeam;
			isRed[i] = red;
			if (red) redCount++; else blueCount++;
		}

		game.players.forEach((p, i) => {
			p.team = isRed[i] ? DEFAULT_TEAM_RED : DEFAULT_TEAM_BLUE;
		});

		// The engine is created asynchronously: wait for it so that the server starts ready
		await game.engineReady;

		const data = StartDataClient.encode({
			players: game.players.map(p => ({ isRed: p.team === DEFAULT_TEAM_RED }))
		}).finish();

		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		playerIdx: number
	) {
		const { StartData, StartDataClient } = protocols.get();

		const game = new GMCastle(total, true);
		const clientData = new ClientData();
		clientData.localPlayer = playerIdx;

		if (origin === 'server') {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
			for (const [idx, p] of players.entries()) {
				game.players[idx].team = p.isRed ? DEFAULT_TEAM_RED : DEFAULT_TEAM_BLUE;
			}
		} else { // origin === 'client' (local game): data is produced by generateClientDom.produce()
			const { preferTeam } = decodeFullMessage(StartData.decode(data));
			game.players.forEach((p, i) => {
				const mine = preferTeam === -1 ? DEFAULT_TEAM_BLUE : DEFAULT_TEAM_RED;
				const other = mine === DEFAULT_TEAM_RED ? DEFAULT_TEAM_BLUE : DEFAULT_TEAM_RED;
				p.team = i % 2 === 0 ? mine : other;
			});
		}

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: {} as { [k: string]: string }
		};
	}

	static readonly generateClientDom = generateClientDom;

	// Kept for framework compatibility: this mode has no skins.
	static readonly SKINS = { 'default': "Default" };
	static readonly SKINS_IDS = Object.keys(GMCastle.SKINS);

	static readonly TEXTURES: { [k: string]: string } = Object.fromEntries(
		TEXTURE_NAMES.map(name => [name, `${ASSET_ROOT}/${name}.png`])
	);

	override init(): void {}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	/* ----------------------------------- run ----------------------------------- */

	override run(
		dt: number,
		produceFinish: boolean,
		_rng: GameRandomGenerator | null
	): FinishGame | null {
		// Until the engine exists nothing can be simulated
		if (!this.engine) return null;

		if (this.isFinished()) {
			return produceFinish ? this.produceFinish() : null;
		}

		this.time = Math.max(0, this.time - dt);
		for (const p of this.players) p.regen(dt);

		this.runWaves(dt);
		this.engine.update(dt);       // physics + all block hooks
		this.flushQueues();           // removals / arrows / monsters requested during the step
		this.checkBotsAfterUpdate();  // castle contact + void

		if (produceFinish && this.isFinished()) return this.produceFinish();
		return null;
	}

	override runInput(playerIdx: number, input: Fields): void {
		if (!this.engine) return;

		switch (input.action) {
			case 'place': {
				const p = input.place;
				this.tryPlace(playerIdx, p.typeIdx, p.col, p.row, p.variant);
				break;
			}
			case 'remove':
				this.tryRemove(playerIdx, input.remove.blockId);
				break;
		}
	}

	/** Reads pointers (mouse + fingers) and returns the actions to send. Does not change the state. */
	override collectInputs(
		_keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;

		// Refreshes data.rawMouseX/Y (evalMouseCoords is called by the controller)
		mouse.getCoords();

		const pointers: Pointer[] = (mobile ? mobile.getDigits() : [])
			.map(d => ({ id: d.id, x: d.x, y: d.y }));
		if (mouse.press(0)) {
			pointers.push({ id: MOUSE_POINTER_ID, x: data.rawMouseX, y: data.rawMouseY });
		}

		const wheel = (mouse as unknown as WheelSource).getWheelDelta?.() ?? 0;
		return data.processPointers(this, pointers, wheel);
	}

	/* ----------------------------------- draw ---------------------------------- */

	/** Registers the red / blue recolouring of every coloured texture. */
	private registerColorRules(folder: Folder) {
		for (const name of COLORED_TEXTURES) {
			TEAM_COLORS.forEach((color, id) => {
				folder.setColorRule(name, id, [{ prev: TEXTURE_PLACEHOLDER_COLOR, next: color }]);
			});
		}
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = false;

		const folder = _imageLoader.getFolder(GAME_FOLDER) as unknown as Folder;
		const data = _data as ClientData;
		data.localPlayer = playerIdx;

		if (data.firstFrame) {
			this.registerColorRules(folder);
			data.firstFrame = false;
		}
		data.update(this, playerIdx);

		ctx.fillStyle = COLOR_VOID;
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		if (!this.engine) {
			ctx.fillStyle = COLOR_LOADING;
			ctx.font = FONT_LOADING;
			ctx.textAlign = 'center';
			ctx.fillText('Loading...', WIDTH / 2, HEIGHT / 2);
			return;
		}

		const cam = data.camera;
		ctx.save();
		ctx.translate(WIDTH / 2, HEIGHT / 2);
		ctx.scale(cam.zoom, cam.zoom);
		ctx.translate(-cam.x, -cam.y);

		this.drawLevel(ctx, folder, data);

		for (const el of this.storage.elements.values()) {
			el.draw(ctx, folder, this.colorIdOf(el.owner), 1);
		}
		for (const monster of this.storage.monsters.values()) monster.animator.draw(ctx, folder);
		for (const bot of this.storage.bots.values()) bot.animator.draw(ctx, folder);
		for (const arrow of this.storage.arrows.values()) arrow.draw(ctx, folder, this.colorIdOf(arrow.owner));

		this.drawDragPreview(ctx, folder, data, playerIdx);
		ctx.restore();

		this.drawHud(ctx, folder, data, playerIdx);
	}

	/** Sky, forbidden build zones, bot portal and castle. */
	private drawLevel(ctx: CanvasRenderingContext2D, folder: Folder, data: ClientData) {
		const sky = ctx.createLinearGradient(0, 0, 0, LEVEL_HEIGHT);
		sky.addColorStop(0, COLOR_SKY_TOP);
		sky.addColorStop(1, COLOR_SKY_BOTTOM);
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, LEVEL_WIDTH, LEVEL_HEIGHT);

		// While building, darken the columns where nothing can be placed
		if (data.drag) {
			ctx.fillStyle = COLOR_FORBIDDEN_ZONE;
			ctx.fillRect(0, 0, BUILD_MIN_COL * CELL, LEVEL_HEIGHT);
			ctx.fillRect(BUILD_MAX_COL * CELL, 0, (LEVEL_COLS - BUILD_MAX_COL) * CELL, LEVEL_HEIGHT);
		}

		// Spawn portal
		ctx.fillStyle = COLOR_PORTAL;
		ctx.fillRect(0, FLOOR_TOP_Y - CELL * 2, CELL * 2, CELL * 2);

		// Castle + its life bar
		drawTexture(
			ctx, folder, TEX_CASTLE, undefined,
			CASTLE_RECT.x + CASTLE_RECT.w / 2, CASTLE_RECT.y + CASTLE_RECT.h / 2,
			CASTLE_RECT.w, CASTLE_RECT.h, COLOR_CASTLE
		);
		const barY = CASTLE_RECT.y - DAMAGE_BAR_OFFSET - DAMAGE_BAR_HEIGHT;
		ctx.fillStyle = COLOR_CASTLE_BAR_BG;
		ctx.fillRect(CASTLE_RECT.x, barY, CASTLE_RECT.w, DAMAGE_BAR_HEIGHT);
		ctx.fillStyle = COLOR_CASTLE_BAR_FG;
		ctx.fillRect(CASTLE_RECT.x, barY, CASTLE_RECT.w * (this.castleHp / CASTLE_HP), DAMAGE_BAR_HEIGHT);
	}

	/** Blue grid around the pointer whose opacity decreases with the distance. */
	private drawFadingGrid(ctx: CanvasRenderingContext2D, wx: number, wy: number) {
		const centerCol = Math.floor(wx / CELL) + 0.5;
		const centerRow = Math.floor(wy / CELL) + 0.5;

		for (let dr = -GRID_RADIUS_CELLS; dr <= GRID_RADIUS_CELLS; dr++) {
			for (let dc = -GRID_RADIUS_CELLS; dc <= GRID_RADIUS_CELLS; dc++) {
				const col = centerCol + dc;
				const row = centerRow + dr;
				if (col < 0 || row < 0 || col >= LEVEL_COLS || row >= LEVEL_ROWS) continue;

				const fade = 1 - Math.hypot(dc, dr) / GRID_RADIUS_CELLS;
				if (fade <= 0) continue;

				ctx.fillStyle = `rgba(${COLOR_GRID_BG}, ${fade * GRID_BG_MAX_ALPHA})`;
				ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
				ctx.strokeStyle = `rgba(${COLOR_GRID_LINE}, ${fade * GRID_LINE_MAX_ALPHA})`;
				ctx.strokeRect(col * CELL, row * CELL, CELL, CELL);
			}
		}
	}

	/** Preview of what a release would do: element ghost, or the element that would be removed. */
	private drawDragPreview(ctx: CanvasRenderingContext2D, folder: Folder, data: ClientData, playerIdx: number) {
		const drag = data.drag;
		if (!drag) return;

		ctx.save();
		ctx.translate(CELL/2, CELL/2);


		const world = data.camera.screenToWorld(drag.x, drag.y);
		this.drawFadingGrid(ctx, world.x, world.y);

		const { col, row } = data.getDragCell(drag.tool, drag.x, drag.y);
		let ok = false;
		let cost = 0;
		let rectCols = 1;
		let rectRows = 1;


		if (drag.tool === TOOL_REMOVE) {
			const target = this.elementAtCell(col, row);
			if (target) {
				const check = this.checkRemoval(playerIdx, target.uid);
				ok = check.status === 'ok';
				cost = check.cost;
				const spec = target.getSpec();
				rectCols = spec.cols; rectRows = spec.rows;
				ctx.strokeStyle = COLOR_REMOVE_TARGET;
				ctx.lineWidth = PREVIEW_OUTLINE_WIDTH;
				ctx.strokeRect(target.col * CELL, target.row * CELL, rectCols * CELL, rectRows * CELL);
				ctx.lineWidth = 1;
			}
			this.drawPreviewLabel(ctx, world.x, world.y, target ? cost : null, ok);
			ctx.restore();
			return;
		}

		ctx.translate(-CELL/2, -CELL/2);

		const check = this.checkPlacement(playerIdx, drag.tool, col, row);
		ok = check.status === 'ok';
		const spec = ELEMENT_CLASSES[drag.tool].SPEC;

		// Ghost element (a temporary, never registered instance)
		const ghost = ELEMENT_CLASSES[drag.tool].create({ col, row, owner: playerIdx, variant: data.variant });
		ghost.draw(ctx, folder, this.colorIdOf(playerIdx), PREVIEW_ALPHA);

		ctx.strokeStyle = ok ? COLOR_PREVIEW_OK : COLOR_PREVIEW_KO;
		ctx.lineWidth = PREVIEW_OUTLINE_WIDTH;
		ctx.strokeRect(col * CELL, row * CELL, spec.cols * CELL, spec.rows * CELL);
		ctx.lineWidth = 1;

		this.drawPreviewLabel(ctx, world.x, world.y, check.cost, ok);

		ctx.restore();
	}

	private drawPreviewLabel(ctx: CanvasRenderingContext2D, wx: number, wy: number, cost: number | null, ok: boolean) {
		if (cost === null) return;
		ctx.font = FONT_PREVIEW;
		ctx.textAlign = 'center';
		ctx.fillStyle = ok ? COLOR_PREVIEW_OK : COLOR_PREVIEW_KO;
		ctx.fillText(cost === 0 ? 'free' : cost.toFixed(1), wx, wy - PREVIEW_LABEL_OFFSET_Y);
	}

	/** Screen-space UI: elixir bar, card bar (+ trash tool) and ramp orientation button. */
	private drawHud(ctx: CanvasRenderingContext2D, folder: Folder, data: ClientData, playerIdx: number) {
		const player = this.players[playerIdx];
		if (!player) return;

		// Elixir bar (one segment per elixir point)
		const segW = CARD_BAR_WIDTH / ELIXIR_MAX;
		ctx.fillStyle = COLOR_ELIXIR_BG;
		ctx.fillRect(CARD_BAR_LEFT, ELIXIR_BAR_TOP, CARD_BAR_WIDTH, ELIXIR_BAR_HEIGHT);
		for (let i = 0; i < ELIXIR_MAX; i++) {
			const fill = clamp(player.elixir - i, 0, 1);
			ctx.fillStyle = COLOR_ELIXIR_FG;
			ctx.fillRect(CARD_BAR_LEFT + i * segW + 1, ELIXIR_BAR_TOP + 2, (segW - 2) * fill, ELIXIR_BAR_HEIGHT - 4);
		}
		ctx.font = FONT_ELIXIR;
		ctx.fillStyle = COLOR_ELIXIR_TEXT;
		ctx.textAlign = 'center';
		ctx.fillText(String(Math.floor(player.elixir)), WIDTH / 2, ELIXIR_BAR_TOP + ELIXIR_BAR_HEIGHT - 6);

		// Cards
		const colorId = this.colorIdOf(playerIdx);
		for (let slot = 0; slot < SLOT_COUNT; slot++) {
			const tool = slotToTool(slot);
			const r = cardRect(slot);
			// Keep the selected card highlighted, including while it is being dragged.
			const selected = data.drag?.tool === tool || data.selectedTool === tool;
			const spec = tool === TOOL_REMOVE ? null : ELEMENT_CLASSES[tool].SPEC;
			const affordable = spec ? player.elixir >= spec.price : true;

			ctx.fillStyle = COLOR_CARD_BG;
			ctx.fillRect(r.x, r.y, r.w, r.h);
			ctx.strokeStyle = selected ? COLOR_CARD_SELECTED : COLOR_FALLBACK_OUTLINE;
			ctx.lineWidth = selected ? PREVIEW_OUTLINE_WIDTH : 1;
			ctx.strokeRect(r.x, r.y, r.w, r.h);
			ctx.lineWidth = 1;

			const iconX = r.x + r.w / 2;
			const iconY = r.y + r.h / 2 - 10;
			if (spec) {
				drawTexture(ctx, folder, spec.texture, colorId, iconX, iconY, CARD_ICON_SIZE, CARD_ICON_SIZE, spec.fallbackColor);
			} else {
				ctx.fillStyle = COLOR_REMOVE_TOOL;
				ctx.fillRect(iconX - CARD_ICON_SIZE / 2, iconY - CARD_ICON_SIZE / 2, CARD_ICON_SIZE, CARD_ICON_SIZE);
				ctx.fillStyle = COLOR_CARD_TEXT;
				ctx.font = FONT_REMOVE;
				ctx.textAlign = 'center';
				ctx.fillText('\u2716', iconX, iconY + 10);
			}

			ctx.font = FONT_CARD;
			ctx.fillStyle = COLOR_CARD_TEXT;
			ctx.textAlign = 'center';
			ctx.fillText(spec ? spec.label : 'Remove', iconX, r.y + r.h - 8);

			if (spec) {
				const bx = r.x + PRICE_BADGE_MARGIN + PRICE_BADGE_RADIUS;
				const by = r.y + PRICE_BADGE_MARGIN + PRICE_BADGE_RADIUS;
				ctx.fillStyle = COLOR_ELIXIR_FG;
				ctx.beginPath();
				ctx.arc(bx, by, PRICE_BADGE_RADIUS, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = COLOR_ELIXIR_TEXT;
				ctx.font = FONT_PRICE;
				ctx.fillText(String(spec.price), bx, by + 6);
			}

			if (!affordable) {
				ctx.fillStyle = COLOR_DISABLED;
				ctx.fillRect(r.x, r.y, r.w, r.h);
			}
		}

		// Generic placement variants are shown above the card while dragging,
		// and remain there after a short click until the user clicks elsewhere.
		const variantTool = data.variantMenuTool ?? (data.drag ? data.drag.tool : null);
		if (variantTool !== null) {
			const spec = ELEMENT_CLASSES[variantTool]?.SPEC;
			const variants = spec?.placementVariants;
			if (variants && variants.length > 1) {
				for (let variant = 0; variant < variants.length; variant++) {
					const r = placementVariantRect(variantTool, variant, variants.length);
					const selected = data.variant === variant;
					ctx.fillStyle = selected ? COLOR_CARD_SELECTED : COLOR_CARD_BG;
					ctx.fillRect(r.x, r.y, r.w, r.h);
					ctx.strokeStyle = selected ? COLOR_CARD_SELECTED : COLOR_FALLBACK_OUTLINE;
					ctx.lineWidth = selected ? 2 : 1;
					ctx.strokeRect(r.x, r.y, r.w, r.h);
					ctx.lineWidth = 1;
					ctx.fillStyle = COLOR_CARD_TEXT;
					ctx.font = FONT_PLACEMENT_OPTION;
					ctx.textAlign = 'center';
					ctx.fillText(variants[variant], r.x + r.w / 2, r.y + r.h / 2 + 7);
				}
			}
		}

	}

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	/* ------------------------------- save / load ------------------------------- */

	/** Encodes one element with the protobuf message of its type. */
	private encodeElement(el: PlacedElement): Uint8Array {
		const messages = protocols.get();
		const def = ELEMENT_CLASSES[el.getTypeIdx()];

		return messages[def.DATA_MESSAGE].encode(el.save()).finish();
	}

	override save(): Uint8Array {
		const { State } = protocols.get();

		// Engine not ready yet: hand back what we were given (nothing else exists)
		if (!this.engine) return this.pendingState ?? new Uint8Array();

		const object: Fields = {
			players: this.players.map(p => p.save()),
			time: this.time,
			redScore: this.redScore,
			blueScore: this.blueScore,
			castleHp: this.castleHp,
			waveTimer: this.waveTimer,
			waveIndex: this.waveIndex,
			spawnQueue: this.spawnQueue,
			spawnTimer: this.spawnTimer,
			nextUid: this.nextUid,
			// (blockId, typeIdx, bytes data)
			blocks: [...this.storage.elements.values()].map(el => ({
				blockId: el.uid,
				typeIdx: el.getTypeIdx(),
				data: this.encodeElement(el),
			})),
			bots: [...this.storage.bots.values()].map(b => ({ blockId: b.uid, ...b.save() })),
			arrows: [...this.storage.arrows.values()].map(a => ({ blockId: a.uid, ...a.save() })),
			monsters: [...this.storage.monsters.values()].map(m => ({ blockId: m.uid, ...m.save() })),
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		// The engine is created asynchronously: remember the state until it is ready
		if (!this.engine) {
			this.pendingState = data;
			return;
		}
		this.applyState(data);
	}

	/** Rebuilds the whole world from a saved state. */
	private applyState(data: Uint8Array) {
		const { State } = protocols.get();
		const messages = protocols.get();
		const obj = decodeFullMessage(State.decode(data));

		this.clearWorld();

		for (let i = 0; i < obj.players.length; i++) {
			this.players[i].load(obj.players[i]);
		}
		this.time = obj.time;
		this.redScore = obj.redScore;
		this.blueScore = obj.blueScore;
		this.castleHp = obj.castleHp;
		this.waveTimer = obj.waveTimer;
		this.waveIndex = obj.waveIndex;
		this.spawnQueue = obj.spawnQueue;
		this.spawnTimer = obj.spawnTimer;
		this.nextUid = obj.nextUid;

		for (const b of obj.blocks) {
			const def = ELEMENT_CLASSES[b.typeIdx];
			const el = def.create({ col: 0, row: 0, owner: NO_OWNER, variant: 0 });
			el.load(decodeFullMessage(messages[def.DATA_MESSAGE].decode(b.data)));
			this.registerElement(el, b.blockId);
		}
		for (const o of obj.bots) {
			const bot = new Bot();
			bot.load(o);
			this.register(bot, 'bot', this.storage.bots, o.blockId);
		}
		for (const o of obj.arrows) {
			const arrow = new Arrow(o.owner);
			arrow.load(o);
			this.register(arrow, 'arrow', this.storage.arrows, o.blockId);
		}
		for (const o of obj.monsters) {
			const monster = new Monster(o.owner, this.colorIdOf(o.owner) ?? COLOR_ID_RED);
			monster.load(o);
			this.register(monster, 'monster', this.storage.monsters, o.blockId);
		}
	}

	override getSize() {
		return { width: WIDTH, height: HEIGHT };
	}

	/** Converts a canvas position into world coordinates (and keeps the raw one for the UI). */
	override evalMouseCoords(
		x: number,
		y: number,
		_playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;
		clientData.rawMouseX = x;
		clientData.rawMouseY = y;

		const world = clientData.camera.screenToWorld(x, y);
		clientData.mouseX = world.x;
		clientData.mouseY = world.y;
		return world;
	}

	override getMobileDesc(): MobileDescriptor {
		// Touch is handled directly through getDigits(): no virtual joystick / button
		return { joysticks: {}, buttons: {} };
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	/**
	 * Teams are ranked by score (kills), players inside a team by their own kills.
	 * playerEqualities uses the position in the flattened ranking (see FinishGame).
	 */
	private produceFinish(): FinishGame {
		const groups = ([DEFAULT_TEAM_RED, DEFAULT_TEAM_BLUE] as const)
			.map(team => ({
				score: team === DEFAULT_TEAM_RED ? this.redScore : this.blueScore,
				members: this.players
					.map((p, i) => ({ p, i }))
					.filter(m => m.p.team === team)
					.sort((a, b) => b.p.kills - a.p.kills),
			}))
			.filter(g => g.members.length > 0)
			.sort((a, b) => b.score - a.score);

		const results = groups.map(g => g.members.map(m => m.i));

		const teamEqualities: number[] = [];
		for (let i = 0; i < groups.length - 1; i++) {
			if (groups[i].score === groups[i + 1].score) teamEqualities.push(i);
		}

		const playerEqualities: number[] = [];
		let position = 0;
		for (const g of groups) {
			for (let k = 0; k < g.members.length - 1; k++) {
				if (g.members[k].p.kills === g.members[k + 1].p.kills) playerEqualities.push(position + k);
			}
			position += g.members.length;
		}

		return { results, teamEqualities, playerEqualities };
	}
}

import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader, ImageLoaderFolder } from "../util/ImageLoader";
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

/** Axis-aligned rectangle of the castle. x/y are the CENTER, like all engine rectangles. */
const CASTLE_RECT = {
	x: (CASTLE_COL + CASTLE_COLS / 2) * CELL,
	y: FLOOR_TOP_Y - (CASTLE_ROWS / 2) * CELL,
	w: CASTLE_COLS * CELL,
	h: CASTLE_ROWS * CELL,
};

/** Anything falling below this line is considered lost in the void. */
const VOID_Y = LEVEL_HEIGHT + CELL * 3;

// ---- Match rules -----------------------------------------------------------
const CASTLE_HP = 100;
const MATCH_DURATION = 300;          // 5 minutes
const TIMER_VISIBLE_SECONDS = 60;    // the clock is only displayed during the last minute
const NEUTRAL_BLOCK_LIFETIME = Infinity;
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
const BOT_FRAME_WIDTH = 32;
const BOT_FRAME_HEIGHT = 48;
const BOT_RUNNING_SPEED = 100;       // speed from which the 'running' animation is used
/** A bot that dies of the void is credited to the last element that touched it within this window. */
const KILL_CREDIT_WINDOW = 2;
const BOT_WALL_JUMP_KICK = 260;

const WAVE_FIRST_DELAY = 0.1;
const WAVE_INTERVAL = 2;
const WAVE_BASE_SIZE = 3;
const WAVE_SIZE_GROWTH = 1;
const WAVE_MAX_SIZE = 14;
const BOT_SPAWN_INTERVAL = 0.6;

// ---- Element: block --------------------------------------------------------
const BLOCK_PRICE = 0.5;
const BLOCK_HP = 30;

// ---- Element: spike --------------------------------------------------------
const SPIKE_PRICE = 2;
const SPIKE_HP = 25;

// ---- Element: trampoline ---------------------------------------------------
const TRAMPOLINE_PRICE = 2;
const TRAMPOLINE_HP = 30;
const TRAMPOLINE_BOUNCE_SPEED = 900;

// ---- Element: archer tower (1x2 cells) + arrows ----------------------------
const ARCHER_PRICE = 3;
const ARCHER_HP = 25;
const ARCHER_ROWS = 2;
const ARCHER_RANGE = 450;
const ARCHER_COOLDOWN = 0.9;
const ARCHER_MUZZLE_OFFSET = 10;     // distance of the muzzle below the tower top
const ARROW_SPEED = 600;
const ARROW_LIFETIME = 2.5;
const ARROW_LENGTH = 28;
const ARROW_THICKNESS = 8;

// ---- Element: rotating fire bar -------------------------------------------
const FIREBAR_PRICE = 5;
const FIREBAR_HP = 25;
const FIREBAR_BALLS = 5;
const FIREBAR_BALL_SPACING = 22;
const FIREBAR_BALL_RADIUS = 10;
const FIREBAR_ROTATION_SPEED = 2.2;  // radians / second

// ---- Element: thwomp (2x2 cells) ------------------------------------------
const THWOMP_PRICE = 2;
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
const MONSTER_SIZE = 30;
const MONSTER_LIFETIME = 8;
const MONSTER_KILL_LIFETIME_COST = 2;
const MONSTER_SPEED = 90;
const MONSTER_JUMP_SPEED = 450;
const MONSTER_ACCELERATION = 600;
const MONSTER_SOFT_DECELERATION = 500;
const MONSTER_HARD_DECELERATION = 900;

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
const GAME_FOLDER = 'castle';
const ASSET_ROOT = '/assets/games/castle';
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
const TEX_BOT = 'player';
const TEX_CASTLE = 'castle';
// Distant SVG layers. They are loaded as regular game textures and tiled only
// horizontally inside the camera's visible range. There is deliberately no Y tiling.
const TEX_BACKGROUND_CLOUDS_FAR = 'background_clouds_far';
const TEX_BACKGROUND_CLOUDS_MID = 'background_clouds_mid';
const TEX_BACKGROUND_MOUNTAINS_FAR = 'background_mountains_far';
const TEX_BACKGROUND_HILLS_FAR = 'background_hills_mid_far';
const TEX_BACKGROUND_HILLS_MID = 'background_hills_mid';
const TEX_BACKGROUND_HILLS_NEAR = 'background_hills_mid_near';
const TEX_BACKGROUND_TREES_MID = 'background_trees_mid';
const TEX_BACKGROUND_TREES_NEAR = 'background_trees_near';
const BACKGROUND_TEXTURES = [
	TEX_BACKGROUND_CLOUDS_FAR, TEX_BACKGROUND_CLOUDS_MID,
	TEX_BACKGROUND_MOUNTAINS_FAR,
	TEX_BACKGROUND_HILLS_FAR, TEX_BACKGROUND_HILLS_MID, TEX_BACKGROUND_HILLS_NEAR,
	TEX_BACKGROUND_TREES_MID, TEX_BACKGROUND_TREES_NEAR,
];
const TEXTURE_NAMES = [
	TEX_BLOCK, TEX_SPIKE, TEX_TRAMPOLINE, TEX_ARCHER, TEX_FIREBAR, TEX_FIREBALL,
	TEX_THWOMP, TEX_SPAWNER, TEX_RAMP, TEX_ARROW, TEX_MONSTER, TEX_BOT, TEX_CASTLE,
	...BACKGROUND_TEXTURES,
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
const ANIMATION_LINES_PER_STATE = 1;               // sprite-sheet lines used by each animator state

// ---- Colours used when a texture is missing / for the UI -------------------
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

// ---- Distant SVG background --------------------------------------------------
const BACKGROUND_LAYERS = [
	// Far
	{ texture: TEX_BACKGROUND_CLOUDS_FAR, parallaxX: 0.17, parallaxY: 0.051, zoomResponse: 0.20, scale: 1.05, y: -170, opacity: 0.92 },
	{ texture: TEX_BACKGROUND_MOUNTAINS_FAR, parallaxX: 0.476, parallaxY: 0.136, zoomResponse: 0.45, scale: 1.00, y: -80, opacity: 0.92 },

	// Mid
	{ texture: TEX_BACKGROUND_CLOUDS_MID, parallaxX: 0.765, parallaxY: 0.238, zoomResponse: 0.70, scale: 1.00, y: 10, opacity: 0.86 },
	// The original hills artwork is split into three depth planes.
	{ texture: TEX_BACKGROUND_HILLS_FAR, parallaxX: 0.884, parallaxY: 0.289, zoomResponse: 0.72, scale: 1.02, y: 120, opacity: 0.96 },
	{ texture: TEX_BACKGROUND_HILLS_MID, parallaxX: 1.19, parallaxY: 0.425, zoomResponse: 0.95, scale: 1.02, y: 120, opacity: 0.96 },
	{ texture: TEX_BACKGROUND_HILLS_NEAR, parallaxX: 1.496, parallaxY: 0.561, zoomResponse: 1.12, scale: 1.02, y: 120, opacity: 0.96 },
	{ texture: TEX_BACKGROUND_TREES_MID, parallaxX: 1.615, parallaxY: 0.68, zoomResponse: 1.20, scale: 1.00, y: 80, opacity: 1.00 },

	// Near
	{
		texture: TEX_BACKGROUND_TREES_NEAR,
		parallaxX: 1.00,
		parallaxY: 1.00,
		zoomResponse: 1.00,
		scale: 1.00,
		y: 190,
		opacity: 1.00,
	}
] as const;

const BACKGROUND_TILE_WIDTH = 1600;
const BACKGROUND_TILE_HEIGHT = 1400;
const BACKGROUND_SKY_TOP = '#78c8f2';
const BACKGROUND_SKY_BOTTOM = '#f6d58b';

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
const ELEMENT_TYPE_COUNT = 7;
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

/** Rectangle in the engine/collisions convention: x/y are the CENTER. */
function rectOf(block: platformEngine.Block<any, any>) {
	const size = block.getSize();
	return {
		x: block.x,
		y: block.y,
		w: size.width,
		h: size.height,
	};
}

/**
 * Draws a texture centered on (cx, cy).
 * Missing 2x2 placeholder textures are skipped; no geometric fallback is drawn.
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
/* BOTS API - navigation des bots vers le château                             */
/* ========================================================================== */
/*
 * Principe
 * --------
 * 1. La grille est relue (elementAtCell) uniquement quand la carte change.
 * 2. Noeuds du graphe :
 *      - FloorNode : un Segment horizontal sur lequel le bot peut marcher
 *                    (xmin / xmax = extrémités du centre du bot, déjà rognées
 *                    par les murs / pointes voisins).
 *      - WallNode  : le bot collé à un mur (côté, colonne, tranche de 10 px).
 * 3. Arêtes, calculées par simulation (Courb + collisions AABB sur la grille) :
 *      - drop     : le bot tombe par le bout d'un floor,
 *      - jump     : saut depuis le floor (2 courbes : montée + descente),
 *      - slide    : glissement le long d'un mur,
 *      - letgo    : on lâche le mur,
 *      - wallJump : saut depuis le mur (2 courbes aussi).
 *    Une simulation s'arrête dès que le bot touche un floor (-> FloorNode),
 *    touche un mur (-> WallNode), touche le château (-> but) ou meurt.
 * 4. Un Dijkstra INVERSE depuis le château donne, pour chaque noeud, la
 *    prochaine arête à prendre. Il est partagé par tous les bots, donc le coût
 *    par bot et par frame est O(1).
 */
namespace botsApi {
	/* ---------------------------------------------------------------------- */
	/* Réglages                                                                */
	/* ---------------------------------------------------------------------- */

	/** true : les pointes sont des obstacles mortels que les bots évitent. */
	const AVOID_SPIKES = true;

	/** Mettre à false pour couper tous les logs. */
	const DEBUG = true;
	/** Intervalle (s) entre deux logs d'état d'un même bot (en plus des logs à chaque changement de décision). */
	const LOG_INTERVAL = 0.5;
	const r1 = (v: number) => Math.round(v * 10) / 10;

	const H = BOT_SIZE / 2;
	const EPS = 1e-4;
	const SIM_DT = 1 / 120;
	const SIM_MAX_TIME = 3;
	/** Pas d'échantillonnage des points de départ de saut sur un floor (px). */
	const TAKEOFF_STEP = 10;
	/** Hauteur d'une tranche de mur (px). */
	const BUCKET = 10;
	const BUCKETS = Math.ceil(LEVEL_HEIGHT / BUCKET);
	/** Pénalité (en secondes équivalentes) par saut / chute : préfère les chemins simples. */
	const HOP_COST = 0.3;
	const SLIDE_TIME = 0.06;
	/** Le bot est considéré « au sol » s'il est à moins de GROUND_TOL px d'un floor et presque immobile en y. */
	const GROUND_TOL = 4;
	const GROUND_VY = 30;
	/** Dépassement max (px) du point de départ d'un saut qui est encore toléré. */
	const TAKEOFF_OVERSHOOT = 8;
	/** Vitesse horizontale moyenne pendant la montée d'un saut mural (kick -> vitesse de course). */
	const WALL_JUMP_VX = (BOT_WALL_JUMP_KICK + BOT_RUN_SPEED) / 2;
	const WALL_JUMP_COOLDOWN = 1 / BOT_WALL_JUMP_MAX_REPEAT_PER_SECOND;

	// Classes de cellules
	const FREE = 0;
	const SOLID = 1;          // solide sur lequel on peut se poser
	const SOLID_NO_STAND = 2; // solide mais on ne s'y pose pas (trampoline, rampe, bords du niveau)
	const DEADLY = 3;         // pointes

	type Dir = -1 | 0 | 1;
	const sgn = (v: number): Dir => (v > 0 ? 1 : v < 0 ? -1 : 0);

	/* ---------------------------------------------------------------------- */
	/* Géométrie                                                               */
	/* ---------------------------------------------------------------------- */

	/** Segment (floor ou mur). xmin / xmax sont les bornes calculées après intersection avec les blocs. */
	export class Segment {
		constructor(
			readonly x0: number,
			readonly y0: number,
			readonly x1: number,
			readonly y1: number,
		) {}
		get xmin() { return Math.min(this.x0, this.x1); }
		get xmax() { return Math.max(this.x0, this.x1); }
	}

	/** Parabole : x(t) = x + vx t ; y(t) = y + vy t + g t^2 / 2 (y vers le bas). */
	export class Courb {
		constructor(
			readonly x: number,
			readonly y: number,
			readonly v0: { x: number; y: number },
			readonly gravity: number,
		) {}
		at(t: number) {
			return {
				x: this.x + this.v0.x * t,
				y: this.y + this.v0.y * t + 0.5 * this.gravity * t * t,
			};
		}
	}

	/** Courbes idéales (sans collision) d'un saut : montée + descente. */
	function jumpCurves(x: number, y: number, vxUp: number, vxDown: number, vy0: number): Courb[] {
		const up = new Courb(x, y, { x: vxUp, y: vy0 }, GRAVITY);
		const apex = up.at(Math.max(0, -vy0 / GRAVITY));
		return [up, new Courb(apex.x, apex.y, { x: vxDown, y: 0 }, GRAVITY)];
	}

	/* ---------------------------------------------------------------------- */
	/* Graphe                                                                  */
	/* ---------------------------------------------------------------------- */

	type EdgeKind = 'walk' | 'drop' | 'jump' | 'slide' | 'letgo' | 'wallJump';

	interface Edge {
		to: number;
		kind: EdgeKind;
		/** Floor : x (centre du bot) où déclencher le saut / la chute. */
		takeoffX: number;
		/** Direction pendant la montée (ou la chute) et pendant la descente. */
		dirUp: Dir;
		dirDown: Dir;
		/** Durée de vol simulée (s) et coût utilisé par Dijkstra. */
		time: number;
		cost: number;
		/** Courbes idéales, pour debug / affichage. */
		curves: Courb[];
	}

	interface FloorNode {
		kind: 'floor';
		id: number;
		row: number;
		xl: number;
		xr: number;
		y: number;
		seg: Segment;
		leftOpen: boolean;
		rightOpen: boolean;
		edges: Edge[];
	}

	interface WallNode {
		kind: 'wall';
		id: number;
		side: -1 | 1; // côté où se trouve le mur
		col: number;
		bucket: number;
		x: number;
		y: number;
		edges: Edge[];
	}

	type NavNode = FloorNode | WallNode;

	type SimResult =
		| { type: 'land'; node: number; time: number }
		| { type: 'wall'; node: number; time: number }
		| { type: 'goal'; time: number }
		| { type: 'fail' };

	const wallKey = (side: number, col: number, bucket: number) =>
		(bucket * LEVEL_COLS + col) * 2 + (side > 0 ? 1 : 0);

	function classify(el: PlacedElement | null): number {
		if (!el) return FREE;
		if (el instanceof SpikeElement) return AVOID_SPIKES ? DEADLY : SOLID_NO_STAND;
		if (el instanceof TrampolineElement || el instanceof RampElement) return SOLID_NO_STAND;
		return SOLID;
	}

	class NavMap {
		readonly grid = new Uint8Array(LEVEL_COLS * LEVEL_ROWS);
		readonly nodes: NavNode[] = [];
		readonly floorsByRow: FloorNode[][] = Array.from({ length: LEVEL_ROWS }, () => []);
		readonly wallIds = new Map<number, number>();
		goalId = 0;
		/** next[node] = arête à suivre pour rejoindre le château (null = aucun chemin). */
		next: (Edge | null)[] = [];

		constructor(game: GMCastle, readonly version: number) {
			const t0 = Date.now();
			for (let r = 0; r < LEVEL_ROWS; r++) {
				for (let c = 0; c < LEVEL_COLS; c++) {
					this.grid[r * LEVEL_COLS + c] = classify(game.elementAtCell(c, r));
				}
			}
			this.buildFloors();
			this.buildWalls();
			this.goalId = this.nodes.length;
			for (const n of this.nodes) {
				if (n.kind === 'floor') this.floorEdges(n);
				else this.wallEdges(n);
			}
			this.solve();
			this.logSummary(Date.now() - t0);
		}

		private logSummary(ms: number) {
			if (!DEBUG) return;
			const floors = this.nodes.filter((n): n is FloorNode => n.kind === 'floor');
			const walls = this.nodes.length - floors.length;
			const kinds: Record<string, number> = {};
			let edges = 0;
			for (const n of this.nodes) for (const e of n.edges) { edges++; kinds[e.kind] = (kinds[e.kind] ?? 0) + 1; }
			const solid = this.grid.reduce((a, k) => a + (k !== FREE ? 1 : 0), 0);
			const reachable = this.next.filter(e => e !== null).length;
			for (const f of floors) {
				const e = this.next[f.id];
			}
		}

		/* ------------------------------ grille ------------------------------ */

		cell(c: number, r: number): number {
			if (c < 0 || c >= LEVEL_COLS) return SOLID_NO_STAND; // bords du niveau = murs
			if (r < 0 || r >= LEVEL_ROWS) return FREE;
			return this.grid[r * LEVEL_COLS + c];
		}

		/** Masque des cellules touchées par l'AABB du bot : 1 = solide, 2 = mortel, 4 = solide sur lequel se poser. */
		private probe(x: number, y: number, inflate = 0): number {
			const c0 = Math.floor((x - H - inflate) / CELL);
			const c1 = Math.ceil((x + H + inflate) / CELL) - 1;
			const r0 = Math.floor((y - H - inflate) / CELL);
			const r1 = Math.ceil((y + H + inflate) / CELL) - 1;
			let mask = 0;
			for (let r = r0; r <= r1; r++) {
				for (let c = c0; c <= c1; c++) {
					const k = this.cell(c, r);
					if (k === FREE) continue;
					if (k === DEADLY) mask |= 2;
					else {
						mask |= 1;
						if (k === SOLID) mask |= 4;
					}
				}
			}
			return mask;
		}

		/** Floor sous le bot posé à (x, y) : -1 si aucun. */
		floorAt(row: number, x: number, tol = 0): FloorNode | null {
			for (const n of this.floorsByRow[row] ?? []) {
				if (x >= n.xl - tol && x <= n.xr + tol) return n;
			}
			return null;
		}

		wallAt(side: number, col: number, bucket: number): WallNode | null {
			const id = this.wallIds.get(wallKey(side, col, bucket));
			return id === undefined ? null : (this.nodes[id] as WallNode);
		}

		/* ------------------------------ noeuds ------------------------------ */

		private canStand(c: number, r: number): boolean {
			return this.cell(c, r) === FREE && this.cell(c, r + 1) === SOLID;
		}

		private buildFloors() {
			for (let r = 0; r < LEVEL_ROWS - 1; r++) {
				let c = 0;
				while (c < LEVEL_COLS) {
					if (!this.canStand(c, r)) { c++; continue; }
					const c0 = c;
					while (c < LEVEL_COLS && this.canStand(c, r)) c++;
					this.addFloor(r, c0, c - 1);
				}
			}
		}

		/** Un Segment sur tout le floor : bornes xmin / xmax = intersection avec les blocs voisins. */
		private addFloor(r: number, c0: number, c1: number) {
			const left = this.cell(c0 - 1, r);
			const right = this.cell(c1 + 1, r);
			const leftOpen = left === FREE;
			const rightOpen = right === FREE;
			const xl = leftOpen ? c0 * CELL - H + 1 : c0 * CELL + H + (left === DEADLY ? 2 : 0);
			const xr = rightOpen ? (c1 + 1) * CELL + H - 1 : (c1 + 1) * CELL - H - (right === DEADLY ? 2 : 0);
			const y = (r + 1) * CELL - H;
			const node: FloorNode = {
				kind: 'floor', id: this.nodes.length, row: r, xl, xr, y,
				seg: new Segment(xl, y, xr, y), leftOpen, rightOpen, edges: [],
			};
			this.nodes.push(node);
			this.floorsByRow[r].push(node);
		}

		/** Un noeud mur pour chaque (côté, colonne, tranche de 10 px) où le bot peut être collé à un mur. */
		private buildWalls() {
			for (let col = 0; col < LEVEL_COLS; col++) {
				for (const side of [-1, 1] as const) {
					const x = side > 0 ? (col + 1) * CELL - H - EPS : col * CELL + H + EPS;
					for (let b = 0; b < BUCKETS; b++) {
						const y = b * BUCKET + BUCKET / 2;
						if (this.probe(x, y) !== 0 || (this.probe(x, y, 1.5) & 2)) continue;
						if (!this.touchesWall(x, y, side)) continue;
						const id = this.nodes.length;
						this.nodes.push({ kind: 'wall', id, side, col, bucket: b, x, y, edges: [] });
						this.wallIds.set(wallKey(side, col, b), id);
					}
				}
			}
		}

		private touchesWall(x: number, y: number, side: number): boolean {
			const wc = Math.floor(x / CELL) + side;
			const r0 = Math.floor((y - H) / CELL);
			const r1 = Math.ceil((y + H) / CELL) - 1;
			for (let r = r0; r <= r1; r++) {
				const k = this.cell(wc, r);
				if (k === SOLID || k === SOLID_NO_STAND) return true;
			}
			return false;
		}

		/* ----------------------------- simulation --------------------------- */

		/**
		 * Vol du bot : vx = vxUp tant que vy < 0, vxDown ensuite (le bot peut changer de direction en l'air).
		 * originSide : mur dont on part (son contact ne compte pas tant qu'on ne l'a pas quitté).
		 */
		private simulate(
			x0: number, y0: number, vxUp: number, vxDown: number, vy0: number, originSide: number,
		): SimResult {
			let x = x0;
			let y = y0;
			let vy = vy0;
			let armed = originSide === 0;
			const steps = Math.ceil(SIM_MAX_TIME / SIM_DT);

			for (let i = 1; i <= steps; i++) {
				const time = i * SIM_DT;
				vy += GRAVITY * SIM_DT;
				const vx = vy < 0 ? vxUp : vxDown;

				// --- horizontal ---
				let wall = 0;
				if (vx !== 0) {
					x += vx * SIM_DT;
					if (this.probe(x, y) & 1) {
						x = vx > 0
							? Math.ceil((x + H) / CELL) * CELL - CELL - H - EPS
							: (Math.floor((x - H) / CELL) + 1) * CELL + H + EPS;
						wall = vx > 0 ? 1 : -1;
					}
				}

				// --- vertical ---
				y += vy * SIM_DT;
				let landed = false;
				if (this.probe(x, y) & 1) {
					if (vy > 0) {
						y = (Math.ceil((y + H) / CELL) - 1) * CELL - H - EPS;
						landed = true;
					} else {
						y = (Math.floor((y - H) / CELL) + 1) * CELL + H + EPS;
					}
					vy = 0;
				}

				// --- issues ---
				if (this.probe(x, y, 1.5) & 2) return { type: 'fail' };
				if (y - H > LEVEL_HEIGHT + CELL) return { type: 'fail' }; // le vide
				// CASTLE_RECT and bot coordinates use center-based rectangles.
				if (collisions.RectRect(
					{ x, y, w: H * 2, h: H * 2 },
					CASTLE_RECT,
				)) return { type: 'goal', time };

				if (landed) {
					const row = Math.floor((y + H + 1) / CELL);
					let stand = false;
					const c0 = Math.floor((x - H) / CELL);
					const c1 = Math.ceil((x + H) / CELL) - 1;
					for (let c = c0; c <= c1; c++) if (this.cell(c, row) === SOLID) stand = true;
					const floor = stand ? this.floorAt(row - 1, x) : null;
					return floor ? { type: 'land', node: floor.id, time } : { type: 'fail' };
				}

				if (wall === 0) armed = true;
				else if (armed) {
					const b = Math.floor(y / BUCKET);
					const col = Math.floor(x / CELL);
					for (const bb of [b, b - 1, b + 1]) {
						const node = this.wallAt(wall, col, bb);
						if (node) return { type: 'wall', node: node.id, time };
					}
					return { type: 'fail' };
				}
			}
			return { type: 'fail' };
		}

		/** Ajoute l'arête issue d'une simulation (une seule arête, la moins chère, par couple from -> to). */
		private link(
			from: NavNode, res: SimResult,
			e: { kind: EdgeKind; takeoffX: number; dirUp: Dir; dirDown: Dir; curves: Courb[] },
		) {
			let to: number;
			if (res.type === 'land' || res.type === 'wall') to = res.node;
			else if (res.type === 'goal') to = this.goalId;
			else return;
			if (to === from.id) return;

			const cost = res.time + HOP_COST;
			const old = from.edges.findIndex(x => x.to === to);
			if (old >= 0 && from.edges[old].cost <= cost) return;
			const edge: Edge = { ...e, to, time: res.time, cost };
			if (old >= 0) from.edges[old] = edge; else from.edges.push(edge);
		}

		/* ------------------------------ arêtes ------------------------------ */

		private floorEdges(n: FloorNode) {
			const castle = CASTLE_RECT;

			// Le floor touche le château : on n'a plus qu'à marcher dessus.
			if (
				n.xl < castle.x + castle.w / 2 + H && n.xr > castle.x - castle.w / 2 - H &&
				n.y < castle.y + castle.h / 2 + H && n.y > castle.y - castle.h / 2 - H
			) {
				n.edges.push({
					to: this.goalId, kind: 'walk', takeoffX: castle.x,
					dirUp: 1, dirDown: 1, time: 0, cost: 0, curves: [],
				});
			}

			// Chute par un bout : le bot continue tout droit puis tombe (Courb).
			const y0 = n.y - EPS;
			if (n.leftOpen) {
				const x = n.xl - 1;
				const v = -BOT_RUN_SPEED;
				this.link(n, this.simulate(x, y0, v, v, 0, 0), {
					kind: 'drop', takeoffX: n.xl, dirUp: -1, dirDown: -1,
					curves: [new Courb(x, y0, { x: v, y: 0 }, GRAVITY)],
				});
			}
			if (n.rightOpen) {
				const x = n.xr + 1;
				const v = BOT_RUN_SPEED;
				this.link(n, this.simulate(x, y0, v, v, 0, 0), {
					kind: 'drop', takeoffX: n.xr, dirUp: 1, dirDown: 1,
					curves: [new Courb(x, y0, { x: v, y: 0 }, GRAVITY)],
				});
			}

			// Tous les sauts possibles (nouvelle branche du BFS) : montée + descente.
			const vy0 = -BOT_JUMP_SPEED;
			for (let x = n.xl; ; x += TAKEOFF_STEP) {
				if (x > n.xr) x = n.xr;
				for (const d of [-1, 1] as const) {
					const run = d * BOT_RUN_SPEED;
					for (const [up, down] of [[run, run], [run, 0], [0, run]]) {
						this.link(n, this.simulate(x, y0, up, down, vy0, 0), {
							kind: 'jump', takeoffX: x, dirUp: sgn(up), dirDown: sgn(down),
							curves: jumpCurves(x, y0, up, down, vy0),
						});
					}
				}
				if (x >= n.xr) break;
			}
		}

		private wallEdges(n: WallNode) {
			const away = -n.side;

			// Se laisser glisser le long du mur, puis tomber à la fin du mur.
			const below = this.wallAt(n.side, n.col, n.bucket + 1);
			if (below) {
				n.edges.push({
					to: below.id, kind: 'slide', takeoffX: n.x, dirUp: n.side, dirDown: n.side,
					time: SLIDE_TIME, cost: SLIDE_TIME, curves: [],
				});
			} else {
				const v = n.side * BOT_RUN_SPEED;
				this.link(n, this.simulate(n.x, n.y, v, v, 0, n.side), {
					kind: 'drop', takeoffX: n.x, dirUp: n.side, dirDown: n.side,
					curves: [new Courb(n.x, n.y, { x: v, y: 0 }, GRAVITY)],
				});
			}

			// Lâcher le mur.
			const out = away * BOT_RUN_SPEED;
			this.link(n, this.simulate(n.x, n.y, out, out, 0, n.side), {
				kind: 'letgo', takeoffX: n.x, dirUp: away as Dir, dirDown: away as Dir,
				curves: [new Courb(n.x, n.y, { x: out, y: 0 }, GRAVITY)],
			});

			// Sauts depuis le mur : kick à l'opposé du mur, puis on s'éloigne / on revient / on tombe droit.
			const vy0 = -BOT_JUMP_SPEED;
			const kick = away * WALL_JUMP_VX;
			for (const down of [away * BOT_RUN_SPEED, 0, n.side * BOT_RUN_SPEED]) {
				this.link(n, this.simulate(n.x, n.y, kick, down, vy0, n.side), {
					kind: 'wallJump', takeoffX: n.x, dirUp: away as Dir, dirDown: sgn(down),
					curves: jumpCurves(n.x, n.y, kick, down, vy0),
				});
			}
		}

		/* ------------------------------ Dijkstra ----------------------------- */

		/** Dijkstra inverse depuis le château : une seule fois par version de la carte. */
		private solve() {
			const N = this.nodes.length + 1;
			const dist = new Float64Array(N).fill(Infinity);
			const done = new Uint8Array(N);
			const rev: { from: number; edge: Edge }[][] = Array.from({ length: N }, () => []);
			for (const n of this.nodes) for (const e of n.edges) rev[e.to].push({ from: n.id, edge: e });

			this.next = new Array<Edge | null>(N).fill(null);
			dist[this.goalId] = 0;
			for (;;) {
				let v = -1;
				let best = Infinity;
				for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; v = i; }
				if (v < 0) break;
				done[v] = 1;
				for (const { from, edge } of rev[v]) {
					const nd = best + edge.cost;
					if (nd < dist[from]) { dist[from] = nd; this.next[from] = edge; }
				}
			}
		}
	}

	/* ---------------------------------------------------------------------- */
	/* Cache : un graphe par partie, recalculé uniquement si la carte change    */
	/* ---------------------------------------------------------------------- */

	const navCache = new WeakMap<object, NavMap>();

	/**
	 * Version de la carte.
	 * NB : mapModificationCount ne bouge que pour les poses / retraits des joueurs. Or les éléments
	 * qui expirent (hp <= 0, sol neutre) sortent via removeEntity, qui n'incrémente que
	 * navigationRevision. On utilise donc getNavigationRevision() (même rôle, plus fiable).
	 * Pour coller strictement à la demande : `return game.mapModificationCount;`
	 */
	function mapVersion(game: GMCastle): number {
		return game.getNavigationRevision();
	}

	function getNav(game: GMCastle): NavMap {
		const version = mapVersion(game);
		let nav = navCache.get(game);
		if (!nav || nav.version !== version) {
			nav = new NavMap(game, version);
			navCache.set(game, nav);
		}
		return nav;
	}

	/* ---------------------------------------------------------------------- */
	/* Données par bot (transitoires, jamais sérialisées)                       */
	/* ---------------------------------------------------------------------- */

	export class Data {
		/** Arête en cours d'exécution (sert à piloter la direction en l'air). */
		edge: Edge | null = null;
		jumpCooldown = 0;
		logTimer = 0;
		lastKey = '';

		save(): Fields {
			return {
				jumpCooldown: this.jumpCooldown,
				logTimer: this.logTimer,
				lastKey: this.lastKey,
			};
		}

		load(obj: Fields) {
			this.jumpCooldown = obj.jumpCooldown;
			this.logTimer = obj.logTimer;
			this.lastKey = obj.lastKey;
		}
	}

	export interface BotInput {
		/** Direction horizontale voulue : -1 gauche, 0 rien, 1 droite. */
		dir: Dir;
		jump: boolean;
		glueFloor: boolean;
		/** Le contrôleur considère le bot au sol (walker.onFloor() n'est pas fiable) : le Bot doit autoriser le saut. */
		grounded: boolean;
	}

	/** Pas de chemin / bot hors graphe : on fonce vers le château et on saute devant un mur. */
	function fallback(bot: Bot, grounded: boolean): Omit<BotInput, 'grounded'> {
		return { dir: 1, jump: grounded && bot.walker.onRight(), glueFloor: false };
	}

	/* ---------------------------------------------------------------------- */
	/* Contrôleur                                                              */
	/* ---------------------------------------------------------------------- */

	interface Trace { why: string; gap: number }

	export function getBotInput<TEngineData extends platformEngine.EngineData>(
		engine: platformEngine.IBlockEngine<TEngineData>,
		bot: Bot,
		dt: number,
	): BotInput {
		const game = engine.getGame() as GMCastle;
		const nav = getNav(game);
		const data = bot.botData;
		data.jumpCooldown = Math.max(0, data.jumpCooldown - dt);
		data.logTimer -= dt;

		const trace: Trace = { why: '', gap: NaN };
		const input = decide(nav, bot, dt, trace);

		if (DEBUG) {
			const key = `${trace.why}|${input.dir}|${input.jump}`;
			if (key !== data.lastKey || data.logTimer <= 0) {
				const w = bot.walker;
				const e = data.edge;
				data.lastKey = key;
				data.logTimer = LOG_INTERVAL;
			}
		}
		return input;
	}

	function decide(nav: NavMap, bot: Bot, dt: number, trace: Trace): BotInput {
		const data = bot.botData;
		const walker = bot.walker;

		// walker.onFloor() ne suffit pas (le bot peut flotter à ~2 px du sol) : on regarde aussi la géométrie.
		const row = Math.floor(bot.y / CELL);
		const node = nav.floorAt(row, bot.x, 2);
		trace.gap = node ? node.y - bot.y : NaN;
		const grounded = walker.onFloor()
			|| (node !== null && Math.abs(trace.gap) <= GROUND_TOL && Math.abs(bot.velocity.y) <= GROUND_VY);

		const out = (why: string, input: Omit<BotInput, 'grounded'>): BotInput => {
			trace.why = why;
			return { ...input, grounded };
		};

		/* ---- au sol : on suit l'arête du floor courant ---- */
		if (grounded) {
			if (!node) {
				data.edge = null;
				return out(`GROUND no floor node (row=${row} x=${r1(bot.x)}; floors on row: ${
					nav.floorsByRow[row]?.map(f => `[${r1(f.xl)}..${r1(f.xr)}]`).join(' ') || 'none'}) -> fallback`, fallback(bot, grounded));
			}
			const edge = nav.next[node.id];
			data.edge = edge;
			if (!edge) return out(`GROUND floor#${node.id} has NO PATH -> fallback`, fallback(bot, grounded));

			if (edge.kind === 'walk') {
				return out(`GROUND floor#${node.id} walk to castle`, { dir: sgn(edge.takeoffX - bot.x) || 1, jump: false, glueFloor: false });
			}
			if (edge.kind === 'drop') {
				return out(`GROUND floor#${node.id} walk to the ${edge.dirUp > 0 ? 'right' : 'left'} end and drop`, { dir: edge.dirUp, jump: false, glueFloor: false });
			}

			// jump : rejoindre le point de départ, puis sauter
			const dx = edge.takeoffX - bot.x;
			const s = edge.dirUp;
			const past = s * (bot.x - edge.takeoffX); // > 0 : on a dépassé le point de départ dans le sens du saut
			const blockedAhead = s > 0 ? walker.onRight() : s < 0 ? walker.onLeft() : false;

			if (Math.abs(dx) <= Math.max(2, BOT_RUN_SPEED * dt)) {
				return out(`GROUND floor#${node.id} JUMP at takeoff x=${r1(bot.x)}`, { dir: edge.dirUp, jump: true, glueFloor: false });
			}
			if (past > 0 && (blockedAhead || past <= TAKEOFF_OVERSHOOT)) {
				return out(`GROUND floor#${node.id} JUMP ${blockedAhead ? 'against the wall' : 'overshoot'} x=${r1(bot.x)} (takeoff ${r1(edge.takeoffX)})`,
					{ dir: edge.dirUp, jump: true, glueFloor: false });
			}
			return out(`GROUND floor#${node.id} going to takeoff x=${r1(edge.takeoffX)} (dx=${r1(dx)})`, { dir: sgn(dx), jump: false, glueFloor: false });
		}

		/* ---- collé à un mur (en l'air) : sauter, lâcher, ou glisser ---- */
		const onLeft = walker.onLeft();
		const onRight = walker.onRight();
		if (onLeft || onRight) {
			const side = onRight ? 1 : -1;
			const col = Math.floor(bot.x / CELL);
			const bucket = Math.floor(bot.y / BUCKET);
			const wnode = nav.wallAt(side, col, bucket);
			const edge = wnode ? nav.next[wnode.id] : null;
			if (edge) {
				data.edge = edge;
				if (edge.kind === 'wallJump' && data.jumpCooldown <= 0) {
					data.jumpCooldown = Math.max(WALL_JUMP_COOLDOWN, BOT_JUMP_COOLDOWN);
					return out(`WALL side=${side} col=${col} bucket=${bucket} WALL-JUMP`, { dir: edge.dirUp, jump: true, glueFloor: true });
				}
				if (edge.kind === 'letgo') {
					return out(`WALL side=${side} col=${col} bucket=${bucket} let go`, { dir: edge.dirUp, jump: false, glueFloor: false });
				}
			}
			return out(`WALL side=${side} col=${col} bucket=${bucket} node=${wnode ? '#' + wnode.id : 'NONE'} edge=${edge ? edge.kind : 'none'} -> slide`,
				{ dir: side, jump: false, glueFloor: false });
		}

		/* ---- en l'air : on applique les directions de l'arête (montée puis descente) ---- */
		const e = data.edge;
		if (e) {
			const up = bot.velocity.y < 0;
			return out(`AIR following ${e.kind} (${up ? 'rising' : 'falling'})`, { dir: up ? e.dirUp : e.dirDown, jump: false, glueFloor: false });
		}
		return out('AIR no edge', { dir: sgn(bot.velocity.x) || 1, jump: false, glueFloor: false });
	}
}


import getBotInput = botsApi.getBotInput;
import BotData = botsApi.Data;

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
	// if (aMob && bMob) return true;
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

/* ========================================================================== */
/* BLOCK 3 - BOT BLOCK                                                        */
/* ========================================================================== */

enum BotAnimatorState {
	IDLE,
	WALKING,
	RUNNING,
	JUMPING,
	FALLING,
	WALL_SLIDE,
	WALL_JUMP,
	WALL_HANG,
	HURT,
};

class BotAnimator extends platformEngine.Animator {
	static readonly ANIMATION_LINES = {
		[BotAnimatorState.IDLE] : {delay: 0.2, count: 8},
		[BotAnimatorState.WALKING] : {delay: 0.2, count: 8},
		[BotAnimatorState.RUNNING] : {delay: 0.2, count: 8},
		[BotAnimatorState.JUMPING] : {delay: 0.2, count: 4},
		[BotAnimatorState.FALLING] : {delay: 0.2, count: 4},
		[BotAnimatorState.WALL_SLIDE] : {delay: 0.2, count: 4},
		[BotAnimatorState.WALL_JUMP] : {delay: 0.2, count: 5},
		[BotAnimatorState.WALL_HANG] : {delay: 0.2, count: 5},
		[BotAnimatorState.HURT] : {delay: 0.2, count: 1},
	};

	constructor() {
		super(
			BOT_FRAME_WIDTH,
			BOT_FRAME_HEIGHT,
			TEX_BOT,
			null,
			BotAnimator.ANIMATION_LINES,
			BOT_RUNNING_SPEED
		);
	}

	update(
		block: platformEngine.Block<any, any>,
		walker: platformEngine.Walker,
		direction: platformEngine.Direction,
		current: number
	): platformEngine.StateReturn {
		const bot = block as Bot;
		const S = BotAnimatorState;

		if (
			(walker.onLeft() && direction.dir < 0) ||
			(walker.onRight() && direction.dir > 0)
		) {
			// On a wall
			if (current === S.WALL_HANG) {
				return {type: 'next', state: S.WALL_SLIDE};
			}

			if (current === S.WALL_SLIDE) {
				return {type: 'loop'};
			}

			return {type: 'switch', state: S.WALL_HANG};
		}

		if (current === S.WALL_SLIDE && bot.velocity.y < 0) {
			return {type: 'switch', state: S.WALL_JUMP};
		}

		if (current === S.WALL_JUMP && bot.velocity.y < 0) {
			return {type: 'loop'};
		}

		if (!walker.onFloor()) {
			if (bot.velocity.y < 0) {
				if (current === S.JUMPING) {
					return {type: 'loop'};
				} else {
					return {type: 'switch', state: S.FALLING};
				}
			} else {
				if (current === S.FALLING) {
					return {type: 'loop'};
				} else {
					return {type: 'switch', state: S.FALLING};
				}
			}
		}

		const running = (Math.abs(bot.velocity.x) > 40);
		const idle = bot.velocity.x === 0;

		if (idle) {
			return (
				current === S.IDLE ?
				{type: 'loop'} :
				{type: 'switch', state: S.IDLE}
			);
		}

		if (running) {
			return (
				current === S.RUNNING ?
				{type: 'loop'} :
				{type: 'switch', state: S.RUNNING}
			);
		}

		return (
			current === S.WALKING ?
			{type: 'loop'} :
			{type: 'switch', state: S.WALKING}
		);
	}

	getVisualZoom(): number {
		return 1.3;
	}

}

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

	/** Per-bot navigation cache shared with the bot controller. */
	readonly botData = new BotData();

	/** Set when the bot has been killed / consumed; it is removed right after the engine step. */
	dead = false;
	/** Last player whose element interacted with this bot (credit for void deaths). */
	lastToucher = NO_OWNER;
	lastTouchAge = KILL_CREDIT_WINDOW + 1;
	isOnTrampoline = false;


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

	override createAnimator() {
		return new BotAnimator();
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

	override processBeforeEngine(id: BlockId, dt: number, engine: Engine): void {
		this.isOnTrampoline = false;
		this.lastTouchAge = Math.min(this.lastTouchAge + dt, KILL_CREDIT_WINDOW + 1);

		const input = getBotInput(engine, this, dt);
		if (input.dir !== 0) this.direction.dir = input.dir * BOT_RUN_SPEED;

		this.velocity.y += GRAVITY * dt;

		if (input.jump) {
			const groundJump = this.walker.onFloor() || input.grounded;

			if (groundJump) {
				this.velocity.y = -BOT_JUMP_SPEED;
			} else if (input.glueFloor) {
				if (this.walker.onLeft()) {
					this.velocity.x = BOT_WALL_JUMP_KICK;
					this.velocity.y = -BOT_JUMP_SPEED;
					this.direction.dir = BOT_RUN_SPEED;
				} else if (this.walker.onRight()) {
					this.velocity.x = -BOT_WALL_JUMP_KICK;
					this.velocity.y = -BOT_JUMP_SPEED;
					this.direction.dir = -BOT_RUN_SPEED;
				}
			}
		}

		if (input.glueFloor && this.walker.onLeft() && this.walker.onRight()) {
			this.velocity.y = Math.min(this.velocity.y, BOT_WALL_SLIDE_MAX_SPEED);
		}
	}

	override processAfterEngine(
		_id: BlockId,
		dt: number,
		_engine: Engine
	): void {
		/*
		 * Safety net for collision resolution: keeps the bot state exact even when a
		 * numerical contact leaves a tiny residual velocity.
		 */
		if (this.walker.onFloor() && this.velocity.y > 0) this.velocity.y = 0;
		if (this.walker.onCeiling() && this.velocity.y < 0) this.velocity.y = 0;
		if (this.walker.onLeft() && this.velocity.x < 0) this.velocity.x = 0;
		if (this.walker.onRight() && this.velocity.x > 0) this.velocity.x = 0;

		if (this.isOnTrampoline) {
			this.velocity.y = -TRAMPOLINE_BOUNCE_SPEED;
		}

	}

	save(): Fields {
		return {
			x: this.x,
			y: this.y,
			vx: this.velocity.x,
			vy: this.velocity.y,
			lastToucher: this.lastToucher,
			lastTouchAge: this.lastTouchAge,
			...this.botData.save()
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
		this.botData.load(obj);
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
		
		if (other.block instanceof Bot) {
			other.block.isOnTrampoline = true;
			other.block.markTouched(this.owner);
		}
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
		// The SVG fills the complete 40x40 texture and owns its transparent silhouette.
		// Variant 1 is mirrored; getPolygon() remains the collision shape.
		if (this.variant === 1) {
			ctx.save();
			ctx.translate(this.x, 0);
			ctx.scale(-1, 1);
			ctx.translate(-this.x, 0);
			super.drawBody(ctx, folder, colorId);
			ctx.restore();
			return;
		}
		super.drawBody(ctx, folder, colorId);
	}
}

/* ------------------------------ element registry ------------------------- */

const TYPE_BLOCK = 0;
const TYPE_SPIKE = 1;
const TYPE_TRAMPOLINE = 2;
const TYPE_ARCHER = 3;
const TYPE_FIREBAR = 4;
const TYPE_THWOMP = 5;
const TYPE_RAMP = 6;

/** Index in this array == typeIdx sent over the network. */
const ELEMENT_CLASSES: ElementClass[] = [
	BlockElement, SpikeElement, TrampolineElement, ArcherTowerElement,
	FireBarElement, ThwompElement, RampElement,
];

/* ========================================================================== */
/* MOBILE BLOCKS: BOT, MONSTER, ARROW                                         */
/* ========================================================================== */

/** All animator states use the same number of sprite-sheet lines. */



/** A friendly creature released by a spawner: walks toward the bots, kills them on contact, expires. */
class Monster extends GameBlock {
	readonly walker = new platformEngine.Walker();
	readonly velocity: Velocity = { x: 0, y: 0 };
	readonly direction: Direction = {
		dir: 0, acc: MONSTER_ACCELERATION, softDec: MONSTER_SOFT_DECELERATION, hardDec: MONSTER_HARD_DECELERATION,
	};
	readonly effects = new platformEngine.VelocityEffectHandler();

	lifetime = MONSTER_LIFETIME;

	constructor(public owner: number, colorId: number) {
		super();
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
		
	}

	/** Touching a bot kills it, at the price of some of the monster's remaining lifetime. */
	override detectCollision(_id: BlockId, other: Entry, _side: Side, engine: Engine): void {
		if (other.block instanceof Bot && !other.block.dead) {
			engine.getGame().killBot(other.block, this.owner);
			this.lifetime -= MONSTER_KILL_LIFETIME_COST;
		}
	}

	draw(ctx: CanvasRenderingContext2D, loader: ImageLoaderFolder) {

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

	readonly score: HTMLDivElement;
	readonly scoreYou: HTMLDivElement;
	readonly scoreOpponent: HTMLDivElement;
	readonly scoreYouValue: HTMLDivElement;
	readonly scoreOpponentValue: HTMLDivElement;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-castle-root");

		/* ------------------------------------------------------------------ */
		/* Castle                                                              */
		/* ------------------------------------------------------------------ */

		this.castle = document.createElement("div");
		this.castle.classList.add("game-castle-castle");

		/* ------------------------------------------------------------------ */
		/* Timer                                                               */
		/* ------------------------------------------------------------------ */

		this.time = document.createElement("div");
		this.time.classList.add("game-castle-time");

		/* ------------------------------------------------------------------ */
		/* Score                                                               */
		/* ------------------------------------------------------------------ */

		this.score = document.createElement("div");
		this.score.classList.add("game-castle-score");

		this.scoreYou = document.createElement("div");
		this.scoreYou.classList.add(
			"game-castle-score-you",
		);
		this.scoreYou.textContent = "You";

		this.scoreOpponent = document.createElement("div");
		this.scoreOpponent.classList.add(
			"game-castle-score-opponent",
		);
		this.scoreOpponent.textContent = "Opponent";

		const dash = document.createElement("div");
		dash.classList.add("game-castle-score-dash");

		this.scoreYouValue = document.createElement("div");
		this.scoreYouValue.classList.add(
			"game-castle-score-you-value",
		);

		this.scoreOpponentValue = document.createElement("div");
		this.scoreOpponentValue.classList.add(
			"game-castle-score-opponent-value",
		);

		this.score.appendChild(this.scoreYou);
		this.score.appendChild(this.scoreOpponent);
		this.score.appendChild(dash);
		this.score.appendChild(this.scoreYouValue);
		this.score.appendChild(this.scoreOpponentValue);

		/* ------------------------------------------------------------------ */
		/* Root                                                                */
		/* ------------------------------------------------------------------ */

		this.html.appendChild(this.castle);
		this.html.appendChild(this.score);
		this.html.appendChild(this.time);

		this.camera.clamp();
	}

	static showTime(time: number) {
		const seconds = Math.floor(time % 60);
		return pad2(seconds);
	}

	/** Refreshes the DOM HUD (castle, scores, last-minute timer). */
	update(game: GMCastle, _playerIdx: number) {
		this.time.textContent = ClientData.showTime(game.time);

		// The clock only shows up during the last minute.
		this.time.style.display =
			game.time <= TIMER_VISIBLE_SECONDS
				? ''
				: 'none';

		this.castle.textContent =
			`Castle ${game.castleHp}/${CASTLE_HP}`;

		const isRed = this.localPlayer === 0;

		const youScore = isRed
			? game.redScore
			: game.blueScore;

		const opponentScore = isRed
			? game.blueScore
			: game.redScore;

		this.scoreYouValue.textContent = pad2(youScore);
		this.scoreOpponentValue.textContent = pad2(opponentScore);

		/* ------------------------------------------------------------------ */
		/* Colors                                                              */
		/* ------------------------------------------------------------------ */

		this.scoreYou.classList.toggle(
			"game-castle-red",
			isRed,
		);

		this.scoreYou.classList.toggle(
			"game-castle-blue",
			!isRed,
		);

		this.scoreYouValue.classList.toggle(
			"game-castle-red",
			isRed,
		);

		this.scoreYouValue.classList.toggle(
			"game-castle-blue",
			!isRed,
		);

		this.scoreOpponent.classList.toggle(
			"game-castle-red",
			!isRed,
		);

		this.scoreOpponent.classList.toggle(
			"game-castle-blue",
			isRed,
		);

		this.scoreOpponentValue.classList.toggle(
			"game-castle-red",
			!isRed,
		);

		this.scoreOpponentValue.classList.toggle(
			"game-castle-blue",
			isRed,
		);
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
	/** Number of player-driven modifications made to the map (place/remove/replace). */
	mapModificationCount = 0;

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
		this.mapModificationCount++;
	}

	private tryRemove(playerIdx: number, uid: number) {
		const check = this.checkRemoval(playerIdx, uid);
		if (check.status !== 'ok') return;

		this.players[playerIdx].elixir -= check.cost;
		this.removeEntity(uid);
		this.mapModificationCount++;
	}

	/* ---------------------------------- waves --------------------------------- */

	private runWaves(dt: number) {
		this.waveTimer -= dt;
		while (this.waveTimer <= 0) {
			const waveSize = Math.min(WAVE_MAX_SIZE, WAVE_BASE_SIZE + this.waveIndex * WAVE_SIZE_GROWTH);
			this.spawnQueue += waveSize;
			this.waveIndex++;
			this.waveTimer += WAVE_INTERVAL;
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

	/** Castle contact: the bot disappears and deals exactly 1 HP of damage. */
	private checkBotsAfterUpdate() {
		for (const bot of [...this.storage.bots.values()]) {
			if (bot.dead) continue;

			if (collisions.RectRect(rectOf(bot), CASTLE_RECT)) {
				// Mark the bot as dead before removing it so this contact can only
				// damage the castle once.
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

	static readonly TEXTURES: { [k: string]: string } = {
		...Object.fromEntries(
			TEXTURE_NAMES.map(name => [name, `${ASSET_ROOT}/${name}.${name === TEX_BOT ? "png" : "svg"}`])
		),
		player: `${ASSET_ROOT}/player.png`,
	};

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
			dt /= 2;
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

		mouse.getCoords();

		const pointers: Pointer[] = (
			(mobile ? mobile.getDigits() : [])
			.map(d => ({
				id: d.id,
				x: d.x0 * WIDTH / window.innerWidth,
				y: d.y0 * HEIGHT / window.innerHeight
			}))
		);

		if (mouse.press(0)) {
			pointers.push({ id: MOUSE_POINTER_ID, x: data.rawMouseX, y: data.rawMouseY });
		}

		if (pointers.length) {
			console.log(pointers);
		}

		const wheel = 0;

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

		// The old flat void background is removed. The sky is painted in screen
		// space so it always fills the viewport, independently from camera motion.
		const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
		sky.addColorStop(0, BACKGROUND_SKY_TOP);
		sky.addColorStop(1, BACKGROUND_SKY_BOTTOM);
		ctx.fillStyle = sky;
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

		for (const monster of this.storage.monsters.values()) {
			monster.draw(ctx, folder);
		}

		for (const [key, bot] of this.storage.bots) {
			const a = this.engine.getAnimator(key);
			a?.draw(bot, ctx, folder);
		}

		for (const arrow of this.storage.arrows.values()) {
			arrow.draw(ctx, folder, this.colorIdOf(arrow.owner));
		}

		this.drawDragPreview(ctx, folder, data, playerIdx);
		ctx.restore();

		this.drawHud(ctx, folder, data, playerIdx);
	}

	/**
	 * Draws the distant scenery before gameplay objects.
	 *
	 * The old procedural sky is deliberately gone: the scene is now made from
	 * externally loaded SVG layers. Each layer is tiled only across the area
	 * visible through the current camera. Its parallax factor is independent from
	 * the gameplay camera, so the scenery feels much farther away.
	 */
	private drawDistantBackground(ctx: CanvasRenderingContext2D, folder: Folder, data: ClientData) {
		const cam = data.camera;
		const levelCenterX = LEVEL_WIDTH / 2;
		const levelCenterY = LEVEL_HEIGHT / 2;

		/*
		 * The background is deliberately rendered in SCREEN SPACE.
		 *
		 * Gameplay is rendered afterwards with the normal camera transform:
		 *   translate(center) -> scale(zoom) -> translate(-camera)
		 *
		 * Keeping the background outside that transform is important: otherwise
		 * every layer stays synchronised with the camera and only appears to have
		 * a different offset. Here each plane computes its own screen position.
		 *
		 * Each layer independently controls:
		 *   - parallaxX/Y: how much camera translation reaches the layer;
		 *   - zoomResponse: how much camera zoom reaches the layer;
		 *   - scale/y/opacity: its own visual depth and anchoring.
		 */
		const cameraOffsetX = cam.x - levelCenterX;
		const cameraOffsetY = cam.y - levelCenterY;

		for (const layer of BACKGROUND_LAYERS) {
			const image = folder.get(layer.texture);

			// response=0 => almost fixed screen size; response=1 => full camera zoom.
			const zoom = 1 + (cam.zoom - 1) * layer.zoomResponse;
			const tileW = BACKGROUND_TILE_WIDTH * layer.scale * zoom;
			const tileH = BACKGROUND_TILE_HEIGHT * layer.scale * zoom;

			// Camera motion becomes screen motion only through this layer's depth.
			const centerX = WIDTH / 2 - cameraOffsetX * layer.parallaxX * cam.zoom;
			const centerY = HEIGHT / 2 + layer.y - cameraOffsetY * layer.parallaxY * cam.zoom;

			// Tile horizontally, but never vertically. The vertical position is
			// controlled by the layer's own depth plane instead.
			const firstX = Math.floor((-tileW - centerX) / tileW) * tileW + centerX;
			const lastX = Math.ceil((WIDTH + tileW - centerX) / tileW) * tileW + centerX;

			ctx.save();
			ctx.globalAlpha = layer.opacity;
			for (let x = firstX; x <= lastX; x += tileW) {
				ctx.drawImage(image, x, centerY - tileH, tileW, tileH);
			}
			ctx.restore();
		}
	}

	/** Gameplay-only decorations: forbidden build zones, portal and castle. */
	private drawLevel(ctx: CanvasRenderingContext2D, folder: Folder, data: ClientData) {
		this.drawDistantBackground(ctx, folder, data);

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
			CASTLE_RECT.x, CASTLE_RECT.y,
			CASTLE_RECT.w, CASTLE_RECT.h, COLOR_CASTLE
		);
		const barY = CASTLE_RECT.y - CASTLE_RECT.h / 2 - DAMAGE_BAR_OFFSET - DAMAGE_BAR_HEIGHT;
		ctx.fillStyle = COLOR_CASTLE_BAR_BG;
		const castleLeft = CASTLE_RECT.x - CASTLE_RECT.w / 2;
		ctx.fillRect(castleLeft, barY, CASTLE_RECT.w, DAMAGE_BAR_HEIGHT);
		ctx.fillStyle = COLOR_CASTLE_BAR_FG;
		ctx.fillRect(castleLeft, barY, CASTLE_RECT.w * (this.castleHp / CASTLE_HP), DAMAGE_BAR_HEIGHT);
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

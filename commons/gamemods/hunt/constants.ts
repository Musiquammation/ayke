/* -------------------------------------------------------------------------- */
/* Hunt: every tuning value of the game mode lives here                       */
/* -------------------------------------------------------------------------- */

// Screen (canvas) size
export const WIDTH = 2400;
export const HEIGHT = 1350;

// Match flow
export const MATCH_DURATION = 600;   // 10 minutes
export const KILLS_TO_WIN = 10;
export const RESPAWN_TIME = 3;
export const SPAWN_SHIELD_TIME = 1.5; // invulnerability right after a respawn
export const KILL_FEED_TIME = 5;      // seconds a kill stays in the kill feed
export const KILL_FEED_SIZE = 5;

// Player body (the player is a vertical cylinder)
export const PLAYER_RADIUS = 30;
export const PLAYER_HEIGHT = 72;
export const GUN_HEIGHT = 44;          // altitude (relative to the feet) where bullets spawn
export const PLAYER_SPEED = 380;
export const STEP_HEIGHT = 12;         // obstacles lower than this are walked over
export const GROUND_PROBE_RATIO = 0.6; // fraction of the radius used to find what we stand on

// Vertical motion
export const GRAVITY = 1600;
export const JUMP_VELOCITY = 560;      // apex ~ 98 units
export const MAX_FALL_SPEED = 1800;

// Life
export const MAX_HP = 4000;
export const REGEN_DELAY = 3;          // no damage taken and no shot for this long -> regen
export const REGEN_RATE = 0.13 * MAX_HP; // hp per second while regenerating

/*
 * Cartridges (shared between the three weapons).
 * A shot starts draining one cartridge: the counter goes down continuously until it reaches
 * the next integer, whether the trigger is still held or not. Every bullet fired meanwhile
 * belongs to that cartridge. Once nothing drains, the counter is blocked for RELOAD_DELAY,
 * then goes back up quickly.
 */
export const MAX_AMMO = 3;
export const RELOAD_DELAY = 0.7;
export const RELOAD_RATE = 2.2;        // cartridges per second once the reload started

export interface WeaponDef {
	name: string;
	drain: number;       // seconds to empty one cartridge
	cooldown: number;    // minimal delay between two shots
	speed: number;
	range: number;       // 3D distance a bullet travels
	damage: number;      // per bullet
	radius: number;      // bullet radius
	count: number;       // bullets fired at the same time
	scatter: number;     // bullets of one shot land in a disc of this radius around the target
	color: string;
}

export const WEAPON_LONG = 0;
export const WEAPON_MID = 1;
export const WEAPON_SHORT = 2;

export const WEAPONS: WeaponDef[] = [
	{ // 1 = long range: one big hit per cartridge
		name: "Sniper",
		drain: 0.55, cooldown: 0.6,
		speed: 2600, range: 1700, damage: 1500, radius: 10,
		count: 1, scatter: 0,
		color: "#7ad7ff",
	},
	{ // 2 = mid range: a stream of bullets while the cartridge drains
		name: "Burst",
		drain: 0.6, cooldown: 0.09,
		speed: 1600, range: 900, damage: 230, radius: 7,
		count: 1, scatter: 0,
		color: "#ffd166",
	},
	{ // 3 = short range: a handful of pellets converging on the target
		name: "Shotgun",
		drain: 0.45, cooldown: 0.5,
		speed: 1400, range: 420, damage: 200, radius: 6,
		count: 8, scatter: 45,
		color: "#ff8c42",
	},
];

// Bots: preferred distance to the target for each weapon
export const WEAPON_BOT_RANGES = [1100, 600, 250];

// Items
export const ITEM_SLOTS = 4;
export const ITEM_NONE = 0;
export const ITEM_BOMB = 1;
export const ITEM_BOOMERANG = 2;
export const ITEM_DASH = 3;
export const ITEM_JUMP = 4;
export const ITEM_KINDS = [ITEM_BOMB, ITEM_BOOMERANG, ITEM_DASH, ITEM_JUMP];

export const ITEM_NAMES: Record<number, string> = {
	[ITEM_BOMB]: "Bomb",
	[ITEM_BOOMERANG]: "Boomerang",
	[ITEM_DASH]: "Dash",
	[ITEM_JUMP]: "Super jump",
};

export const ITEM_TEXTURES: Record<number, string> = {
	[ITEM_BOMB]: 'item-bomb',
	[ITEM_BOOMERANG]: 'item-boomerang',
	[ITEM_DASH]: 'item-dash',
	[ITEM_JUMP]: 'item-jump',
};

// Colors of the item models (and fallback when a texture is missing)
export const ITEM_COLORS: Record<number, string> = {
	[ITEM_BOMB]: "#a3a3a3",
	[ITEM_BOOMERANG]: "#f59e0b",
	[ITEM_DASH]: "#60a5fa",
	[ITEM_JUMP]: "#f472b6",
};

// Bomb: thrown along an arc, explodes when it lands or touches something
export const BOMB_MAX_RANGE = 750;
export const BOMB_FLIGHT_TIME = 0.85;
export const BOMB_RADIUS = 12;
export const EXPLOSION_RADIUS = 220;
export const EXPLOSION_VERTICAL_REACH = 160;
export const EXPLOSION_DAMAGE = 1800;
export const EXPLOSION_DURATION = 0.45;
export const EXPLOSION_RAYS = 72;          // resolution of the zone hidden by walls

// Boomerang: goes out passing on the right, comes back on the left.
// When it hits something with life, it drags it back to the thrower.
export const BOOMERANG_REACH = 650;        // max forward distance of the loop (its apex is on the aim)
export const BOOMERANG_MIN_REACH = 200;
export const BOOMERANG_SIDE = 200;         // lateral distance of the loop
export const BOOMERANG_TIME = 1.1;         // duration of the whole loop
export const BOOMERANG_RADIUS = 18;
export const BOOMERANG_DAMAGE = 500;
export const BOOMERANG_PULL_SPEED = 950;
export const BOOMERANG_PULL_MAX_TIME = 2;  // the catch is released after this long
export const BOOMERANG_RELEASE_GAP = 20;   // released when this close to the thrower

// Dash: players touched are dragged along, then thrown up and stunned
export const DASH_DISTANCE = 520;
export const DASH_TIME = 0.28;
export const DASH_DAMAGE = 500;
export const DASH_GRAB_MARGIN = 14;
export const DASH_LAUNCH_VELOCITY = 720;
export const DASH_STUN = 1.3;              // seconds without attacking after the launch

// Super jump: a leap along an arc to the aimed point
export const SUPER_JUMP_RANGE = 800;
export const SUPER_JUMP_TIME = 0.9;
export const SUPER_JUMP_MAX_RISE = 160;    // highest surface (above the feet) we aim for

// Previews of the item trajectories
export const PREVIEW_STEP = 1 / 60;
export const PREVIEW_MAX_STEPS = 240;

// Breakable boxes (they can be dragged by a boomerang, so they move)
export const BOX_HP = 1500;
export const BOX_RESPAWN = 20;
export const BOX_SIZE = 70;
export const BOX_HEIGHT = 70;

// Pickups dropped by boxes
export const PICKUP_RADIUS = 34;
export const PICKUP_LIFE = 30;
export const PICKUP_VERTICAL_REACH = 80;

// Colors a player can pick (StartData.color is an index into this list)
export const PLAYER_COLORS = [
	"#e63946", // red
	"#f4a261", // orange
	"#e9c46a", // yellow
	"#2a9d8f", // teal
	"#8ac926", // green
	"#9b5de5", // purple
	"#f15bb5", // pink
	"#adb5bd", // grey
];
export const PLAYER_COLOR_NAMES = [
	"Red", "Orange", "Yellow", "Teal", "Green", "Purple", "Pink", "Grey",
];

// Rendering: a perspective camera looking straight down from CAMERA_HEIGHT.
// A point at altitude z is drawn CAMERA_HEIGHT / (CAMERA_HEIGHT - z) times farther from the camera center.
export const CAMERA_HEIGHT = 1100;
export const CAMERA_SCALE = 0.9;      // screen pixels per world unit, at altitude 0
export const CAMERA_FOLLOW = 8;       // camera smoothing (1/s)
export const CAMERA_LOOK_AHEAD = 0.3; // fraction of the way toward the target the camera shifts
export const CAMERA_LOOK_MAX = 320;

// Cursor indicator (four blue triangles)
export const CURSOR_SNAP_RADIUS = 90;  // ground-plane distance under which the cursor sticks to an entity
export const CURSOR_BASE_SPEED = 600;  // vmax when the target is very close
export const CURSOR_SPEED_PER_DIST = 14; // vmax grows with the distance to the target
export const CURSOR_BASE_ACC = 4000;
export const CURSOR_ACC_PER_DIST = 120;
export const CURSOR_ROTATION = 2.2;    // rad/s
export const CURSOR_COLOR = "#3b82f6";

// Lock aim cross: offset from the target. It saturates around LOCK_MAX_OFFSET,
// then keeps growing very slowly with the mouse distance.
export const LOCK_MAX_OFFSET = 210;
export const LOCK_OFFSET_SOFTNESS = 320;
export const LOCK_FAR_GROWTH = 0.04;

// Item selection mode (after pressing I)
export const ITEM_MODE_TIMEOUT = 2.5;

// Texture paths (labels are used with the ImageLoader folder 'hunt')
export const TEXTURES = {
	'ground': "/assets/games/hunt/ground.png",
	'box': "/assets/games/hunt/box.png",
	'item-bomb': "/assets/games/hunt/items/bomb.png",
	'item-boomerang': "/assets/games/hunt/items/boomerang.png",
	'item-dash': "/assets/games/hunt/items/dash.png",
	'item-jump': "/assets/games/hunt/items/jump.png",
	'weapon-long': "/assets/games/hunt/weapons/long.png",
	'weapon-mid': "/assets/games/hunt/weapons/mid.png",
	'weapon-short': "/assets/games/hunt/weapons/short.png",
};

export const WEAPON_TEXTURES = ['weapon-long', 'weapon-mid', 'weapon-short'] as const;

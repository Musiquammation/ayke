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
export const PLAYER_SPEED = 520;
export const STEP_HEIGHT = 12;         // obstacles lower than this are walked over
export const GROUND_PROBE_RATIO = 0.6; // fraction of the radius used to find what we stand on

// Vertical motion
export const GRAVITY = 2400;
export const JUMP_VELOCITY = 690;      // apex ~ 99 units
export const MAX_FALL_SPEED = 2400;
export const SIDE_JUMP_SPEED = 980;    // horizontal speed of a jump with Q / D while locked

// Lock target kinds (Player.lockKind)
export const LOCK_NONE = 0;
export const LOCK_PLAYER = 1;
export const LOCK_BOX = 2;

// Life
export const MAX_HP = 4000;
export const REGEN_DELAY = 3;          // no damage taken and no shot for this long -> regen
export const REGEN_RATE = 0.4 * MAX_HP;  // hp per second while regenerating

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
	homing: boolean;     // while locked, bullets go to the target and follow it
	color: string;
}

export const WEAPON_LONG = 0;
export const WEAPON_MID = 1;
export const WEAPON_SHORT = 2;

export const WEAPONS: WeaponDef[] = [
	{ // 1 = long range: one big hit per cartridge
		name: "Sniper",
		drain: 0.55, cooldown: 0.6,
		speed: 2600, range: 1700, damage: 1600, radius: 10,
		count: 1, scatter: 0, homing: true,
		color: "#7ad7ff",
	},
	{ // 2 = mid range: a stream of bullets while the cartridge drains
		name: "Burst",
		drain: 0.6, cooldown: 0.09,
		speed: 1600, range: 900, damage: 420, radius: 7,
		count: 1, scatter: 0, homing: true,
		color: "#ffd166",
	},
	{ // 3 = short range: a handful of pellets converging on the target
		name: "Shotgun",
		drain: 0.45, cooldown: 0.44,
		speed: 1400, range: 420, damage: 280, radius: 9,
		count: 12, scatter: 45, homing: false,
		color: "#ff8c42",
	},
];

// Homing bullets (sniper, burst fired while locked): max turn speed, in radians per second
export const HOMING_TURN_RATE = 2.5;

// Bots: preferred distance to the target for each weapon
export const WEAPON_BOT_RANGES = [1100, 600, 250];

// Items
export const ITEM_SLOTS = 4;
export const ITEM_NONE = 0;
export const ITEM_BOMB = 1;
export const ITEM_ICE_BOMB = 2;
export const ITEM_SHELLS = 3;
export const ITEM_JUMP = 4;
// Drop chances of the boxes: every item has the same weight, the explosive bomb counts twice
export const ITEM_DROP_WEIGHTS: [item: number, weight: number][] = [
	[ITEM_BOMB, 2],
	[ITEM_ICE_BOMB, 1],
	[ITEM_SHELLS, 1],
	[ITEM_JUMP, 1],
];

export const ITEM_NAMES: Record<number, string> = {
	[ITEM_BOMB]: "Bomb",
	[ITEM_ICE_BOMB]: "Ice bomb",
	[ITEM_SHELLS]: "Shells",
	[ITEM_JUMP]: "Super jump",
};

export const ITEM_TEXTURES: Record<number, string> = {
	[ITEM_BOMB]: 'item-bomb',
	[ITEM_ICE_BOMB]: 'item-ice-bomb',
	[ITEM_SHELLS]: 'item-shells',
	[ITEM_JUMP]: 'item-jump',
};

// Colors of the item models (and fallback when a texture is missing)
export const ITEM_COLORS: Record<number, string> = {
	[ITEM_BOMB]: "#a3a3a3",
	[ITEM_ICE_BOMB]: "#7dd3fc",
	[ITEM_SHELLS]: "#22c55e",
	[ITEM_JUMP]: "#f472b6",
};

// Bomb kinds (Bomb.kind)
export const BOMB_FIRE = 0;
export const BOMB_ICE = 1;

// Bomb: thrown along an arc, explodes when it lands or touches something.
// The ice bomb follows the same arc but leaves an ice zone instead.
export const BOMB_MAX_RANGE = 1300;
export const BOMB_FLIGHT_TIME = 0.7;
export const BOMB_RADIUS = 12;
export const EXPLOSION_RADIUS = 220;
export const EXPLOSION_VERTICAL_REACH = 160;
export const EXPLOSION_DAMAGE = 1800;
export const EXPLOSION_DURATION = 0.45;
export const EXPLOSION_RAYS = 72;          // resolution of the zone hidden by walls
// Players caught in a blast (the thrower too) are thrown backward, stunned until they land
export const EXPLOSION_KNOCKBACK_SPEED = 560;
export const EXPLOSION_KNOCKBACK_VZ = 760;

// Ice zone: players standing in it are slowed, and stay slowed a bit after leaving it
export const ICE_ZONE_RADIUS = 210;
export const ICE_ZONE_DURATION = 6;
export const ICE_ZONE_VERTICAL_REACH = 40;
export const ICE_SLOW_FACTOR = 0.45;       // speed multiplier while slowed
export const ICE_SLOW_LINGER = 2;          // seconds the slow lasts after leaving the zone

// Shells: three of them, sliding on the ground and bouncing on walls.
// A shell touching a player throws it up and stuns it until it lands; two shells touching break.
export const SHELL_COUNT = 3;
export const SHELL_SPREAD = 0.28;          // angle (radians) between two shells
export const SHELL_SPEED = 950;
export const SHELL_RADIUS = 26;
export const SHELL_MAX_BOUNCES = 12;
export const SHELL_LIFE = 10;              // seconds before a shell vanishes anyway
export const SHELL_ARM_TIME = 0.25;        // the thrower and the other shells are ignored this long
export const SHELL_DAMAGE = MAX_HP / 2;
export const SHELL_KNOCKBACK_SPEED = 420;
export const SHELL_KNOCKBACK_VZ = 820;
export const SHELL_PREVIEW_LENGTH = 1400;  // distance covered by the preview of each shell

// Super jump: a leap along an arc to the aimed point
export const SUPER_JUMP_RANGE = 1150;
export const SUPER_JUMP_TIME = 0.95;
export const SUPER_JUMP_MAX_RISE = 160;    // highest surface (above the feet) we aim for

// Previews of the item trajectories
export const PREVIEW_STEP = 1 / 60;
export const PREVIEW_MAX_STEPS = 240;

// Breakable boxes
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
export const CAMERA_LOOK_AHEAD = 0.35; // fraction of the way toward the mouse the camera shifts
export const CAMERA_LOOK_MAX = 320;
export const CAMERA_LOCK_TRANSITION = 0.35; // seconds to glide between the free and the locked camera

// Cursor indicator (four blue triangles)
export const CURSOR_SNAP_RADIUS = 240; // ground-plane distance under which the cursor sticks to an entity
export const CURSOR_BASE_SPEED = 600;  // vmax when the target is very close
export const CURSOR_SPEED_PER_DIST = 14; // vmax grows with the distance to the target
export const CURSOR_BASE_ACC = 4000;
export const CURSOR_ACC_PER_DIST = 120;
export const CURSOR_ROTATION = 2.2;    // rad/s
export const CURSOR_COLOR = "#3b82f6";
export const LOCK_COLOR = "#f97316";

// The gun direction is sent to the server when it turned by more than this (radians)
export const FACING_SEND_THRESHOLD = 0.04;

// Texture paths (labels are used with the ImageLoader folder 'hunt')
export const TEXTURES = {
	'ground': "/assets/games/hunt/ground.png",
	'box': "/assets/games/hunt/box.png",
	'item-bomb': "/assets/games/hunt/items/bomb.png",
	'item-ice-bomb': "/assets/games/hunt/items/ice-bomb.png",
	'item-shells': "/assets/games/hunt/items/shells.png",
	'item-jump': "/assets/games/hunt/items/jump.png",
	'weapon-long': "/assets/games/hunt/weapons/long.png",
	'weapon-mid': "/assets/games/hunt/weapons/mid.png",
	'weapon-short': "/assets/games/hunt/weapons/short.png",
};

export const WEAPON_TEXTURES = ['weapon-long', 'weapon-mid', 'weapon-short'] as const;

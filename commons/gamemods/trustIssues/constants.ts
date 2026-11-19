/* -------------------------------------------------------------------------- */
/* Trust Issues: every tuning value of the game mode lives here.              */
/*                                                                            */
/* Units are meters and seconds. The world uses three.js axes: y is up.       */
/* -------------------------------------------------------------------------- */

// Screen (canvas) size
export const WIDTH = 2400;
export const HEIGHT = 1350;

// Match flow
export const MATCH_DURATION = 420;          // 7 minutes
export const ZONE_POINTS = [10, 5, 2];      // points of the 1st, 2nd and 3rd player reaching a zone
export const ZONE_COUNT = 5;

// Player body: a capsule. The position of a player is the center of the capsule.
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HALF_HEIGHT = 0.5;      // half height of the cylinder part of the capsule
export const PLAYER_FEET = PLAYER_HALF_HEIGHT + PLAYER_RADIUS; // center -> feet distance
export const PLAYER_SPEED = 7.5;
/** Bounce when two players bump into each other (0: they stick, 1: perfect bounce). */
export const PLAYER_BOUNCE = 0.3;
// Inertia: the horizontal speed moves toward the wanted one at these rates (m/s²)
export const GROUND_ACCEL = 62;             // speeding up / turning on the ground
export const GROUND_DECEL = 58;             // slowing down on the ground (keys released)
export const AIR_ACCEL = 30;                // steering in the air
export const AIR_DECEL = 13;                // keys released in the air: the momentum fades
/** Extra acceleration when the wanted direction is against the motion (quick turn-arounds). */
export const TURN_BOOST = 0.9;

// Vertical motion
export const GRAVITY = 26;
/** Gravity is stronger while falling: snappier, less floaty jumps. */
export const FALL_GRAVITY_FACTOR = 1.35;
/** Releasing Space while going up keeps this fraction of the upward speed (short hops). */
export const JUMP_CUT = 0.45;
export const JUMP_VELOCITY = 10;            // apex ~ 1.9 m, longest flat jump ~ 5.8 m
export const MAX_FALL_SPEED = 40;
export const COYOTE_TIME = 0.15;            // a jump is still allowed this long after leaving an edge
export const JUMP_BUFFER = 0.2;             // a jump pressed this long before landing is kept

// Explosion (E): paints the platforms around the player, then respawns him
export const PAINT_RADIUS = 6;
export const EXPLODE_COOLDOWN = 0.3;        // avoids double explosions caused by a key repeat
export const EXPLOSION_FX_TIME = 1.1;       // duration of the visual effect
export const RESPAWN_DELAY = 1;            // after exploding, time to look at what got painted before respawning
export const PAINT_DELAY = 0.12;            // the paint appears when the blast reaches the platforms

// Physics helpers
export const CONTROLLER_OFFSET = 0.02;      // gap kept by the character controller
export const GROUP_LEVEL = 0x0001;
export const GROUP_PLAYER = 0x0002;

// Network: the view direction is sent when it changed by more than this (radians)
export const YAW_SEND_THRESHOLD = 0.015;

// Client: mouse sensitivity (radians per pixel) and camera
export const MOUSE_SENSITIVITY = 0.0025;
export const PITCH_MIN = -1.35;
export const PITCH_MAX = 0.9;
export const CAMERA_DISTANCE = 6.5;
export const DEAD_CAMERA_DISTANCE = 13;    // the camera backs away while waiting to respawn
export const CAMERA_FOV = 70;

/* -------------------------------------------------------------------------- */
/* Level generation                                                           */
/* -------------------------------------------------------------------------- */

export const SPAWN_SIZE = 12;               // the spawn is a SPAWN_SIZE x SPAWN_SIZE square
export const PLATFORM_THICKNESS = 0.5;
export const ZONE_SIZE = 7;                 // goal zones are ZONE_SIZE x ZONE_SIZE squares
export const ZONE_DISTANCE_MIN = 52;        // distance from the spawn center to a zone center
export const ZONE_DISTANCE_MAX = 64;
export const ZONE_HEIGHT_MIN = -9;          // altitude of the top of a zone
export const ZONE_HEIGHT_MAX = 11;

export const PLATFORM_SIZE_MIN = 1.6;       // side of a hidden platform
export const PLATFORM_SIZE_MAX = 2.6;
export const GAP_MIN = 1.4;                 // edge to edge horizontal gap between two linked platforms
export const GAP_MAX = 2.8;
export const STEP_UP_MAX = 0.9;             // a linked platform is at most this much higher
export const STEP_DOWN_MAX = 1.6;           // ... and at most this much lower

/** Unlinked platforms keep at least this horizontal gap (nobody can jump that far). */
export const SEPARATION = 6.4;
/** ... unless the height difference is larger than this. */
export const SEPARATION_HEIGHT = 7;
/** ... or unless they are this close in the generation tree (small local loops are allowed). */
export const TREE_NEIGHBORHOOD = 3;

export const MAX_PATH_STEPS = 140;
/** A level whose shortest way to a zone needs more jumps than this is generated again. */
export const MAX_ROUTE_HOPS = 40;
export const MAX_GENERATION_ATTEMPTS = 12;
export const PLACEMENT_TRIES = 24;
export const BRANCHES_PER_PATH = 34;
export const BRANCH_LENGTH_MIN = 2;
export const BRANCH_LENGTH_MAX = 9;
/** Chance that a branch starts from another branch (rather than from the path): branches of branches. */
export const SUB_BRANCH_CHANCE = 0.5;

/** Graph used by the bots: a platform is reachable from another one when... */
export const LINK_GAP = 3.8;                // the horizontal gap is lower than this
export const LINK_UP = 1.0;                 // and the target is at most this much higher

/** Falling this far under the lowest platform respawns the player. */
export const FALL_DEPTH = 25;

/* -------------------------------------------------------------------------- */
/* Colors (4 players; colors repeat when there are more)                      */
/* -------------------------------------------------------------------------- */

export const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#facc15"];
export const PLAYER_COLOR_NAMES = ["Red", "Blue", "Green", "Yellow"];
export const ZONE_COLORS = ["#f472b6", "#a78bfa", "#2dd4bf", "#fb923c", "#38bdf8"];
export const ZONE_NAMES = ["A", "B", "C", "D", "E"];

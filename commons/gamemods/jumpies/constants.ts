/* -------------------------------------------------------------------------- */
/* Shared constants of the Jumpies game mode                                  */
/* Times are in seconds, distances in world pixels.                           */
/* -------------------------------------------------------------------------- */

// Screen
export const WIDTH = 1600;
export const HEIGHT = 900;

// Match: the first arrival starts FINISH_COOLDOWN, the limit only stops endless games.
export const LEVEL_TIME_LIMIT = 600;
export const FINISH_COOLDOWN = 30;

// Player body
export const PLAYER_SIZE = 40;
export const PLAYER_HP = 3;

// Jumps: once they are all used, each extra jump costs hit points.
export const JUMP_COUNT = 3;
export const JUMP_HP_COST = 1;
export const JUMP_VELOCITY = 1500;

// Vertical movement
export const GRAVITY = 2400;
export const FAST_FALL_SPEED = 1200; // extra downward speed while "down" is held

// Horizontal movement
export const MAX_SPEED = 1500;
export const SPEED_INC = 10800; // acceleration while a direction is held
export const SPEED_DEC = 36000; // braking when turning around or releasing the keys
export const SPEED_SLOW = 1080; // soft braking used above MAX_SPEED or after a bounce

// Death: the player is dead during (DEATH_TIME - RESPAWN_TIME) seconds, and the
// cooldown keeps running after the respawn for the end of the death transition.
export const DEATH_TIME = 1;
export const RESPAWN_TIME = 0.5;

// Collisions between players
export const PLAYER_BOUNCE = 1800; // minimal speed given to both players
export const MAX_PLAYER_BOUNCE = 3000; // keeps chained collisions under control

// Units held by a heal or restoreJump block
export const PICKUP_UNITS = 3;

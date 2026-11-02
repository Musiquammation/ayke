import { BlockDef, LevelDef } from "./defs";

// Rooms are as wide as the screen, and taller because the camera can follow vertically.
const ROOM_W = 1600;
const ROOM_H = 1200;
const LEFT = -ROOM_W / 2;
const TOP = -ROOM_H / 2;

// Players respawn with a jump of about 470 pixels: it must stay inside the room.
const SPAWN_Y = 150;
const SPAWN_DISTANCES = [80, 240, 400, 560];

/** Creates spawn points on a line, symmetrical around the middle of the first room. */
function createSpawns() {
	return SPAWN_DISTANCES.flatMap(x => [{ x: -x, y: SPAWN_Y }, { x, y: SPAWN_Y }]);
}

// Bounce blocks are the "floors" of the levels: there are no platforms in Jumpies.
const SOFT_BOUNCE = { factor: 1, cost: 0.0001 };
const STRONG_BOUNCE = { factor: 1.15, cost: 0.0004 };

const FLOOR_H = 40;

/** Creates a floor, at a position relative to the top left corner of a room. */
function floor(x: number, y: number, w: number): BlockDef {
	return { x, y, w, h: FLOOR_H, modules: { bounce: SOFT_BOUNCE } };
}

const SWITCH_LEFT = 0;
const SWITCH_RIGHT = 1;
const SWITCH_OPEN = 2;
const SWITCH_DROP = 3;

/**
 * Representation of the levels: the real rooms and blocks are created from these
 * descriptions when a game is created (see Stage).
 * Block ids are the ones used by the switch modules and the network.
 */
export const LEVELS: LevelDef[] = [
	{
		name: "Crossfire",
		spawns: createSpawns(),
		rooms: [
			// Start: a wide floor, and the way out on the right
			{
				x: LEFT, y: TOP, w: ROOM_W, h: ROOM_H,
				blocks: {
					1: floor(0, 560, 1500),
					2: { x: -500, y: -100, w: 90, h: 90, modules: { heal: { hp: 1 } } },
					3: { x: 500, y: -100, w: 90, h: 90, modules: { restoreJump: { gain: 2 } } }
				}
			},

			// Lava pit, crossed by a bar driven by the two switches
			{
				x: LEFT + ROOM_W, y: TOP, w: ROOM_W, h: ROOM_H,
				blocks: {
					10: floor(1200, 560, 500),
					11: floor(2000, 560, 500),
					12: { x: 1600, y: 560, w: 300, h: 60, modules: { lava: {} } },
					13: {
						x: 1000, y: 250, w: 240, h: 36,
						modules: {
							lava: {},
							speed: { vx: 0, vy: 0 },
							positionLimiter: { minX: 1000, maxX: 2200, minY: 250, maxY: 250 }
						},
						switchStates: {
							[SWITCH_LEFT]: { vx: 420 },
							[SWITCH_RIGHT]: { vx: -420 }
						}
					},
					14: {
						x: 900, y: -200, w: 80, h: 80,
						modules: { switch: { targets: [13], code: SWITCH_LEFT } }
					},
					15: {
						x: 2300, y: -200, w: 80, h: 80,
						modules: { switch: { targets: [13], code: SWITCH_RIGHT } }
					},
					16: { x: 1600, y: -500, w: 520, h: 40, modules: { repeatedAttack: { damages: 1, duration: 1 } } },
					17: { x: 1600, y: 0, w: 60, h: 300, modules: { continousAttack: { damagesPerSecond: 2 } } }
				}
			},

			// End: a lava gate protects the finish, a switch opens it.
			{
				x: LEFT + 2 * ROOM_W, y: TOP, w: ROOM_W, h: ROOM_H,
				blocks: {
					20: floor(3200, 560, 1500),
					21: { x: 2600, y: 0, w: 90, h: 90, modules: { restoreJump: { gain: 2 } } },
					22: {
						x: 3600, y: 0, w: 40, h: 1200,
						modules: { lava: {} },
						switchStates: { [SWITCH_OPEN]: { active: false } }
					},
					23: {
						x: 3200, y: -350, w: 80, h: 80,
						modules: { switch: { targets: [22], code: SWITCH_OPEN } }
					},
					24: { x: 3800, y: 250, w: 140, h: 140, modules: { finishLevel: {} } }
				}
			}
		]
	},

	{
		name: "Gates",
		spawns: createSpawns(),
		rooms: [
			// Start: strong bounces send players to the room above.
			{
				x: LEFT, y: TOP, w: ROOM_W, h: ROOM_H,
				blocks: {
					1: floor(0, 560, 1500),
					2: { x: 0, y: 340, w: 180, h: FLOOR_H, modules: { bounce: STRONG_BOUNCE } },
					3: { x: -600, y: -150, w: 90, h: 90, modules: { restoreJump: { gain: 2 } } }
				}
			},

			// Press: it falls down to its limit, and a switch throws it back up.
			{
				x: LEFT, y: TOP - ROOM_H, w: ROOM_W, h: ROOM_H,
				blocks: {
					10: { x: -600, y: -900, w: 90, h: 90, modules: { heal: { hp: 1 } } },
					11: { x: 600, y: -900, w: 90, h: 90, modules: { restoreJump: { gain: 2 } } },
					12: {
						x: 0, y: -1500, w: 300, h: 44,
						modules: {
							repeatedAttack: { damages: 1, duration: 0.8 },
							acceleration: { ax: 0, ay: 900 },
							positionLimiter: { minX: 0, maxX: 0, minY: -1650, maxY: -800 }
						},
						switchStates: { [SWITCH_DROP]: { vy: -1000 } }
					},
					13: {
						x: -700, y: -1400, w: 80, h: 80,
						modules: { switch: { targets: [12], code: SWITCH_DROP } }
					},
					14: {
						x: 700, y: -1400, w: 80, h: 80,
						modules: { switch: { targets: [12], code: SWITCH_DROP } }
					}
				}
			},

			// End: a slow mine crosses the way to the finish.
			{
				x: LEFT, y: TOP - 2 * ROOM_H, w: ROOM_W, h: ROOM_H,
				blocks: {
					20: {
						x: -300, y: -2200, w: 68, h: 68,
						modules: {
							lava: {},
							speed: { vx: 90, vy: 0 },
							positionLimiter: { minX: -300, maxX: 300, minY: -Infinity, maxY: Infinity }
						}
					},
					21: { x: 0, y: -2500, w: 140, h: 140, modules: { finishLevel: {} } }
				}
			}
		]
	}
];

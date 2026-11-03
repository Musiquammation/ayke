import { BlockDef, LevelDef, ModulesDef, RoomDef } from "./defs";

/*
 * Levels of JumpyJump, the single player game Jumpies comes from.
 * The numbers are the ones of the original files: JumpyJump counted in frames,
 * so the helpers below convert them to seconds. Block ids are given in order,
 * since no level uses switches.
 */

const FPS = 60;

// Players start around the origin, like in JumpyJump, spaced to avoid collisions.
const SPAWN_DISTANCES = [25, 75, 125, 175];

/** Creates spawn points on a horizontal line, symmetrical around x = 0. */
function createSpawns(y: number) {
	return SPAWN_DISTANCES.flatMap(x => [{ x: -x, y }, { x, y }]);
}

// In Infinity, spikes hang above the origin.
const INFINITY_SPAWN_Y = 100;

// JumpyJump had enemies following the players. They become hazards chasing them.
const FOLLOWER_SIZE = 40;
const FOLLOWER_SPEED = 450;
const FOLLOWER_RANGE = 500;
const FOLLOWER_ATTACK_COOLDOWN = 60;

const kill: ModulesDef = { lava: {} };
const goal: ModulesDef = { finishLevel: {} };
// Like in JumpyJump, a touched block disappears and comes back with a death:
// it holds one hit point per player, and each death gives one back.
const touchDespawn: ModulesDef = { touchDespawn: {} };

/** cost: jumps consumed per px/frame of falling speed. */
function bounce(cost: number, factor: number): ModulesDef {
	return { bounce: { factor, cost: cost / FPS } };
}

/** Hits a player, then spares them for a number of frames. */
function attack(damages: number, frames: number): ModulesDef {
	return { repeatedAttack: { damages, duration: frames / FPS } };
}

/** Hits touching players at each frame. */
function continuousAttack(damagesPerFrame: number): ModulesDef {
	return { continousAttack: { damagesPerSecond: damagesPerFrame * FPS } };
}

function heal(hp: number): ModulesDef {
	return { heal: { hp } };
}

function restoreJump(gain: number): ModulesDef {
	return { restoreJump: { gain } };
}

/** Speed in px/frame. */
function speed(vx: number, vy: number): ModulesDef {
	return { speed: { vx: vx * FPS, vy: vy * FPS } };
}

/** Acceleration in px/frame². */
function acceleration(ax: number, ay: number): ModulesDef {
	return { acceleration: { ax: ax * FPS * FPS, ay: ay * FPS * FPS } };
}

/** Speed in radians per frame. */
function rotation(start: number, speed: number): ModulesDef {
	return { rotation: { start, speed: speed * FPS } };
}

/** Brings the block back every few frames: it replaces the spawners of JumpyJump. */
function loop(frames: number): ModulesDef {
	return { loop: { period: frames / FPS } };
}

function text(value: string, size: number): ModulesDef {
	return { text: { value, size } };
}

/** A block, centered on (x, y). */
function block(x: number, y: number, w: number, h: number, ...modules: ModulesDef[]): BlockDef {
	return { x, y, w, h, modules: Object.assign({}, ...modules) };
}

/** An enemy of JumpyJump, which follows the nearest player to hit them. */
function follower(x: number, y: number, damages: number): BlockDef {
	return block(
		x, y, FOLLOWER_SIZE, FOLLOWER_SIZE,
		{ chase: { speed: FOLLOWER_SPEED, range: FOLLOWER_RANGE } },
		attack(damages, FOLLOWER_ATTACK_COOLDOWN)
	);
}

type RoomDraft = Omit<RoomDef, "blocks"> & { blocks: BlockDef[] };

/** A room, from its top left corner. */
function room(x: number, y: number, w: number, h: number, blocks: BlockDef[]): RoomDraft {
	return { x, y, w, h, blocks };
}

/** A room without block, used as a passage. */
function emptyRoom(x: number, y: number, w: number, h: number): RoomDraft {
	return room(x, y, w, h, []);
}

/**
 * Gives an id to each block of the level. Players jump higher than in JumpyJump:
 * a level can lower the spawns to keep the jump of the respawn safe.
 */
function createLevel(name: string, drafts: RoomDraft[], spawnY = 0): LevelDef {
	let nextId = 1;
	const rooms = drafts.map(({ blocks, ...rect }) => ({
		...rect,
		blocks: Object.fromEntries(blocks.map(block => [nextId++, block]))
	}));

	return { name, spawns: createSpawns(spawnY), rooms };
}

/**
 * Representation of the levels: the real rooms and blocks are created from these
 * descriptions when a game is created (see Stage).
 */
export const LEVELS: LevelDef[] = [
	createLevel("A Welcome Word", [
		room(-800, -450, 1600, 900, [
			block(0, 425, 300, 50, bounce(0.003, 1), touchDespawn),
			block(0, 350, 300, 50, bounce(0.003, 1), touchDespawn),
			block(0, 275, 300, 50, bounce(0.003, 1), touchDespawn),
			block(0, -262.5, 200, 75, text("Jump with space", 50)),
			block(-725, -125, 100, 250, speed(0, 0), acceleration(0.1, 0), text("Go to the right >>>", 50), loop(240)),
			block(650, 175, 75, 75, text(">>", 50)),
			block(650, -175, 75, 75, text(">>", 50))
		]),
		room(800, -450, 1600, 900, [
			block(1600, -125, 200, 75, text("Continue to the right", 30)),
			block(1600, -225, 200, 75, text("You can jump in the airs", 50)),
			block(2325, 175, 75, 75, text(">>", 50)),
			block(2325, -175, 75, 75, text(">>", 50))
		]),
		room(2400, -450, 1600, 900, [
			block(3200, -225, 800, 100, text("You cannot go to the white borders", 50)),
			block(3200, 225, 800, 100, text("To know where to go", 30)),
			block(3200, 312.5, 800, 75, text("Search non-white borders", 80))
		]),
		room(2400, 450, 1600, 900, [
			block(2600, 1225, 400, 50, bounce(0.003, 0.5)),
			block(3000, 1325, 400, 50, bounce(0.003, 0.5)),
			block(3400, 1225, 400, 50, bounce(0.003, 0.5)),
			block(3800, 1325, 400, 50, bounce(0.003, 0.5))
		]),
		room(4000, 450, 1600, 900, [
			block(4800, 675, 450, 100, text("Nice!", 100))
		]),
		room(5600, 450, 1600, 900, [
			block(6800, 512.5, 100, 75, text("up", 100))
		]),
		room(6400, -450, 1600, 900, [
			block(7200, 225, 100, 450, kill),
			block(7600, -225, 100, 450, kill)
		]),
		room(8000, -225, 1600, 1125, [
			block(8800, 162.5, 150, 75, text("WARN!", 100)),
			block(8800, 262.5, 550, 75, text("You only 3 jumps per room", 50)),
			block(8550, 400, 300, 100, text("it's the yellow bar", 30)),
			block(8962.5, 475, 275, 100, text("A 4th jump hits you by 1hp", 30))
		]),
		room(9600, 0, 1600, 900, [
			block(10400, 300, 350, 150, text("But changing room resets your jump bar", 50))
		]),
		emptyRoom(10400, -1350, 800, 1350),
		room(11200, -1800, 800, 900, [
			block(11600, -1350, 100, 100, heal(1.5))
		]),
		room(12000, -1800, 1600, 900, [
			block(12425, -1200, 50, 600, attack(1, 100)),
			block(12825, -1512.5, 50, 575, attack(1, 100))
		]),
		room(13600, -1800, 1600, 900, [
			block(14400, -1525, 100, 550, kill),
			block(14000, -1125, 50, 450, kill),
			block(14412.5, -1075, 775, 350, restoreJump(1)),
			block(13975, -1762.5, 450, 75, text("Take your time!", 50)),
			block(13975, -1687.5, 450, 75, text("The yellow block restores your jump bar", 30)),
			block(14825, -1125, 50, 450, kill)
		]),
		room(15200, -1800, 1600, 900, [
			block(16000, -1612.5, 800, 75, text("Congratulations!", 100)),
			block(16000, -1350, 100, 100, goal)
		])
	]),

	createLevel("Tutorial", [
		room(-800, -450, 1600, 900, [
			block(0, 412.5, 800, 75, bounce(0.003, 0.91)),
			block(-662.5, -287.5, 75, 75, kill),
			block(-562.5, -187.5, 75, 75, kill),
			block(-662.5, -87.5, 75, 75, kill),
			block(-562.5, 12.5, 75, 75, kill),
			block(575, 300, 100, 100, heal(2)),
			block(312.5, -137.5, 175, 175, restoreJump(2)),
			block(-662.5, 112.5, 75, 75, kill)
		]),
		room(800, -450, 1600, 900, [
			block(1600, 0, 800, 450, attack(1.5, 100))
		]),
		room(2000, 450, 1200, 625, [
			block(2675, 675, 250, 250, heal(12))
		]),
		room(2800, -450, 1600, 900, [
			block(3237.5, 112.5, 75, 675, kill),
			block(3962.5, -112.5, 75, 675, kill),
			block(4000, 337.5, 800, 225, restoreJump(1.7))
		]),
		room(4000, -1350, 1600, 900, [
			block(4800, -900, 400, 700, continuousAttack(0.04)),
			block(5175, -1162.5, 50, 375, attack(1, 120))
		]),
		room(5200, -2250, 1600, 900, [
			block(5425, -1500, 350, 150, heal(2))
		]),
		room(6400, -1350, 1600, 900, [
			block(7200, -900, 150, 150, goal)
		])
	]),

	createLevel("Fast climb", [
		room(-800, -450, 1600, 900, [
			block(-362.5, 37.5, 75, 75, kill),
			block(-237.5, 162.5, 75, 75, kill),
			block(-112.5, 287.5, 75, 75, kill),
			block(12.5, 400.5, 225, 75, bounce(0.001, 0.9)),
			block(-37.5, 287.5, 75, 75, heal(2), speed(0.5, 0), acceleration(0.04, 0), loop(240)),
			block(-287.5, 37.5, 75, 75, heal(2), speed(0.5, 0), acceleration(0.06, 0), loop(240)),
			block(-162.5, 163.5, 75, 75, heal(2), speed(0.5, 0), acceleration(0.05, 0), loop(240))
		]),
		room(800, -450, 4000, 900, [
			block(1625, 0, 50, 450, attack(1, 100)),
			block(2200, 425, 400, 50, bounce(0.003, 1)),
			block(3400, 0, 400, 450, restoreJump(2)),
			block(4650, -112.5, 300, 675, kill),
			block(4350, 400, 100, 100, heal(2), speed(0, -1), loop(840))
		]),
		room(4000, 450, 1600, 900, [
			block(4400, 1300, 800, 100, bounce(0.003, 0.8))
		]),
		emptyRoom(5200, 1350, 1600, 675),
		emptyRoom(6400, 0, 800, 1350),
		room(7200, -900, 800, 1350, [
			block(7250, -500, 100, 100, heal(2)),
			block(7400, 0, 400, 300, continuousAttack(0.015))
		]),
		emptyRoom(6400, -1800, 800, 1350),
		room(6800, -2700, 1600, 900, [
			block(7225, -2025, 50, 450, kill),
			block(8187.5, -2362.5, 75, 75, goal)
		])
	]),

	createLevel("Prove yourself", [
		room(-800, -450, 1600, 900, [
			block(0, 200, 100, 100, bounce(0.003, 1)),
			block(500, 200, 100, 100, bounce(0.04, 0.9))
		]),
		room(800, -650, 1600, 900, [
			block(1600, -200, 300, 300, attack(1.8, 100))
		]),
		room(2400, -450, 1600, 900, [
			block(2900, 100, 100, 700, attack(1, 100)),
			block(3200, -150, 100, 600, kill),
			block(3500, 100, 100, 700, attack(1, 100)),
			block(3200, 400, 300, 50, bounce(0.07, 0.9))
		]),
		room(4000, -450, 1600, 900, [
			block(4400, 0, 700, 800, continuousAttack(0.02)),
			block(5000, 0, 200, 200, heal(2))
		]),
		room(5600, -950, 1600, 900, [
			block(6450, -150, 500, 400, continuousAttack(0.07)),
			block(6100, -400, 100, 700, attack(1, 100)),
			block(6400, -650, 100, 600, kill),
			block(6800, -400, 100, 700, attack(1, 100)),
			block(6400, -100, 300, 50, bounce(0.07, 0.9)),
			block(6600, -500, 200, 200, restoreJump(1))
		]),
		emptyRoom(7000, -50, 700, 900),
		room(7400, -950, 1600, 900, [
			block(7900, -400, 100, 700, kill),
			block(8200, -650, 100, 600, kill),
			block(8700, -400, 100, 700, kill),
			block(8200, -100, 300, 50, bounce(0.07, 0.9)),
			block(8050, -60, 20, 20, attack(0.5, 100), speed(0, -5), touchDespawn, loop(160)),
			block(8600, 0, 50, 50, heal(0.9), speed(0, -5), loop(160))
		]),
		room(9000, -950, 1600, 900, [
			block(9800, -500, 100, 100, goal)
		])
	]),

	createLevel("Extreme climb", [
		room(-400, -450, 4800, 900, [
			block(0, 425, 450, 50, bounce(-1, 1)),
			block(425, 225, 50, 450, attack(1, 100)),
			block(1225, -225, 50, 450, attack(1, 100)),
			block(2025, 225, 50, 450, attack(1, 100)),
			block(2825, -225, 50, 450, attack(1, 100)),
			block(2250, 362.5, 300, 75, restoreJump(2)),
			block(650, 362.5, 300, 75, restoreJump(2))
		]),
		emptyRoom(4400, -7200, 400, 7650),
		room(4000, -2250, 400, 675, [
			block(4075, -1712.5, 50, 175, heal(3))
		]),
		room(4400, -8100, 3600, 900, [
			block(4825, -7425, 50, 450, kill),
			block(5400, -7875, 400, 450, kill),
			block(5975, -7425, 50, 450, bounce(0.003, 1), kill),
			block(5400, -7237.5, 500, 75, bounce(0, 0.5)),
			block(5400, -7612.5, 400, 25, restoreJump(2)),
			block(5400, -7587.5, 400, 25, heal(1)),
			block(6600, -7712.5, 400, 125, continuousAttack(0.05)),
			block(7000, -7587.5, 400, 125, continuousAttack(0.05)),
			block(7400, -7712.5, 400, 125, continuousAttack(0.05)),
			block(7400, -7250, 400, 50, bounce(0, 0.3)),
			block(6600, -7250, 400, 50, bounce(0, 0.3)),
			block(6862.5, -7362.5, 125, 325, continuousAttack(0.05)),
			block(7137.5, -7362.5, 125, 325, continuousAttack(0.05)),
			block(6600, -7937.5, 150, 325, attack(1, 100)),
			block(7400, -7937.5, 150, 325, attack(1, 100)),
			block(7000, -7362.5, 150, 325, attack(1, 100)),
			block(7537.5, -7937.5, 125, 325, continuousAttack(0.05)),
			block(7262.5, -7937.5, 125, 325, continuousAttack(0.05)),
			block(6737.5, -7937.5, 125, 325, continuousAttack(0.05)),
			block(6462.5, -7937.5, 125, 325, continuousAttack(0.05)),
			block(6600, -7300, 400, 50, restoreJump(1)),
			block(7400, -7300, 400, 50, restoreJump(1)),
			block(5400, -7287.5, 500, 25, restoreJump(1))
		]),
		room(4800, -4050, 400, 675, [
			block(5150, -3500, 50, 200, heal(3))
		]),
		room(4000, -5850, 400, 675, [
			block(4050, -5300, 50, 200, heal(3))
		]),
		room(8000, -8100, 1600, 900, [
			block(8800, -7650, 250, 150, goal)
		])
	]),

	createLevel("Infested tutorial", [
		room(-800, -450, 1600, 900, [
			block(0, 412.5, 800, 75, bounce(0.003, 0.91)),
			block(-662.5, -287.5, 75, 75, kill),
			block(-562.5, -187.5, 75, 75, kill),
			block(-662.5, -87.5, 75, 75, kill),
			block(-562.5, 12.5, 75, 75, kill),
			block(575, 300, 100, 100, heal(2)),
			block(312.5, -137.5, 175, 175, restoreJump(2)),
			block(-662.5, 112.5, 75, 75, kill)
		]),
		room(800, -450, 1600, 900, [
			block(1600, 0, 20, 20, kill),
			follower(1600, 0, 1.1),
			follower(2300, 500, 1.1)
		]),
		room(2000, 450, 1200, 625, [
			block(2675, 675, 20, 20, kill)
		]),
		room(2800, -450, 1600, 900, [
			block(3237.5, 112.5, 75, 675, kill),
			block(3962.5, -112.5, 75, 675, kill),
			block(4000, 337.5, 800, 225, restoreJump(1.7)),
			follower(4000, 400, 1.1)
		]),
		room(4000, -1350, 1600, 900, [
			block(4800, -900, 400, 700, continuousAttack(0.04)),
			block(5175, -1162.5, 50, 375, attack(1, 120))
		]),
		room(5200, -2250, 1600, 900, [
			block(5425, -1500, 350, 150, heal(1.5))
		]),
		room(6400, -1350, 1600, 900, [
			block(7200, -900, 150, 150, kill)
		]),
		emptyRoom(8000, -1350, 4000, 900),
		room(12000, -1350, 5000, 900, [
			block(16000, -900, 150, 150, goal),
			follower(14000, -900, 1.1),
			follower(14000, -850, 1.1),
			follower(14000, -800, 1.1),
			follower(14000, -750, 1.1),
			follower(14000, -700, 1.1),
			follower(14000, -650, 1.1)
		])
	]),

	createLevel("Bounce to sky", [
		room(-800, -450, 4400, 900, [
			block(1250, -112.5, 50, 675, attack(1, 100)),
			block(2050, 175, 50, 550, attack(1, 100)),
			block(2825, 112.5, 50, 675, attack(1, 100))
		]),
		room(3600, -450, 2000, 3150, [
			block(5400, 37.5, 400, 75, attack(1, 100)),
			block(5000, 2662.5, 1200, 75, bounce(0, 0.9)),
			block(5200, 500, 800, 100, attack(1, 100)),
			block(4600, 1400, 400, 100, attack(1, 100)),
			block(4375, 675, 50, 2250, kill),
			block(4837.5, 1012.5, 75, 425, attack(1, 100)),
			block(4600, 37.5, 400, 75, attack(1, 100))
		]),
		room(5600, -900, 1600, 900, [
			block(6400, -850, 175, 100, heal(1.21522))
		]),
		room(7200, -450, 4800, 900, [
			block(8025, 0, 50, 700, rotation(0, 0.03), attack(1.5, 100)),
			block(9225, 0, 50, 700, rotation(1.2, 0.03), attack(1.5, 100)),
			block(9787.5, 325, 175, 100, heal(1.522)),
			block(11575, -225, 50, 450, kill),
			block(7250, 400, 50, 50, rotation(0, 0.05), kill, speed(10, -25), acceleration(0, 0.5), loop(120)),
			block(10425, 0, 50, 700, rotation(1.2, -0.03), attack(1.5, 100)),
			block(8600, -287.5, 150, 225, restoreJump(0.918)),
			block(7600, -275, 150, 225, restoreJump(0.9)),
			block(9825, -300, 150, 225, restoreJump(0.918)),
			block(11300, -275, 350, 225, restoreJump(0.9)),
			block(8425, 200, 50, 50, rotation(0, 0.05), kill, speed(10, -25), acceleration(0, 0.5), loop(150)),
			block(10800, 0, 50, 50, rotation(0, 0.05), kill, speed(10, -10), acceleration(0, 0.5), loop(40)),
			block(11775, 225, 450, 450, bounce(0.003, 1.5)),
			block(11800, -112.5, 400, 225, restoreJump(1.3))
		]),
		room(12000, -1125, 1600, 900, [
			block(13400, -675, 400, 900, goal),
			block(12600, -775, 25, 175),
			block(12675, -850, 125, 25),
			block(12662.5, -700, 100, 25),
			block(12725, -737.5, 25, 100),
			block(12687.5, -775, 50, 25),
			block(12425, -775, 25, 175),
			block(12500, -850, 125, 25),
			block(12487.5, -700, 100, 25),
			block(12550, -737.5, 25, 100),
			block(12512.5, -775, 50, 25)
		]),
		room(11600, -1800, 400, 1350, [
			block(11887.5, -1575, 25, 225),
			block(11850, -1525, 50, 25),
			block(11862.5, -1500, 25, 25),
			block(11925, -1525, 50, 25),
			block(11912.5, -1500, 25, 25),
			block(11712.5, -1575, 25, 225),
			block(11675, -1525, 50, 25),
			block(11687.5, -1500, 25, 25),
			block(11750, -1525, 50, 25),
			block(11737.5, -1500, 25, 25),
			block(11800, -1037.5, 300, 25),
			block(11912.5, -1075, 25, 50),
			block(11937.5, -1062.5, 25, 25),
			block(11912.5, -1000, 25, 50),
			block(11937.5, -1012.5, 25, 25),
			block(11962.5, -1037.5, 25, 25)
		])
	]),

	createLevel("Infinity", [
		room(-775, -975, 1625, 1425, [
			block(37.5, 387.5, 1525, 75, bounce(0, 1.1)),
			block(-462.5, -475, 575, 50, attack(1, 100)),
			block(-37.5, -475, 225, 100, heal(1)),
			block(450, -475, 700, 50, attack(1, 100)),
			block(-587.5, -775, 25, 300),
			block(-512.5, -912.5, 125, 25),
			block(-500, -637.5, 150, 25),
			block(-437.5, -700, 25, 100),
			block(-487.5, -737.5, 75, 25),
			block(-337.5, -775, 25, 300),
			block(-250, -637.5, 150, 25),
			block(-112.5, -775, 25, 300),
			block(-50, -787.5, 100, 25),
			block(12.5, -775, 25, 300),
			block(137.5, -775, 25, 300),
			block(225, -912.5, 150, 25),
			block(225, -812.5, 150, 25),
			block(387.5, -800, 25, 250),
			block(387.5, -637.5, 25, 25)
		]),
		room(2575, -450, 2750, 900, [
			block(3437.5, 175, 75, 550, attack(1, 100)),
			block(4012.5, -112.5, 75, 675, attack(1, 100)),
			block(4475, 112.5, 100, 675, attack(1, 100)),
			block(4900, -100, 100, 675, attack(1, 100)),
			block(4012.5, 337.5, 225, 175, restoreJump(3)),
			block(4475, -325, 225, 175, restoreJump(3)),
			block(4900, 350, 175, 175, restoreJump(3)),
			block(5137.5, -150, 225, 500, restoreJump(2)),
			block(2637.5, 0, 125, 900, heal(2))
		]),
		room(5325, -3275, 750, 3275, [
			block(5700, -900, 750, 100, bounce(0.003, 1), restoreJump(3)),
			block(5700, -1150, 750, 100, restoreJump(3)),
			block(5700, -1487.5, 750, 275, restoreJump(3)),
			block(5925, -1275, 300, 150, restoreJump(3)),
			block(5700, -2125, 750, 150, restoreJump(3)),
			block(5937.5, -2550, 275, 700, restoreJump(1)),
			block(5562.5, -2625, 475, 550, restoreJump(3)),
			block(5700, -3150, 750, 250, restoreJump(3)),
			block(5700, -1025, 750, 150, attack(1, 100)),
			block(5700, -350, 750, 700, restoreJump(3)),
			block(5700, -775, 750, 150, attack(1, 100)),
			block(5550, -1275, 450, 150, attack(1, 100)),
			block(5562.5, -2275, 475, 150, attack(1, 100)),
			block(5587.5, -2962.5, 175, 125, restoreJump(3)),
			block(5875, -2962.5, 400, 125, attack(1, 100)),
			block(5412.5, -2962.5, 175, 125, attack(1, 100)),
			block(5837.5, -1925, 475, 250, restoreJump(3)),
			block(5462.5, -1837.5, 275, 425, restoreJump(3)),
			block(5837.5, -1687.5, 475, 125, restoreJump(3)),
			block(5837.5, -1775, 475, 50, attack(1, 100))
		]),
		room(5325, -3925, 2450, 650, [
			block(7050, -3400, 50, 250, kill),
			block(7337.5, -3287.5, 125, 25, kill),
			block(7700, -3287.5, 150, 25, kill),
			block(7475, -3875, 600, 100, kill),
			block(7175, -3287.5, 200, 25, kill),
			block(5700, -3600, 750, 650, heal(3)),
			block(6612.5, -3637.5, 325, 175, attack(1, 100))
		]),
		room(7300, -3275, 1100, 2175, [
			block(7675, -2750, 750, 50, kill),
			block(8225, -2750, 350, 50, continuousAttack(0.05)),
			block(7850, -2400, 1100, 650, continuousAttack(0.001)),
			block(8037.5, -2062.5, 725, 25, kill),
			block(7487.5, -2062.5, 375, 25, restoreJump(1)),
			block(7850, -1225, 1100, 250, continuousAttack(0.1))
		]),
		room(850, -450, 1725, 900, [
			block(1712.5, 387.5, 1625, 75, bounce(0, 2)),
			block(2275, -150, 75, 425, attack(1, 100)),
			block(1712.5, -412.5, 1725, 75, attack(1, 100)),
			block(1587.5, -137.5, 75, 425, attack(1, 100)),
			block(1937.5, -137.5, 75, 425, attack(1, 100))
		]),
		room(8400, -1800, 1200, 700, [
			block(8425, -1575, 50, 450, heal(2)),
			block(9000, -1225, 1200, 250, continuousAttack(0.1)),
			block(9562.5, -1575, 75, 450, goal),
			block(8812.5, -1475, 125, 250, continuousAttack(0.05)),
			block(9237.5, -1675, 125, 250, continuousAttack(0.05))
		])
	], INFINITY_SPAWN_Y)
];

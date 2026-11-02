/* -------------------------------------------------------------------------- */
/* Static descriptions of the levels. Nothing here is ever sent on the network */
/* -------------------------------------------------------------------------- */

/** Gives hit points to a player who enters the block (one block unit per entry). */
export interface HealDef {
	hp: number;
}

/** Gives jumps to a player who enters the block (one block unit per entry). */
export interface RestoreJumpDef {
	gain: number;
}

/** Kills every player touching the block. */
export type LavaDef = Record<string, never>;

/** Hits a touching player, then spares this player for `duration` seconds. */
export interface RepeatedAttackDef {
	damages: number;
	duration: number;
}

/** Hits touching players continuously. */
export interface ContinousAttackDef {
	damagesPerSecond: number;
}

/** Calls switch(code) on the target blocks when a player enters the block. */
export interface SwitchDef {
	targets: number[]; // ids of blocks of the same level
	code: number;
}

/** Sends falling players back up. */
export interface BounceDef {
	factor: number; // ratio between the speed after and before the bounce
	cost: number; // jumps consumed per px/s of falling speed
}

/** Initial speed of the block. */
export interface SpeedDef {
	vx: number;
	vy: number;
}

/** Constant acceleration of the block. */
export interface AccelerationDef {
	ax: number;
	ay: number;
}

/** Rectangle the block must stay in. Bounds can be +/-Infinity. */
export interface PositionLimiterDef {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

/** Ends the level for the players entering the block. */
export type FinishLevelDef = Record<string, never>;

/** A block has at most one module of each kind. */
export interface ModulesDef {
	heal?: HealDef;
	restoreJump?: RestoreJumpDef;
	lava?: LavaDef;
	repeatedAttack?: RepeatedAttackDef;
	continousAttack?: ContinousAttackDef;
	switch?: SwitchDef;
	bounce?: BounceDef;
	speed?: SpeedDef;
	acceleration?: AccelerationDef;
	positionLimiter?: PositionLimiterDef;
	finishLevel?: FinishLevelDef;
}

/** What a block becomes when it receives a switch code. Omitted fields do not change. */
export interface SwitchStateDef {
	active?: boolean; // an inactive block is not touched by players
	vx?: number;
	vy?: number;
}

export interface BlockDef {
	x: number; // center
	y: number; // center
	w: number;
	h: number;
	modules: ModulesDef;
	active?: boolean; // initial state, true by default
	switchStates?: Record<number, SwitchStateDef>; // switch code -> new state
}

/**
 * A room of the level. Rooms sharing a border are connected. On a border
 * without neighbor, a player leaving the room is killed.
 * Block ids are unique in the whole level, not only in their room.
 */
export interface RoomDef {
	x: number; // left
	y: number; // top
	w: number;
	h: number;
	blocks: Record<number, BlockDef>;
}

export interface LevelDef {
	name: string;
	spawns: { x: number; y: number }[]; // all in the same room
	rooms: RoomDef[];
}

/* -------------------------------------------------------------------------- */
/* Collision groups and vertical spans, shared by the entities and physics.   */
/* -------------------------------------------------------------------------- */

/**
 * Collision groups: membership in the high 16 bits, filter in the low 16 bits.
 * Colliders accept every query (filter = ALL); queries choose what they look for.
 * Colliders never touch each other since there is no dynamic body.
 */
export const GROUP_STATIC = 0x0001;
export const GROUP_PLAYER = 0x0002;
export const ALL = 0xffff;

/** Build the interaction groups value for Rapier. */
export function groups(membership: number, filter: number) {
	return ((membership << 16) | filter) >>> 0; // unsigned 32-bit value
}

/** Vertical extent [base, top] of something on the map. */
export interface Span {
	base: number;
	top: number;
}

/** True when the vertical spans [a0, a1] and [b0, b1] overlap. */
export function spansOverlap(a0: number, a1: number, b0: number, b1: number) {
	return a0 < b1 && b0 < a1;
}

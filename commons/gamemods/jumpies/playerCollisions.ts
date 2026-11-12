import { MAX_PLAYER_BOUNCE, PLAYER_BOUNCE, PLAYER_PUSH_SPEED, PLAYER_RESTITUTION, PLAYER_SIZE } from "./constants";
import type { Player } from "./Player";

type Axis = 'x' | 'y';

/** Direction from a to b. Stacked players are separated according to their order. */
function axisSign(delta: number) {
	return delta < 0 ? -1 : 1;
}

/**
 * Separates two overlapping players on one axis, and makes them bounce if they
 * were moving toward each other. The separation is progressive: a player who
 * respawns on another one slides out instead of being teleported. Like a collision between equal masses, the
 * shared speed is kept and only the relative speed changes: the bounce only
 * depends on how hard they hit each other, and stays within bounds.
 * Returns whether the speeds changed.
 */
function bounceOnAxis(a: Player, b: Player, axis: Axis, overlap: number, dt: number) {
	const v = axis === 'x' ? 'vx' : 'vy';
	const sign = axisSign(b[axis] - a[axis]);
	const push = Math.min(overlap, PLAYER_PUSH_SPEED * dt) / 2;

	a[axis] -= sign * push;
	b[axis] += sign * push;

	// Players already moving apart only need to be separated.
	const approach = (a[v] - b[v]) * sign;
	if (approach <= 0)
		return false;

	const mean = (a[v] + b[v]) / 2;
	const separation = Math.min(MAX_PLAYER_BOUNCE, Math.max(PLAYER_BOUNCE, approach * PLAYER_RESTITUTION));
	a[v] = mean - sign * separation / 2;
	b[v] = mean + sign * separation / 2;
	return true;
}

/**
 * Resolves the collisions between players, the only solid collisions of the game.
 * Players are separated on the axis where they overlap the least.
 */
export function resolvePlayerCollisions(players: Player[], dt: number) {
	for (let i = 0; i < players.length; i++) {
		const a = players[i];
		if (!a.isInGame())
			continue;

		for (let j = i + 1; j < players.length; j++) {
			const b = players[j];
			if (!b.isInGame())
				continue;

			const overlapX = PLAYER_SIZE - Math.abs(b.x - a.x);
			const overlapY = PLAYER_SIZE - Math.abs(b.y - a.y);
			if (overlapX <= 0 || overlapY <= 0)
				continue;

			const axis: Axis = overlapX < overlapY ? 'x' : 'y';
			const bounced = bounceOnAxis(a, b, axis, axis === 'x' ? overlapX : overlapY, dt);

			// A side bounce keeps its momentum instead of being braked at once.
			if (bounced && axis === 'x') {
				a.useDefaultDeceleration = false;
				b.useDefaultDeceleration = false;
			}
		}
	}
}

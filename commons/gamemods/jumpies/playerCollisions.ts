import { MAX_PLAYER_BOUNCE, PLAYER_BOUNCE, PLAYER_SIZE } from "./constants";
import type { Player } from "./Player";

/** Computes the speed given to both players, from their relative speed on the axis. */
function bounceSpeed(relativeSpeed: number) {
	return Math.min(MAX_PLAYER_BOUNCE, Math.max(PLAYER_BOUNCE, Math.abs(relativeSpeed)));
}

/** Direction from a to b. Stacked players are separated according to their order. */
function axisSign(delta: number) {
	return delta < 0 ? -1 : 1;
}

/** Pushes two overlapping players apart on the x axis, with a big bounce. */
function bounceOnX(a: Player, b: Player, overlap: number) {
	const sign = axisSign(b.x - a.x);
	const speed = bounceSpeed(b.vx - a.vx);

	a.x -= sign * overlap / 2;
	b.x += sign * overlap / 2;
	a.vx = -sign * speed;
	b.vx = sign * speed;
}

/** Pushes two overlapping players apart on the y axis, with a big bounce. */
function bounceOnY(a: Player, b: Player, overlap: number) {
	const sign = axisSign(b.y - a.y);
	const speed = bounceSpeed(b.vy - a.vy);

	a.y -= sign * overlap / 2;
	b.y += sign * overlap / 2;
	a.vy = -sign * speed;
	b.vy = sign * speed;
}

/**
 * Resolves the collisions between players, the only solid collisions of the game.
 * Players are separated on the axis where they overlap the least.
 */
export function resolvePlayerCollisions(players: Player[]) {
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

			if (overlapX < overlapY) {
				bounceOnX(a, b, overlapX);
			} else {
				bounceOnY(a, b, overlapY);
			}

			// Let both players keep the momentum of the bounce.
			a.useDefaultDeceleration = false;
			b.useDefaultDeceleration = false;
		}
	}
}

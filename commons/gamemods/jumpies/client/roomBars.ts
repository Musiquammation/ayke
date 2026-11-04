import type { Player } from "../Player";
import type { AdjacenceRect, Room } from "../Room";

const MAX_RANGE = 400;
const MIN_RANGE = 70;
const FAR_COLOR = [255, 255, 255]; // white
const NEAR_COLOR = [247, 112, 34]; // orange

interface RankedRect {
	rect: AdjacenceRect;
	factor: number; // 0 when the player is far, 1 when they are close
}

/** Distance between the player and the closest point of a bar. */
function getDistance(rect: AdjacenceRect, player: Player) {
	const box = player.getRect();
	const dx = Math.abs(rect.x + rect.w / 2 - box.x) - (rect.w + box.w) / 2;
	const dy = Math.abs(rect.y + rect.h / 2 - box.y) - (rect.h + box.h) / 2;
	return Math.hypot(Math.max(0, dx), Math.max(0, dy));
}

/** Draws the far bars in white, and collects the ones which must change color. */
function drawFarRects(
	ctx: CanvasRenderingContext2D,
	room: Room,
	player: Player,
	ranks: RankedRect[]
) {
	for (const rect of room.adjacenceRects) {
		const distance = getDistance(rect, player);
		if (distance > MAX_RANGE) {
			ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
		} else if (distance > MIN_RANGE) {
			ranks.push({ rect, factor: 1 - (distance - MIN_RANGE) / (MAX_RANGE - MIN_RANGE) });
		} else {
			ranks.push({ rect, factor: 1 });
		}
	}
}

/** Mixes white and orange. */
function getColor(factor: number) {
	const [r, g, b] = FAR_COLOR.map(
		(start, i) => Math.round(start + (NEAR_COLOR[i] - start) * factor)
	);

	return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Draws the bars on the borders of the rooms, where leaving means dying.
 * White when the player is far, they get orange as the player comes closer.
 */
export function drawAdjacenceRects(ctx: CanvasRenderingContext2D, room: Room, player: Player) {
	const ranks: RankedRect[] = [];

	ctx.fillStyle = "white";
	drawFarRects(ctx, room, player, ranks);
	for (const adjacent of room.adjacentRooms) {
		drawFarRects(ctx, adjacent, player, ranks);
	}

	ranks.sort((a, b) => a.factor - b.factor);

	for (const { rect, factor } of ranks) {
		ctx.fillStyle = getColor(factor);
		ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
	}
}

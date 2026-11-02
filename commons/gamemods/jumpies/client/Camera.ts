import { HEIGHT, WIDTH } from "../constants";
import type { Room } from "../Room";

const FRAMES_PER_SECOND = 60;
const TRANSITION_DURATION = 25; // frames
const VISION_RATIO_INIT = 1.2;
const VISION_RATIO_MIN = 0;
const VISION_RATIO_DECAY = 10; // frames
const MIN_VISION_LIMIT = 1; // pixels

interface Point {
	x: number;
	y: number;
}

/** Computes the target of one axis: centered in a small room, else following the player. */
function getAxisTarget(player: number, start: number, length: number, screen: number) {
	if (length <= screen)
		return start + length / 2;

	if (player - screen / 2 <= start)
		return start + screen / 2;

	if (player + screen / 2 >= start + length)
		return start + length - screen / 2;

	return player;
}

/** Returns where the camera should look when a player is at a position of a room. */
export function getRoomTarget(px: number, py: number, room: Room): Point {
	return {
		x: getAxisTarget(px, room.x, room.w, WIDTH),
		y: getAxisTarget(py, room.y, room.h, HEIGHT)
	};
}

/**
 * Client-only camera. It sticks to its target, except during the transition
 * started by a change of room: it then travels at a constant speed while the
 * vision limit brings it closer and closer to the player and the target.
 */
export class Camera {
	x = 0;
	y = 0;

	private time = 0; // frames since the start of the transition
	private targetX = 0;
	private targetY = 0;
	private instant = true;
	private speed = 0; // pixels per frame

	/** Changes the target, keeping the transition if there is one. */
	move(x: number, y: number) {
		this.targetX = x;
		this.targetY = y;
	}

	/** Jumps on a position, cancelling the transition. */
	teleport(x: number, y: number) {
		this.x = x;
		this.y = y;
		this.targetX = x;
		this.targetY = y;
		this.instant = true;
	}

	/** Starts a transition which reaches the target in TRANSITION_DURATION frames. */
	startTracker(targetX: number, targetY: number) {
		const dx = targetX - this.x;
		const dy = targetY - this.y;

		this.targetX = targetX;
		this.targetY = targetY;
		this.instant = false;
		this.time = 0;
		this.speed = Math.sqrt(dx * dx + dy * dy) / TRANSITION_DURATION;
	}

	/** Maximal distance to the player and the target, decreasing during the transition. */
	private getVisionRatio(time: number) {
		const factor = Math.exp(-time / VISION_RATIO_DECAY);
		return VISION_RATIO_MIN + (VISION_RATIO_INIT - VISION_RATIO_MIN) * factor;
	}

	/** Moves the camera. */
	update(player: Point, dt: number) {
		if (this.instant) {
			this.x = this.targetX;
			this.y = this.targetY;
			return;
		}

		const frames = dt * FRAMES_PER_SECOND;
		const visionRatio = this.getVisionRatio(this.time);
		this.time += frames;

		const dx = this.targetX - this.x;
		const dy = this.targetY - this.y;
		const dist2 = dx * dx + dy * dy;
		const step = this.speed * frames;

		if (dist2 <= step * step) {
			this.x = this.targetX;
			this.y = this.targetY;
			this.instant = true;
			return;
		}

		const norm = step / Math.sqrt(dist2);
		this.x += dx * norm;
		this.y += dy * norm;

		const limit = visionRatio * HEIGHT;
		this.limitX(player, limit);
		this.limitY(player, limit);

		// A moving target can escape a slow transition: the limit ends it instead.
		if (limit < MIN_VISION_LIMIT) {
			this.instant = true;
		}
	}

	/** Keeps the x axis within the vision limit. */
	private limitX(player: Point, limit: number) {
		const targetDelta = this.x - this.targetX;
		const playerDelta = this.x - player.x;

		if (playerDelta <= targetDelta && targetDelta <= -limit) {
			this.x = this.targetX - limit;
		} else if (targetDelta <= playerDelta && playerDelta <= -limit) {
			this.x = player.x - limit;
		}

		if (playerDelta >= targetDelta && targetDelta >= limit) {
			this.x = player.x + limit;
		} else if (targetDelta >= playerDelta && playerDelta >= limit) {
			this.x = this.targetX + limit;
		}
	}

	/** Keeps the y axis within the vision limit. */
	private limitY(player: Point, limit: number) {
		const targetDelta = this.y - this.targetY;
		const playerDelta = this.y - player.y;

		if (playerDelta <= targetDelta && targetDelta <= -limit) {
			this.y = this.targetY - limit;
		} else if (targetDelta <= playerDelta && playerDelta <= -limit) {
			this.y = player.y - limit;
		}

		if (playerDelta >= targetDelta && targetDelta >= limit) {
			this.y = player.y + limit;
		} else if (targetDelta >= playerDelta && playerDelta >= limit) {
			this.y = this.targetY + limit;
		}
	}
}

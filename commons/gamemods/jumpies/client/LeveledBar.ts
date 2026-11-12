const FAST_DURATION = 0.17; // seconds
const SLOW_DURATION = 1; // seconds
const BORDER_WIDTH = 2;
const SEPARATOR_WIDTH = 2;

export interface LeveledBarStyle {
	orientation: "vertical" | "horizontal";
	x: number;
	y: number;
	w: number;
	h: number;
	sections: string[]; // one color per level
	animColor: string; // color of the part of the bar being animated
	borderColor: string;
}

/** Cubic ease-out. */
function ease(t: number) {
	return 1 - Math.pow(1 - t, 3);
}

/**
 * Client-only bar split in sections.
 * The main value and a second "trail" value follow the ratio at different speeds,
 * which leaves a visible trace of what has just been lost or gained.
 */
export class LeveledBar {
	private value = 1; // shown by the colored sections
	private trail = 1; // the other end of the animated part
	private target = 1;
	private startValue = 1;
	private time = -1; // negative when no animation runs
	private rising = false;

	constructor(private readonly style: LeveledBarStyle) {}

	/** Sets the ratio to show, between 0 and 1. */
	setRatio(ratio: number) {
		ratio = Math.max(0, Math.min(1, ratio));
		if (ratio === this.target)
			return;

		this.target = ratio;
		this.startValue = this.value;
		this.trail = this.value;
		this.rising = ratio > this.value;
		this.time = 0;
	}

	/** Runs the animations. */
	update(dt: number) {
		if (this.time < 0)
			return;

		this.time += dt;
		const delta = this.target - this.startValue;
		const fast = this.startValue + delta * ease(Math.min(1, this.time / FAST_DURATION));
		const slow = this.startValue + delta * ease(Math.min(1, this.time / SLOW_DURATION));

		this.value = this.rising ? slow : fast;
		this.trail = this.rising ? fast : slow;

		if (this.time >= SLOW_DURATION) {
			this.value = this.target;
			this.trail = this.target;
			this.time = -1;
		}
	}

	/** Returns the rectangle of the bar between two ratios. */
	private getSlice(from: number, to: number) {
		const { orientation, x, y, w, h } = this.style;
		const innerX = x + BORDER_WIDTH;
		const innerY = y + BORDER_WIDTH;
		const innerW = w - 2 * BORDER_WIDTH;
		const innerH = h - 2 * BORDER_WIDTH;

		if (orientation === "horizontal")
			return { x: innerX + innerW * from, y: innerY, w: innerW * (to - from), h: innerH };

		// Vertical bars fill from the bottom to the top.
		return { x: innerX, y: innerY + innerH * (1 - to), w: innerW, h: innerH * (to - from) };
	}

	/** Draws the colored sections, up to the current value. */
	private drawSections(ctx: CanvasRenderingContext2D) {
		const { sections, orientation } = this.style;
		for (const [i, color] of sections.entries()) {
			const from = i / sections.length;
			const to = (i + 1) / sections.length;

			if (this.value > from) {
				const slice = this.getSlice(from, Math.min(to, this.value));
				ctx.fillStyle = color;
				ctx.fillRect(slice.x, slice.y, slice.w, slice.h);
			}

			// Black separator between two filled sections
			if (i < sections.length - 1 && this.value > to) {
				const line = this.getSlice(to, to);
				ctx.fillStyle = "black";
				if (orientation === "horizontal") {
					ctx.fillRect(line.x - SEPARATOR_WIDTH / 2, line.y, SEPARATOR_WIDTH, line.h);
				} else {
					ctx.fillRect(line.x, line.y - SEPARATOR_WIDTH / 2, line.w, SEPARATOR_WIDTH);
				}
			}
		}
	}

	draw(ctx: CanvasRenderingContext2D) {
		this.drawSections(ctx);

		if (this.time >= 0) {
			const slice = this.getSlice(Math.min(this.value, this.trail), Math.max(this.value, this.trail));
			ctx.fillStyle = this.style.animColor;
			ctx.fillRect(slice.x, slice.y, slice.w, slice.h);
		}

		const { x, y, w, h, borderColor } = this.style;
		ctx.strokeStyle = borderColor;
		ctx.lineWidth = BORDER_WIDTH;
		ctx.strokeRect(x, y, w, h);
	}
}

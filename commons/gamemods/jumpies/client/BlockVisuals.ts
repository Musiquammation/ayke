import type { Block } from "../Block";
import { TextDef } from "../defs";
import { CooldownsTracker, DespawnHpTracker, HealUnitsTracker, RestoreJumpUnitsTracker } from "../trackers";
import { ParticleField } from "./ParticleField";

const SPIKE_SIZE = 32;
const SPIKE_LENGTH = 26;
const ARROW_SPACING = 30;
const UNIT_RADIUS = 6;
const UNIT_GAP = 18;
const INACTIVE_ALPHA = 0.18;
const TEXT_PADDING = 5;

/** Client-only drawing of a block, around (0, 0). Created once per block. */
export interface BlockVisual {
	draw(ctx: CanvasRenderingContext2D, block: Block, playerIdx: number, dt: number): void;
}

/** Fills the shape of the block. */
function fillBlock(ctx: CanvasRenderingContext2D, block: Block, color: string | CanvasGradient) {
	ctx.fillStyle = color;
	ctx.fillRect(-block.w / 2, -block.h / 2, block.w, block.h);
}

/** Fills the block with a glow around it. */
function glowBlock(ctx: CanvasRenderingContext2D, block: Block, color: string, glow: string, blur: number) {
	ctx.save();
	ctx.shadowColor = glow;
	ctx.shadowBlur = blur;
	fillBlock(ctx, block, color);
	ctx.restore();
}

/** Shows the units left in a pickup, as dots above the block. */
function drawUnits(ctx: CanvasRenderingContext2D, block: Block, units: number, max: number, color: string) {
	const y = -block.h / 2 - 16;
	for (let i = 0; i < max; i++) {
		ctx.fillStyle = i < units ? color : "rgba(255, 255, 255, 0.2)";
		ctx.beginPath();
		ctx.arc((i - (max - 1) / 2) * UNIT_GAP, y, UNIT_RADIUS, 0, Math.PI * 2);
		ctx.fill();
	}
}

class DefaultVisual implements BlockVisual {
	draw(ctx: CanvasRenderingContext2D, block: Block) {
		fillBlock(ctx, block, "#555");
	}
}

class LavaVisual implements BlockVisual {
	private readonly bubbles = new ParticleField('bubble', a => `rgba(255, 170, 40, ${a})`);

	draw(ctx: CanvasRenderingContext2D, block: Block, _playerIdx: number, dt: number) {
		glowBlock(ctx, block, "red", "rgba(255, 0, 0, 0.8)", 20);
		this.bubbles.update(block.w, block.h, dt);
		this.bubbles.draw(ctx);
	}
}

class HealVisual implements BlockVisual {
	private readonly crosses = new ParticleField('plus', a => `rgba(176, 255, 176, ${a})`);
	private pulse = 0;

	draw(ctx: CanvasRenderingContext2D, block: Block, _playerIdx: number, dt: number) {
		const tracker = block.peek(HealUnitsTracker);
		const units = tracker?.units ?? 0;
		const usable = units > 0;

		this.pulse += dt * 2.4;
		const blur = usable ? 30 + Math.sin(this.pulse) * 5 : 3;
		glowBlock(ctx, block, usable ? "rgb(50, 150, 50)" : "rgb(30, 100, 30)", "rgba(100, 255, 100, 0.8)", blur);

		this.crosses.update(block.w, block.h, dt, usable);
		this.crosses.draw(ctx);
		drawUnits(ctx, block, units, tracker?.max ?? 0, "#7dff7d");
	}
}

class RestoreJumpVisual implements BlockVisual {
	private readonly sparks = new ParticleField('diamond', a => `rgba(255, 235, 120, ${a})`);

	draw(ctx: CanvasRenderingContext2D, block: Block, _playerIdx: number, dt: number) {
		const tracker = block.peek(RestoreJumpUnitsTracker);
		const units = tracker?.units ?? 0;
		const usable = units > 0;

		glowBlock(
			ctx, block,
			usable ? "rgba(255, 220, 0, 0.6)" : "rgba(130, 115, 30, 0.6)",
			"rgba(255, 230, 100, 0.9)", usable ? 15 : 3
		);

		this.sparks.update(block.w, block.h, dt, usable);
		this.sparks.draw(ctx);
		drawUnits(ctx, block, units, tracker?.max ?? 0, "#ffe066");
	}
}

type Point = [number, number];

/** Point at `ratio` of the way from a to b. */
function lerpPoint([ax, ay]: Point, [bx, by]: Point, ratio: number): Point {
	return [ax + (bx - ax) * ratio, ay + (by - ay) * ratio];
}

/** Traces a closed polygon. */
function tracePolygon(ctx: CanvasRenderingContext2D, points: Point[]) {
	ctx.beginPath();
	ctx.moveTo(...points[0]);
	for (const point of points.slice(1)) {
		ctx.lineTo(...point);
	}
	ctx.closePath();
}

/**
 * Draws a spike, filled from its base toward its tip according to how
 * ready the attack is (0: just hit, 1: ready).
 */
function drawSpike(ctx: CanvasRenderingContext2D, baseL: Point, baseR: Point, tip: Point, completion: number) {
	// Background
	tracePolygon(ctx, [baseL, tip, baseR]);
	ctx.fillStyle = "#dec5ff";
	ctx.fill();

	// Charged part: the base, cut parallel to it
	if (completion > 0) {
		tracePolygon(ctx, [baseL, lerpPoint(baseL, tip, completion), lerpPoint(baseR, tip, completion), baseR]);
		ctx.fillStyle = "#882dff";
		ctx.fill();
	}

	// Outline, drawn last to stay visible over the charged part
	tracePolygon(ctx, [baseL, tip, baseR]);
	ctx.strokeStyle = "#FFEEAA";
	ctx.lineWidth = 1.1;
	ctx.stroke();
}

class RepeatedAttackVisual implements BlockVisual {
	/** Places spikes along one side of a square block. */
	private drawSide(
		ctx: CanvasRenderingContext2D,
		block: Block,
		nx: number, ny: number,
		completion: number
	) {
		const length = nx === 0 ? block.w : block.h;
		const count = Math.max(1, Math.ceil(length / SPIKE_SIZE));
		const width = length / count;

		// Half of the base, along the side
		const tangentX = -ny * width / 2;
		const tangentY = nx * width / 2;

		for (let i = 0; i < count; i++) {
			const along = -length / 2 + (i + 0.5) * width;
			const baseX = nx === 0 ? along : nx * block.w / 2;
			const baseY = ny === 0 ? along : ny * block.h / 2;

			drawSpike(
				ctx,
				[baseX + tangentX, baseY + tangentY],
				[baseX - tangentX, baseY - tangentY],
				[baseX + nx * SPIKE_LENGTH, baseY + ny * SPIKE_LENGTH],
				completion
			);
		}
	}

	draw(ctx: CanvasRenderingContext2D, block: Block, playerIdx: number) {
		// Spikes empty when the current player has just been hit, then refill.
		const remaining = block.peek(CooldownsTracker)?.values.get(playerIdx);
		const duration = block.def.modules.repeatedAttack?.duration ?? 1;
		const completion = remaining === undefined ? 1 : 1 - remaining / duration;

		fillBlock(ctx, block, "#9B59B6");

		this.drawSide(ctx, block, 0, -1, completion);
		this.drawSide(ctx, block, 0, 1, completion);
		this.drawSide(ctx, block, -1, 0, completion);
		this.drawSide(ctx, block, 1, 0, completion);
	}
}

class ContinousAttackVisual implements BlockVisual {
	private readonly sparks = new ParticleField('diamond', a => `rgba(255, 190, 255, ${a})`);

	draw(ctx: CanvasRenderingContext2D, block: Block, _playerIdx: number, dt: number) {
		glowBlock(ctx, block, "rgb(212, 0, 255)", "rgb(111, 0, 255)", 50);
		this.sparks.update(block.w, block.h, dt);
		this.sparks.draw(ctx);
	}
}

class BounceVisual implements BlockVisual {
	private time = 0;
	private offset = 0;

	/** Draws a hollow arrow pointing up. */
	private drawArrow(ctx: CanvasRenderingContext2D, y: number, width: number, height: number) {
		ctx.beginPath();
		ctx.moveTo(-width / 2, y + height / 2);
		ctx.lineTo(0, y - height / 2);
		ctx.lineTo(width / 2, y + height / 2);
		ctx.stroke();
	}

	draw(ctx: CanvasRenderingContext2D, block: Block, _playerIdx: number, dt: number) {
		ctx.save();
		ctx.shadowColor = "rgba(255, 220, 100, 0.9)";
		ctx.shadowBlur = 35;
		const gradient = ctx.createLinearGradient(-block.w / 2, -block.h / 2, block.w / 2, block.h / 2);
		gradient.addColorStop(0, "#FFE066");
		gradient.addColorStop(1, "#FFAA00");
		fillBlock(ctx, block, gradient);
		ctx.restore();

		// Arrows rise in waves and wrap around the height of the block.
		this.time += dt * 6;
		this.offset = (this.offset + Math.max(18, Math.sin(this.time / 2) * 180) * dt) % block.h;

		const count = Math.max(1, Math.ceil(block.h / ARROW_SPACING));
		ctx.strokeStyle = "#FFFF80";
		ctx.lineWidth = 3;
		for (let i = 0; i < count; i++) {
			const position = (this.offset + i * block.h / count) % block.h;
			this.drawArrow(ctx, block.h / 2 - position, Math.min(block.w * 0.6, 60), 16);
		}
	}
}

class FinishVisual implements BlockVisual {
	private time = 0;

	draw(ctx: CanvasRenderingContext2D, block: Block, _playerIdx: number, dt: number) {
		this.time += dt;
		const glow = Math.sin(this.time * 2.4);
		const green = Math.floor(185 + 15 * glow);

		// Stack several blurs to get the intense halo of the level end.
		for (const blur of [100, 70, 40]) {
			glowBlock(ctx, block, `rgb(0, ${green}, 255)`, "rgba(0, 200, 255, 0.9)", blur + 15 * glow);
		}

		ctx.lineWidth = 2;
		ctx.strokeStyle = "rgba(0, 150, 255, 0.8)";
		ctx.strokeRect(-block.w / 2, -block.h / 2, block.w, block.h);
	}
}

class SwitchVisual implements BlockVisual {
	draw(ctx: CanvasRenderingContext2D, block: Block) {
		glowBlock(ctx, block, "#2c6fbb", "rgba(90, 170, 255, 0.9)", 18);

		const size = Math.min(block.w, block.h) * 0.25;
		ctx.fillStyle = "#cfe6ff";
		ctx.fillRect(-size / 2, -size / 2, size, size);
	}
}

/** Writes a text on a black background, like a sign. */
class TextVisual implements BlockVisual {
	constructor(private readonly text: TextDef) {}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.font = `${this.text.size}px monospace`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		const metrics = ctx.measureText(this.text.value);
		const width = metrics.width + TEXT_PADDING * 2;
		const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + TEXT_PADDING * 2;

		ctx.fillStyle = "black";
		ctx.fillRect(-width / 2, -height / 2, width, height);
		ctx.fillStyle = "white";
		ctx.fillText(this.text.value, 0, 0);
	}
}

/** Hit points of a block which disappears when touched, as dots like the units of a pickup. */
class DespawnHpVisual {
	draw(ctx: CanvasRenderingContext2D, block: Block) {
		const tracker = block.peek(DespawnHpTracker);
		if (tracker) {
			drawUnits(ctx, block, tracker.units, tracker.max, "#ff5577");
		}
	}
}

/**
 * Picks the look of the block: the most important module gives its visual.
 * A block with only a text has no shape, its text is enough.
 */
function createModuleVisual({ def: { modules } }: Block): BlockVisual | null {
	if (modules.finishLevel) return new FinishVisual();
	if (modules.lava) return new LavaVisual();
	if (modules.heal) return new HealVisual();
	if (modules.repeatedAttack) return new RepeatedAttackVisual();
	if (modules.continousAttack) return new ContinousAttackVisual();
	if (modules.restoreJump) return new RestoreJumpVisual();
	if (modules.switch) return new SwitchVisual();
	if (modules.bounce) return new BounceVisual();
	if (modules.text) return null;
	return new DefaultVisual();
}

/** Client data of a block: everything needed to draw it, and nothing shared. */
export class BlockClientData {
	private readonly visual: BlockVisual | null;
	private readonly text: TextVisual | null;
	private readonly hp: DespawnHpVisual | null;

	constructor(block: Block) {
		this.visual = createModuleVisual(block);
		const { text, touchDespawn } = block.def.modules;
		this.text = text ? new TextVisual(text) : null;
		this.hp = touchDespawn ? new DespawnHpVisual() : null;
	}

	/** Draws the block at its position. Inactive blocks are only ghosts. */
	draw(ctx: CanvasRenderingContext2D, block: Block, playerIdx: number, dt: number) {
		ctx.save();
		ctx.translate(block.x, block.y);
		if (!block.isActive()) {
			ctx.globalAlpha = INACTIVE_ALPHA;
		}

		ctx.save();
		ctx.rotate(block.getAngle());
		this.visual?.draw(ctx, block, playerIdx, dt);
		ctx.restore();

		this.text?.draw(ctx);
		this.hp?.draw(ctx, block);
		ctx.restore();
	}
}

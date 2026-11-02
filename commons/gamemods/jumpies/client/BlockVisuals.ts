import type { Block } from "../Block";
import { PICKUP_UNITS } from "../constants";
import { CooldownsTracker, HealUnitsTracker, RestoreJumpUnitsTracker } from "../trackers";
import { ParticleField } from "./ParticleField";

const SPIKE_SIZE = 32;
const SPIKE_LENGTH = 26;
const ARROW_SPACING = 30;
const UNIT_RADIUS = 6;
const UNIT_GAP = 18;
const INACTIVE_ALPHA = 0.18;

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
function drawUnits(ctx: CanvasRenderingContext2D, block: Block, units: number, color: string) {
	const y = -block.h / 2 - 16;
	for (let i = 0; i < PICKUP_UNITS; i++) {
		ctx.fillStyle = i < units ? color : "rgba(255, 255, 255, 0.2)";
		ctx.beginPath();
		ctx.arc((i - (PICKUP_UNITS - 1) / 2) * UNIT_GAP, y, UNIT_RADIUS, 0, Math.PI * 2);
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
		const units = block.peek(HealUnitsTracker)?.units ?? 0;
		const usable = units > 0;

		this.pulse += dt * 2.4;
		const blur = usable ? 30 + Math.sin(this.pulse) * 5 : 3;
		glowBlock(ctx, block, usable ? "rgb(50, 150, 50)" : "rgb(30, 100, 30)", "rgba(100, 255, 100, 0.8)", blur);

		this.crosses.update(block.w, block.h, dt, usable);
		this.crosses.draw(ctx);
		drawUnits(ctx, block, units, "#7dff7d");
	}
}

class RestoreJumpVisual implements BlockVisual {
	private readonly sparks = new ParticleField('diamond', a => `rgba(255, 235, 120, ${a})`);

	draw(ctx: CanvasRenderingContext2D, block: Block, _playerIdx: number, dt: number) {
		const units = block.peek(RestoreJumpUnitsTracker)?.units ?? 0;
		const usable = units > 0;

		glowBlock(
			ctx, block,
			usable ? "rgba(255, 220, 0, 0.6)" : "rgba(130, 115, 30, 0.6)",
			"rgba(255, 230, 100, 0.9)", usable ? 15 : 3
		);

		this.sparks.update(block.w, block.h, dt, usable);
		this.sparks.draw(ctx);
		drawUnits(ctx, block, units, "#ffe066");
	}
}

class RepeatedAttackVisual implements BlockVisual {
	/** Draws a spike, filled according to how ready the attack is. */
	private drawSpike(
		ctx: CanvasRenderingContext2D,
		baseX: number, baseY: number,
		nx: number, ny: number,
		width: number, completion: number
	) {
		const tangentX = -ny * width / 2;
		const tangentY = nx * width / 2;

		const trace = (length: number) => {
			ctx.beginPath();
			ctx.moveTo(baseX + tangentX, baseY + tangentY);
			ctx.lineTo(baseX + nx * length, baseY + ny * length);
			ctx.lineTo(baseX - tangentX, baseY - tangentY);
			ctx.closePath();
		};

		trace(SPIKE_LENGTH);
		ctx.fillStyle = "#dec5ff";
		ctx.fill();

		if (completion > 0) {
			trace(SPIKE_LENGTH * completion);
			ctx.fillStyle = "#882dff";
			ctx.fill();
		}
	}

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

		for (let i = 0; i < count; i++) {
			const along = -length / 2 + (i + 0.5) * width;
			this.drawSpike(
				ctx,
				nx === 0 ? along : nx * block.w / 2,
				ny === 0 ? along : ny * block.h / 2,
				nx, ny, width, completion
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

/** Picks the look of the block: the most important module gives its visual. */
function createModuleVisual({ def: { modules } }: Block): BlockVisual {
	if (modules.finishLevel) return new FinishVisual();
	if (modules.lava) return new LavaVisual();
	if (modules.heal) return new HealVisual();
	if (modules.repeatedAttack) return new RepeatedAttackVisual();
	if (modules.continousAttack) return new ContinousAttackVisual();
	if (modules.restoreJump) return new RestoreJumpVisual();
	if (modules.switch) return new SwitchVisual();
	if (modules.bounce) return new BounceVisual();
	return new DefaultVisual();
}

/** Client data of a block: everything needed to draw it, and nothing shared. */
export class BlockClientData {
	private readonly visual: BlockVisual;

	constructor(block: Block) {
		this.visual = createModuleVisual(block);
	}

	/** Draws the block at its position. Inactive blocks are only ghosts. */
	draw(ctx: CanvasRenderingContext2D, block: Block, playerIdx: number, dt: number) {
		ctx.save();
		ctx.translate(block.x, block.y);
		if (!block.isActive()) {
			ctx.globalAlpha = INACTIVE_ALPHA;
		}

		this.visual.draw(ctx, block, playerIdx, dt);
		ctx.restore();
	}
}

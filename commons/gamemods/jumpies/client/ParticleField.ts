const PRODUCTION_AREA = 200000; // one particle per frame for this block area
const FRAME_TIME = 1 / 60;

export type ParticleShape = 'bubble' | 'diamond' | 'plus';

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	alpha: number;
	rotation: number;
	vr: number;
}

/**
 * Client-only particles rising from a block, drawn around its center.
 * The random values are harmless here: nothing in this file touches the simulation.
 */
export class ParticleField {
	private particles: Particle[] = [];
	private production = 0;

	constructor(
		private readonly shape: ParticleShape,
		private readonly color: (alpha: number) => string
	) {}

	private spawn(w: number, h: number) {
		this.particles.push({
			x: (Math.random() - 0.5) * w,
			y: (Math.random() - 0.5) * h,
			vx: (Math.random() - 0.5) * 20,
			vy: -30 - Math.random() * 40,
			size: 3 + Math.random() * 4,
			alpha: 1.2,
			rotation: Math.random() * Math.PI,
			vr: (Math.random() - 0.5) * 2.4
		});
	}

	/** Moves the particles. Blocks stop producing some when `producing` is false. */
	update(w: number, h: number, dt: number, producing = true) {
		if (producing) {
			this.production += w * h * dt / FRAME_TIME;
			while (this.production > PRODUCTION_AREA) {
				this.production -= PRODUCTION_AREA;
				this.spawn(w, h);
			}
		}

		for (const p of this.particles) {
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.rotation += p.vr * dt;
			p.alpha -= 0.6 * dt;
		}

		this.particles = this.particles.filter(p => p.alpha > 0);
	}

	private drawBubble(ctx: CanvasRenderingContext2D, p: Particle) {
		ctx.fillStyle = this.color(Math.min(1, p.alpha));
		ctx.beginPath();
		ctx.arc(0, 0, p.size, 0, Math.PI * 2);
		ctx.fill();
	}

	private drawDiamond(ctx: CanvasRenderingContext2D, p: Particle) {
		const s = p.size * 1.4;
		ctx.fillStyle = this.color(Math.min(1, p.alpha));
		ctx.beginPath();
		ctx.moveTo(0, -s);
		ctx.lineTo(s, 0);
		ctx.lineTo(0, s);
		ctx.lineTo(-s, 0);
		ctx.closePath();
		ctx.fill();
	}

	private drawPlus(ctx: CanvasRenderingContext2D, p: Particle) {
		ctx.strokeStyle = this.color(Math.min(1, p.alpha));
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(-p.size, 0);
		ctx.lineTo(p.size, 0);
		ctx.moveTo(0, -p.size);
		ctx.lineTo(0, p.size);
		ctx.stroke();
	}

	draw(ctx: CanvasRenderingContext2D) {
		for (const p of this.particles) {
			ctx.save();
			ctx.translate(p.x, p.y);

			if (this.shape === 'bubble') {
				this.drawBubble(ctx, p);
			} else if (this.shape === 'plus') {
				this.drawPlus(ctx, p);
			} else {
				ctx.rotate(p.rotation);
				this.drawDiamond(ctx, p);
			}

			ctx.restore();
		}
	}
}

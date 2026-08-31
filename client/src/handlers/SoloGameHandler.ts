import { SoloGameMode } from "../../../commons/SoloGameMode";
import { keyboardController } from "../controllers/KeyboardController";
import { mouseController } from "../controllers/MouseController";
import { mobileController } from "../controllers/MobileController";
import { dom } from "../dom/dom";
import { imageLoader } from "./imageLoader";

const canvas = document.getElementById("play-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

export class SoloGameHandler {
	private clock = 0;
	private lastTime = 0;
	private interrupted = false;

	private readonly gameWidth: number;
	private readonly gameHeight: number;
	private readonly allowsMobile: boolean;

	constructor(
		private readonly gamemode: SoloGameMode,
		private readonly data: Uint8Array
	) {
		const gsize = this.gamemode.getSize();
		this.gameWidth = gsize.width;
		this.gameHeight = gsize.height;

		mouseController.setScreenCoordsAdapter(
			this.gamemode,
			0,
			this.data
		);

		const mobileDesc = this.gamemode.getMobileDesc();

		if (mobileDesc) {
			this.allowsMobile = true;

			mobileController.setScreenCoordsAdapter(
				this.gamemode,
				0,
				this.data
			);
		} else {
			this.allowsMobile = false;
		}
	}

	start() {
		this.clock = 0;
		this.lastTime = performance.now();

		requestAnimationFrame(() => this.frame());
	}

	private draw(dt: number) {
		// Compute the scale needed to fit the game viewport inside the canvas.
		const scaleX = canvas.width / this.gameWidth;
		const scaleY = canvas.height / this.gameHeight;

		// Preserve the game's aspect ratio by using the smallest scale.
		const scale = Math.min(scaleX, scaleY);

		// Center the scaled game viewport inside the canvas.
		const offsetX = (canvas.width - this.gameWidth * scale) / 2;
		const offsetY = (canvas.height - this.gameHeight * scale) / 2;

		ctx.save();

		// Clear the entire canvas before drawing the new frame.
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Move to the centered position and apply the calculated scale.
		ctx.translate(offsetX, offsetY);
		ctx.scale(scale, scale);

		// Draw the game using its native resolution.
		this.gamemode.draw(
			ctx,
			0,
			this.data,
			imageLoader,
			dt
		);

		ctx.restore();

		// Draw black bars over the unused areas outside the game viewport.
		ctx.fillStyle = "black";

		// Draw left and right bars when the canvas is wider than the game viewport.
		if (offsetX > 0) {
			ctx.fillRect(0, 0, offsetX, canvas.height);
			ctx.fillRect(
				canvas.width - offsetX,
				0,
				offsetX,
				canvas.height
			);
		}

		// Draw top and bottom bars when the canvas is taller than the game viewport.
		if (offsetY > 0) {
			ctx.fillRect(0, 0, canvas.width, offsetY);
			ctx.fillRect(
				0,
				canvas.height - offsetY,
				canvas.width,
				offsetY
			);
		}

		if (this.allowsMobile) {
			mobileController.draw(ctx);
		}
	}

	private frame() {
		if (this.interrupted)
			return;

		const now = performance.now();
		const dt = (now - this.lastTime) / 1000;

		this.lastTime = now;
		this.clock += dt;

		// Collect and apply player inputs before simulating the game.
		const inputs = this.gamemode.collectInputs(
			keyboardController,
			mouseController,
			this.allowsMobile ? mobileController : null,
			this.data
		);

		keyboardController.frame();
		mouseController.frame();
		mobileController.frame();

		for (const input of inputs) {
			this.gamemode.runInput(0, input);
		}

		const result = this.gamemode.quickEmulate(dt);

		if (result !== null) {
			this.interrupted = true;
			dom.openHome();
			return;
		}

		this.draw(dt);

		requestAnimationFrame(() => this.frame());
	}
}

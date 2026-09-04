import { SoloGameMode } from "../../../commons/SoloGameMode";
import { keyboardController } from "../controllers/KeyboardController";
import { mouseController } from "../controllers/MouseController";
import { mobileController } from "../controllers/MobileController";
import { dom } from "../dom/dom";
import { imageLoader } from "./imageLoader";
import { Fields } from "../../../commons/Fields";
import { getProtocol } from "../../../commons/protocolLoader";
import Prando from "prando";
import { sendMessage } from "../messages/sendMessage";
import { hasNavigatorMobile, hasNavigatorMouse } from "../dom/clientNavigatorType";
import { fullScreenHandler } from "./FullScreenHandler";

const canvas = document.getElementById("play-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

export class SoloGameHandler {
	private clock = 0;
	private lastTime = 0;
	private interrupted = false;

	private readonly gameWidth: number;
	private readonly gameHeight: number;
	private readonly allowsMobile: boolean;

	private readonly inputs: Uint8Array[] = [];
	private Input: any;
	private readonly clientData: Uint8Array;
	private readonly seed: number;

	constructor(
		private readonly gamemodeId: string,
		private readonly gamemode: SoloGameMode,
		private readonly category: string
	) {
		const gsize = this.gamemode.getSize();
		this.gameWidth = gsize.width;
		this.gameHeight = gsize.height;
		this.seed = Math.floor(Math.random() * 2_000_000_000);

		this.clientData = this.gamemode.init(category, new Prando(this.seed), true);

		mouseController.setScreenCoordsAdapter(
			this.gamemode,
			0,
			this.clientData
		);

		const mobileDesc = this.gamemode.getMobileDesc();

		if (mobileDesc && hasNavigatorMobile()) {
			this.allowsMobile = true;

			mobileController.setScreenCoordsAdapter(
				this.gamemode,
				0,
				this.clientData
			);
		} else {
			this.allowsMobile = false;
		}
	}

	async start() {
		await fullScreenHandler.openFull();
		this.clock = 0;
		this.lastTime = performance.now();

		const protocols = getProtocol(this.gamemodeId, 'solo')
		await protocols.load();
		this.Input = protocols.get().Input;

		requestAnimationFrame(() => this.frame());
	}

	private draw(dt: number) {
		// Compute the scale needed to fit the game viewport inside the canvas.
		const scaleX = innerWidth / this.gameWidth;
		const scaleY = innerHeight / this.gameHeight;

		// Preserve the game's aspect ratio by using the smallest scale.
		const scale = Math.min(scaleX, scaleY);

		// Center the scaled game viewport inside the canvas.
		const offsetX = (innerWidth - this.gameWidth * scale) / 2;
		const offsetY = (innerHeight - this.gameHeight * scale) / 2;

		ctx.save();

		// Clear the entire canvas before drawing the new frame.
		ctx.clearRect(0, 0, innerWidth, innerHeight);

		// Move to the centered position and apply the calculated scale.
		ctx.translate(offsetX, offsetY);
		ctx.scale(scale, scale);

		// Draw the game using its native resolution.
		this.gamemode.draw(
			ctx,
			this.clientData,
			imageLoader,
			dt
		);

		// Restore the context to the original canvas coordinates.
		ctx.restore();

		// Draw black bars over the unused areas outside the game viewport.
		ctx.fillStyle = "black";

		// Draw left and right bars when the canvas is wider than the game viewport.
		if (offsetX > 0) {
			ctx.fillRect(0, 0, offsetX, innerHeight); // Left bar
			ctx.fillRect(innerWidth - offsetX, 0, offsetX, innerHeight); // Right bar
		}

		// Draw top and bottom bars when the canvas is taller than the game viewport.
		if (offsetY > 0) {
			ctx.fillRect(0, 0, innerWidth, offsetY); // Top bar
			ctx.fillRect(0, innerHeight - offsetY, innerWidth, offsetY); // Bottom bar
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

		// Collect and apply player inputs before simulating the game.
		const inputs = this.gamemode.collectInputs(
			keyboardController,
			mouseController,
			(this.allowsMobile && !hasNavigatorMouse()) ? mobileController : null,
			this.clientData
		);

		keyboardController.frame();
		mouseController.frame();
		mobileController.frame();

		for (const input of inputs) {
			this.gamemode.runInput(input);
			this.inputs.push(this.Input.encode({
				...input,
				timestamp: this.clock
			}).finish());
		}

		const result = this.gamemode.quickEmulate(dt, this.clock);

		if (result !== null) {
			sendMessage({
				soloRunInputs: {
					gamemode: this.gamemodeId,
					category: this.category,
					seed: this.seed,
					inputs: this.inputs
				}
			});
			dom.openSoloComponent(result);
			this.interrupted = true;
			return;
		}

		this.draw(dt);

		this.clock += dt;
		requestAnimationFrame(() => this.frame());
	}
}

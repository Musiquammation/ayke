import { GameMode } from "../../../commons/GameMode";
import { getMultiGmFactory } from "../../../commons/gamemods";
import { keyboardController } from "../controllers/KeyboardController";
import { mouseController } from "../controllers/MouseController";
import { mobileController } from "../controllers/MobileController";
import { dom } from "../dom/dom";
import { imageLoader } from "./imageLoader";
import { hasNavigatorMobile, hasNavigatorMouse } from "../dom/clientNavigatorType";
import { deleteGameHandler } from "./GameHandler";
import { fullScreenHandler } from "./FullScreenHandler";

const canvas = document.getElementById("play-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

export class LocalGameHandler {
	private clock = 0;
	private lastTime = 0;
	private gamemode: GameMode;
	private interrupted = false;
	private readonly tutorial;
	private readonly clientData;
	private readonly gameWidth: number;
	private readonly gameHeight: number;
	private readonly allowsMobile;

	private readonly imageLoaderPromise;

	constructor(gamemodeId: string) {
		const factory = getMultiGmFactory(gamemodeId);

		const {game, data, html, skins} = factory.client(null, 2, 0);
		const gameHtml = document.getElementById("game-html")!;
		gameHtml.innerHTML = "";
		if (html) { gameHtml.appendChild(html); }
		this.gamemode = game;
		this.tutorial = this.gamemode.createTutorial();
		this.clientData = data;

		const gsize = this.gamemode.getSize();
		this.gameWidth = gsize.width;
		this.gameHeight = gsize.height;

		mouseController.setScreenCoordsAdapter(this.gamemode, 0, data);

		const mobileDesc = this.gamemode.getMobileDesc();
		if (mobileDesc && hasNavigatorMobile()) {
			this.allowsMobile = true;
			mobileController.setScreenCoordsAdapter(
				this.gamemode,
				0,
				data
			);
		} else {
			this.allowsMobile = false;
		}
		
		this.imageLoaderPromise = imageLoader.load(skins, gamemodeId);
	}

	async start() {
		await fullScreenHandler.openFull();
		await this.imageLoaderPromise;
		this.clock = 0;
		this.lastTime = performance.now();
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

		// Everything drawn here is affected by the translation and scale.
		this.gamemode.draw(ctx, 0, this.clientData, imageLoader, dt);

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
		this.clock += dt;

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
			this.gamemode.runInput(0, input);
		}

		const tutorialResult = this.tutorial.frame(dt, this.clock);
		if (tutorialResult === null) {
			// Exit tutorial
			this.interrupted = true;
			dom.openHome();
			return;
		} else {
			dom.getTutorialInplayComponent().setText(tutorialResult);
		}

		if (this.gamemode.quickEmulate(dt, true)) {
			// Finish
			this.interrupted = true;
			deleteGameHandler();
			dom.openHome();
			return;
		}

		this.draw(dt);

		requestAnimationFrame(() => this.frame());
	}
}

import { GameMode } from "../../../commons/GameMode";
import { gamemods, getGmFactory } from "../../../commons/gamemods";
import { keyboardController } from "../controllers/KeyboardController";
import { mouseController } from "../controllers/MouseController";
import { dom } from "../dom/dom";
import { imageLoader } from "./imageLoader";

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

	constructor(gamemodeId: string) {
		const factory = getGmFactory(gamemodeId);	

		const {game, data, html} = factory.client(null, 2);
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

		// Everything drawn here is affected by the translation and scale.
		this.gamemode.draw(ctx, 0, this.clientData, imageLoader, dt);

		// Restore the context to the original canvas coordinates.
		ctx.restore();

		// Draw black bars over the unused areas outside the game viewport.
		ctx.fillStyle = "black";

		// Draw left and right bars when the canvas is wider than the game viewport.
		if (offsetX > 0) {
			ctx.fillRect(0, 0, offsetX, canvas.height); // Left bar
			ctx.fillRect(canvas.width - offsetX, 0, offsetX, canvas.height); // Right bar
		}

		// Draw top and bottom bars when the canvas is taller than the game viewport.
		if (offsetY > 0) {
			ctx.fillRect(0, 0, canvas.width, offsetY); // Top bar
			ctx.fillRect(0, canvas.height - offsetY, canvas.width, offsetY); // Bottom bar
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
			this.clientData
		);

		keyboardController.frame();
		mouseController.frame();


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
			dom.openHome();
			return;
		}

		this.draw(dt);

		requestAnimationFrame(() => this.frame());
	}
}
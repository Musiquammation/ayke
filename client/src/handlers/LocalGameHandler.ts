import { FinishGame, GameMode } from "../../../commons/GameMode";
import { getMultiGmFactory } from "../../../commons/gamemods";
import { Fields } from "../../../commons/Fields";
import { keyboardController } from "../controllers/KeyboardController";
import { mouseController } from "../controllers/MouseController";
import { mobileController } from "../controllers/MobileController";
import { dom } from "../dom/dom";
import { imageLoader } from "./imageLoader";
import { hasNavigatorMobile, hasNavigatorMouse } from "../dom/clientNavigatorType";
import { deleteGameHandler } from "./GameHandler";
import { fullScreenHandler } from "./FullScreenHandler";
import { Bot, generateBot } from "../../../commons/Bot";
import Prando from "prando";

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

	// Bots controlled by the local game handler.
	private readonly bots: Bot<GameMode, any>[];

	private readonly prando;

	private readonly playerCount;

	constructor(gamemodeId: string, addBots: boolean, seed = Math.random()) {
		const factory = getMultiGmFactory(gamemodeId);
		this.prando = new Prando(seed);
		console.log("Current seed is " + Math.random());

		this.playerCount = addBots ? factory.defaultPlayerCount : 2;
		const {game, data, html, skins} = factory.client(
			null,
			this.playerCount,
			0
		);
		const gameHtml = document.getElementById("game-html")!;
		gameHtml.innerHTML = "";
		if (html) { gameHtml.appendChild(html); }
		this.gamemode = game;
		if (addBots) {
			this.tutorial = null;
		} else {
			this.tutorial = this.gamemode.createTutorial();
		}

		this.clientData = data;

		// Create the bots only when they are requested.
		//
		// The first player (index 0) is the local player, so bots start
		// at player index 1.
		if (addBots) {
			this.bots = this.gamemode
				.getBotIds(factory.defaultPlayerCount - 1)
				.map((i, index) =>
					generateBot(
						factory.nodes,
						i,
						1 + index
					)
				);
		} else {
			this.bots = [];
		}

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
		await fullScreenHandler.openFull(this.gamemode.getMobileOrientation());
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

		ctx.restore();

		// Draw black bars over the unused areas outside the game viewport.
		ctx.fillStyle = "black";

		// Draw left and right bars when the canvas is wider than the game viewport.
		if (offsetX > 0) {
			ctx.fillRect(0, 0, offsetX, innerHeight);
			ctx.fillRect(innerWidth - offsetX, 0, offsetX, innerHeight);
		}

		// Draw top and bottom bars when the canvas is taller than the game viewport.
		if (offsetY > 0) {
			ctx.fillRect(0, 0, innerWidth, offsetY);
			ctx.fillRect(0, innerHeight - offsetY, innerWidth, offsetY);
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

		// Apply the local player's inputs.
		for (const input of inputs) {
			this.gamemode.runInput(0, input);
		}

		// Collect and apply all bot inputs for this frame.
		//
		// Inputs are collected first and applied afterwards so that every bot
		// makes its decision from the same game state.
		const collected: Record<number, Fields[]> = {};

		for (const bot of this.bots) {
			collected[bot.playerIdx] = bot.play(this.gamemode);
		}

		for (const [playerIdx, inputs] of Object.entries(collected)) {
			for (const input of inputs) {
				this.gamemode.runInput(Number(playerIdx), input);
			}
		}

		if (this.tutorial) {
			const tutorialResult = this.tutorial.frame(dt, this.clock);
			if (tutorialResult === null) {
				// Exit tutorial
				this.interrupted = true;
				dom.openHome();
				return;
			} else {
				dom.getTutorialInplayComponent().setText(tutorialResult);
			}
		}

		const rng = () => this.prando.next();
		const finish = this.gamemode.quickEmulate(dt, true, rng);
		if (finish) {
			this.finishGame(finish);
			return;
		}

		this.draw(dt);

		requestAnimationFrame(() => this.frame());
	}

	private finishGame(finish: FinishGame) {
		this.interrupted = true;
		deleteGameHandler();
		dom.openLocalPlayResults(finish);
	}


	generateBotLocalUsers() {
		const pseudos: Record<number, string> = {};
		pseudos[0] = "You";

		for (let i = 1; i < this.playerCount; i++) {
			pseudos[i] = "bot #" + i;
		}

		return pseudos;

	}
}
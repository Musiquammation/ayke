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
	private finishingGame = false;
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

	private finishTimer: number | null = null;
	private finishResult: FinishGame | null = null;

	constructor(
		gamemodeId: string,
		addBots: boolean,
		startData: any,
		seed = Math.random()
	) {
		const factory = getMultiGmFactory(gamemodeId);
		this.prando = new Prando(seed);
		console.log("Current seed is " + Math.random());

		this.playerCount = addBots ? factory.defaultPlayerCount : 2;
		const {game, data, html, skins} = factory.client(
			{data: startData, origin: 'client'},
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

		document.getElementById("game-ping")!.textContent = "";
	}

	async start() {
		await fullScreenHandler.openFull(this.gamemode.getMobileOrientation());
		await this.imageLoaderPromise;
		this.clock = 0;
		this.lastTime = performance.now();
		requestAnimationFrame(() => this.frame());
	}

	private draw(dt: number, addCamZ: number) {
		const scaleX = innerWidth / this.gameWidth;
		const scaleY = innerHeight / this.gameHeight;

		// Preserve the game's aspect ratio by using the smallest scale.
		let scale = Math.min(scaleX, scaleY);

		// Zoom out progressively if the game is finished
		if (this.finishTimer !== null) {
		}

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
		this.gamemode.draw(ctx, 0, this.clientData, imageLoader, addCamZ, dt);

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

	private static dtSpeedFn(t: number) {
		const a = 1.6;
		return Math.pow(t + 0.5, -a) / (Math.pow(0.5, -a) * 1.1) + 0.1;
	}

	private static zoomFn(x: number) {
		return Math.sin(x * ((Math.PI/2)/3));
	}

	private frame() {
		if (this.interrupted)
			return;

		const now = performance.now();
		let dt = (now - this.lastTime) / 1000;
		const realDt = dt; // Keep the real time delta for our 5-second timer
		this.lastTime = now;
		this.clock += realDt;

		// Handle the ending sequence
		if (this.finishTimer !== null) {
			this.finishTimer += realDt;
			dt *= LocalGameHandler.dtSpeedFn(this.finishTimer);

			if (this.finishTimer >= 3.0) {
				this.finishGame(this.finishResult!);
			}
		}

		// Block inputs if we are in the ending sequence
		if (this.finishTimer === null) {
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
			const collected: Record<number, Fields[]> = {};

			for (const bot of this.bots) {
				collected[bot.playerIdx] = bot.play(this.gamemode);
			}

			for (const [playerIdx, inputs] of Object.entries(collected)) {
				for (const input of inputs) {
					this.gamemode.runInput(Number(playerIdx), input);
				}
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
		
		// Run emulation with our modified (potentially slowed down) dt
		const finish = this.gamemode.quickEmulate(
			dt,
			this.finishTimer === null,
			rng
		);
		
		// If the game finishes, start the 5s sequence instead of exiting immediately
		if (finish && this.finishTimer === null) {
			this.finishTimer = 0;
			this.finishResult = finish;
		}

		this.draw(
			dt,
			this.finishTimer === null ? 0 : LocalGameHandler.zoomFn(this.finishTimer)
		);

		requestAnimationFrame(() => this.frame());
	}

	private async finishGame(finish: FinishGame) {
		if (this.finishingGame) {
			return;
		}
		this.finishingGame = true;
		await dom.openLocalPlayResults(finish);
		this.interrupted = true;
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
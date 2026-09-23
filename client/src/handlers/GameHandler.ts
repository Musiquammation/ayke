import { Fields } from "../../../commons/Fields";
import { FinishGame, GameMode } from "../../../commons/GameMode";
import { gamemods, getMultiGmFactory } from "../../../commons/gamemods";
import { getNow, msgtypes } from "../messages/sendMessage";
import { keyboardController } from "../controllers/KeyboardController";
import { mouseController } from "../controllers/MouseController";
import { mergeSortedArrays } from "../../../commons/util/mergeSortedArrays";
import { dom, PlayResults } from "../dom/dom";
import { getProtocol, ProtocolTypes } from "../../../commons/protocolLoader";
import { decodeFullMessage } from "../../../commons/util/decodeFullMessage";
import { imageLoader } from "./imageLoader";
import { mobileController } from "../controllers/MobileController";
import { hasNavigatorMobile, hasNavigatorMouse } from "../dom/clientNavigatorType";
import { fullScreenHandler } from "./FullScreenHandler";

const canvas = document.getElementById("play-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Prevent context menu from appearing on right click
canvas.oncontextmenu = e => {
	e.preventDefault();
};

const PING_LIMIT = 2000;
const pingElement = document.getElementById("game-ping")!;

/**
 * Adjusts the canvas resolution and CSS size based on the device pixel ratio
 * to ensure crisp rendering on high-DPI displays.
 */
function resizeCanvas() {
	const dpr = window.devicePixelRatio || 1;

	const width = window.innerWidth;
	const height = window.innerHeight;

	// Set CSS display size
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;

	// Set internal resolution based on DPR
	canvas.width = Math.round(width * dpr);
	canvas.height = Math.round(height * dpr);

	// Make drawing coordinates use CSS pixels seamlessly
	const ctx = canvas.getContext("2d")!;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

interface Input {
	timestamp: number;
}

interface RealInput {
	timestamp: number;
	player: number;
}

/**
 * Helper to sort inputs chronologically by timestamp.
 */
function compareInputs(a: RealInput, b: RealInput) {
	return a.timestamp - b.timestamp;
}

class GameHandler {
	private userInputs: Input[] = [];
	private readonly gameWidth: number;
	private readonly gameHeight: number;
	private prevDraw: number | null = null;
	private readonly allowsMobile;
	
	// Networking & Emulation timers
	private lastEmulation = getNow();
	private emulationTime = getNow(); // Used to simulate slowed time locally
	private lastReceive = getNow();
	private pingSum = 0;
	private pingCount = 0;
	private lastPingUpdate = getNow();

	// Ending sequence state variables
	private finishTimer: number | null = null;
	private finishingGame = false;
	private resolveClose: (() => void) | null = null;
	private interrupted = false;

	constructor(
		private readonly gamemodeId: string,
		private readonly gamemode: GameMode,
		private readonly playerIdx: number,
		private readonly protocols: ProtocolTypes,
		private readonly clientData: any
	) {
		const gsize = this.gamemode.getSize();
		this.gameWidth = gsize.width;
		this.gameHeight = gsize.height;

		// Initialize input controllers with proper coordinate mapping
		mouseController.setScreenCoordsAdapter(this.gamemode, playerIdx, clientData);

		const mobileDesc = this.gamemode.getMobileDesc();
		if (mobileDesc && hasNavigatorMobile()) {
			this.allowsMobile = true;
			mobileController.setScreenCoordsAdapter(gamemode, playerIdx, clientData);
		} else {
			this.allowsMobile = false;
		}

		pingElement.textContent = "";
	}

	/**
	 * Computes the local simulated time delta speed factor.
	 * Used to slow down time when the game is finishing.
	 */
	private static dtSpeedFn(t: number) {
		const a = 1.6;
		return Math.pow(t + 0.5, -a) / (Math.pow(0.5, -a) * 1.1) + 0.1;
	}

	/**
	 * Computes the zoom progression based on the finish timer.
	 */
	private static zoomFn(x: number) {
		return Math.sin(x * ((Math.PI/2)/3));
	}

	/**
	 * Evaluates and displays the current network ping to the server.
	 */
	private updatePing() {
		const now = getNow();

		// Measure the time since the previous server message.
		this.pingSum += now - this.lastReceive;
		this.pingCount++;

		this.lastReceive = now;

		// Update the displayed ping once per second.
		if (now - this.lastPingUpdate >= 1000) {
			const averagePing = this.pingCount > 0
				? this.pingSum / this.pingCount
				: 0;

			pingElement.textContent = averagePing.toFixed(1).padStart(4, "0");
			pingElement.classList.remove('disconnected');

			this.pingSum = 0;
			this.pingCount = 0;
			this.lastPingUpdate = now;
		}
	}

	/**
	 * Handles data packets received from the server.
	 */
	receive(gdata: Uint8Array) {
		this.updatePing();
		const msg = decodeFullMessage(this.protocols.ServerMessage.decode(gdata));
		
		// Load the definitive state provided by the server
		this.gamemode.load(msg.state);
		
		const now = getNow();
		// If time hasn't been manually desynchronized by finishTimer, align with reality
		if (this.finishTimer === null) {
			this.emulationTime = now;
		}

		const inputs = mergeSortedArrays(
			msg.inputs.map((i: any) => ({...(i.data), player: i.player})),
			this.userInputs.map(i => ({...i, player: this.playerIdx})),
			compareInputs
		);

		// Emulate to catch up state from the server state timestamp to local simulated time
		this.gamemode.emulate(
			msg.timestamp,
			this.emulationTime,
			inputs,
			null
		);

		// Send accumulated inputs back to the server
		const output = this.protocols.ClientMessage.encode({
			timestamp: now,
			inputs: this.userInputs
		}).finish();

		this.userInputs.length = 0; // flush userInputs after sending
		return output;
	}

	/**
	 * Renders the current game frame on the canvas.
	 */
	private draw(dt: number, addCamZ: number) {
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
		this.gamemode.draw(ctx, this.playerIdx, this.clientData, imageLoader, addCamZ, dt);

		// Restore the context to the original canvas coordinates.
		ctx.restore();

		// Draw black bars over the unused areas outside the game viewport.
		ctx.fillStyle = "black";

		if (offsetX > 0) {
			ctx.fillRect(0, 0, offsetX, innerHeight); // Left bar
			ctx.fillRect(innerWidth - offsetX, 0, offsetX, innerHeight); // Right bar
		}

		if (offsetY > 0) {
			ctx.fillRect(0, 0, innerWidth, offsetY); // Top bar
			ctx.fillRect(0, innerHeight - offsetY, innerWidth, offsetY); // Bottom bar
		}

		if (this.allowsMobile) {
			mobileController.draw(ctx);
		}
	}

	/**
	 * Main execution loop managing emulation and rendering.
	 */
	frame() {
		if (this.interrupted) return;
		
		const now = getNow();
		
		// Check ping timeout
		if (this.finishTimer === null && now - this.lastReceive >= PING_LIMIT) {
			pingElement.textContent = "(disconnected)";
			pingElement.classList.add('disconnected');
		}

		// Calculate real elapsed time in seconds
		let dt = this.prevDraw === null ? 1/60 : (now - this.prevDraw) / 1000;
		this.prevDraw = now;
		
		// If finishing the game, slow down the time progression (dt)
		if (this.finishTimer !== null) {
			this.finishTimer += dt;
			dt *= GameHandler.dtSpeedFn(this.finishTimer);

			// Check if the 3-second sequence is over and resolve the promise
			if (this.finishTimer >= 3.0 && this.resolveClose) {
				this.resolveClose();
				this.resolveClose = null; // Prevent multi-calls
			}
		}

		// Calculate the new time for the emulation engine based on our modified dt
		const emulationDtMs = dt * 1000;
		const nextEmulationTime = this.emulationTime + emulationDtMs;
		
		// Block input collection when the end sequence has started
		if (this.finishTimer === null) {
			const newInputs = this.gamemode.collectInputs(
				keyboardController,
				mouseController,
				(this.allowsMobile && !hasNavigatorMouse()) ? mobileController : null,
				this.clientData
			).map(data => ({...data, timestamp: nextEmulationTime}));
			
			this.userInputs.push(...newInputs);

			keyboardController.frame();
			mouseController.frame();
			mobileController.frame();

			// Emulate the current frame locally to provide instant feedback
			this.gamemode.emulate(
				this.emulationTime,
				nextEmulationTime,
				newInputs.map(i => ({...i, player: this.playerIdx})),
				null
			);
		} else {
			this.gamemode.emulate(
				this.emulationTime,
				nextEmulationTime,
				[],
				null
			);
		}

		this.emulationTime = nextEmulationTime;

		// Draw with the computed delta and zoom values
		this.draw(
			dt,
			this.finishTimer === null ? 0 : GameHandler.zoomFn(this.finishTimer)
		);

		// Loop while handler is active
		if (_gameHandler) {
			requestAnimationFrame(() => this.frame());
		}
	}


	/**
	 * Initiates the 3-second closing sequence, slowing time and zooming in.
	 * Resolves completely once the visual transition and cleanup are complete.
	 */
	async close() {
		if (this.finishingGame) return;

		this.finishingGame = true;

		// 1. Start the 3 seconds timer (which modifies frame()'s dt and zoom)
		this.finishTimer = 0;

		// Wait for exactly 3 in-game simulation seconds (resolved in frame())
		await new Promise<void>(resolve => {
			this.resolveClose = resolve;
		});

		// 2. Launch the animation wrapper logic as requested
		await dom.withLoading(async panelVisiblePromise => {
			await panelVisiblePromise;			
			this.interrupted = true; 
		});
	}
}

let _gameHandler: GameHandler | null = null;

export function getGameHandler() {
	return _gameHandler;
}

export async function setGameHandler(
	gamemode: string,
	playerIdx: number,
	startData: Uint8Array,
	total: number
) {

	const factory = getMultiGmFactory(gamemode);

	const protocols = getProtocol(gamemode, 'multiplayer');
	await protocols.load();

	const {game, data, html, skins} = factory.client(
		{data: startData, origin: 'server'},
		total,
		playerIdx
	);

	await imageLoader.load(skins, gamemode);

	const gameHtml = document.getElementById("game-html")!;
	gameHtml.innerHTML = "";
	if (html) {
		gameHtml.appendChild(html);
	}

	await fullScreenHandler.openFull(game.getMobileOrientation());

	_gameHandler = new GameHandler(
		gamemode,
		game,
		playerIdx,
		protocols.get(),
		data
	);
	
	// Initiate the main rendering and logic loop
	_gameHandler.frame();

	dom.openPlay();

	return _gameHandler;
}

export async function deleteGameHandler() {
	if (_gameHandler === null)
		return;

	// Waits for the 3 seconds slowdown/zoom to finish before destroying the handler
	await _gameHandler.close();
	
	fullScreenHandler.closeFull();
	_gameHandler = null;
}
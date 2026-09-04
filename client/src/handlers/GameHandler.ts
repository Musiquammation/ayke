import { Fields } from "../../../commons/Fields";
import { GameMode } from "../../../commons/GameMode";
import { gamemods, getMultiGmFactory } from "../../../commons/gamemods";
import { getNow, msgtypes } from "../messages/sendMessage";
import { keyboardController } from "../controllers/KeyboardController"
import { mouseController } from "../controllers/MouseController"
import { mergeSortedArrays } from "../../../commons/util/mergeSortedArrays"
import { dom } from "../dom/dom";
import { getProtocol, ProtocolTypes } from "../../../commons/protocolLoader";
import { decodeFullMessage } from "../../../commons/util/decodeFullMessage";
import { imageLoader } from "./imageLoader";
import { mobileController } from "../controllers/MobileController";
import { hasNavigatorMouse } from "../dom/clientNavigatorType";
import { fullScreenHandler } from "./FullScreenHandler";


const canvas = document.getElementById("play-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.oncontextmenu = e => {
	e.preventDefault();
};


function resizeCanvas() {
	const dpr = window.devicePixelRatio || 1;

	const width = window.innerWidth;
	const height = window.innerHeight;

	// CSS size
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;

	// Internal resolution
	canvas.width = Math.round(width * dpr);
	canvas.height = Math.round(height * dpr);

	// Make drawing coordinates use CSS pixels
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

function compareInputs(a: RealInput, b: RealInput) {
	return a.timestamp - b.timestamp;
}

class GameHandler {
	private lastEmulation = 0;
	private userInputs: Input[] = [];
	private readonly gameWidth: number;
	private readonly gameHeight: number;
	private prevDraw: number | null = null;
	private readonly allowsMobile;

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
		mouseController.setScreenCoordsAdapter(this.gamemode, playerIdx, clientData);

		const mobileDesc = this.gamemode.getMobileDesc();
		if (mobileDesc) {
			this.allowsMobile = true;
			mobileController.setScreenCoordsAdapter(gamemode, playerIdx, clientData);
		} else {
			this.allowsMobile = false;
		}
	}

	receive(gdata: Uint8Array) {
		const msg = decodeFullMessage(this.protocols.ServerMessage.decode(gdata));
		this.gamemode.load(msg.state);
		const now = getNow();
		this.lastEmulation = now;

		const inputs = mergeSortedArrays(
			msg.inputs.map((i: any) => ({...(i.data), player: i.player})),
			this.userInputs.map(i => ({...i, player: this.playerIdx})),
			compareInputs
		);

		this.gamemode.emulate(
			msg.timestamp,
			now,
			inputs
		);

		const output = this.protocols.ClientMessage.encode({
			timestamp: now,
			inputs: this.userInputs
		}).finish();

		this.userInputs.length = 0; // empty userInputs


		return output;
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
		this.gamemode.draw(ctx, this.playerIdx, this.clientData, imageLoader, dt);

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

	frame() {
		// Collect inputs
		const now = getNow();
		const newInputs = this.gamemode.collectInputs(
			keyboardController,
			mouseController,
			(this.allowsMobile && !hasNavigatorMouse()) ? mobileController : null,
			this.clientData
		).map(data => ({...data, timestamp: now}));
		this.userInputs.push(...newInputs);

		keyboardController.frame();
		mouseController.frame();
		mobileController.frame();

		this.gamemode.emulate(
			this.lastEmulation,
			now,
			newInputs.map(i => ({...i, player: this.playerIdx}))
		);
		this.lastEmulation = now;


		this.draw(this.prevDraw === null ? 1/60 : now - this.prevDraw);
		this.prevDraw = now;

		if (_gameHandler) {
			requestAnimationFrame(()=>this.frame());
		}
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

	const {game, data, html, skins} = factory.client(startData, total, playerIdx);

	await imageLoader.load(skins, gamemode);

	const gameHtml = document.getElementById("game-html")!;
	gameHtml.innerHTML = "";
	if (html) {
		gameHtml.appendChild(html);
	}

	await fullScreenHandler.openFull();

	_gameHandler = new GameHandler(
		gamemode,
		game,
		playerIdx,
		protocols.get(),
		data
	);
	_gameHandler.frame();

	dom.openPlay();

	return _gameHandler;
}

export function deleteGameHandler() {
	fullScreenHandler.closeFull();
	_gameHandler = null;
}

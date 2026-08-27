import { Fields } from "../../../commons/Fields";
import { GameMode } from "../../../commons/GameMode";
import { gamemods } from "../../../commons/gamemods";
import { getNow, msgtypes } from "../messages/sendMessage";
import { keyboardController } from "../controllers/KeyboardController"
import { mouseController } from "../controllers/MouseController"
import { mergeSortedArrays } from "../../../commons/util/mergeSortedArrays"
import { dom } from "../dom/dom";
import { getProtocol, ProtocolTypes } from "../../../commons/protocolLoader";
import { decodeFullMessage } from "../../../commons/util/decodeFullMessage";


const canvas = document.getElementById("play-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.oncontextmenu = e => {
	e.preventDefault();
};


function resizeCanvas() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
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

	constructor(
		private readonly gamemodeId: string,
		private readonly gamemode: GameMode,
		private readonly playerIdx: number,
		private readonly protocols: ProtocolTypes
	) {
		const gsize = this.gamemode.getSize();
		this.gameWidth = gsize.width;
		this.gameHeight = gsize.height;
		mouseController.setScreenCoordsAdapter(this.gamemode, playerIdx);
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

	private draw() {
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
		this.gamemode.draw(ctx, this.playerIdx);

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

	frame() {
		// Collect inputs
		const now = getNow();
		const newInputs = this.gamemode.collectInputs(
			keyboardController,
			mouseController
		).map(data => ({...data, timestamp: now}));
		this.userInputs.push(...newInputs);

		keyboardController.frame();

		this.gamemode.emulate(
			this.lastEmulation,
			now,
			newInputs.map(i => ({...i, player: this.playerIdx}))
		);
		this.lastEmulation = now;


		this.draw();

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
	const factory = gamemods[gamemode];
	if (!factory) {
		throw new Error(`Invalid gamemode '${gamemode}'`);
	}

	const protocols = getProtocol(gamemode);
	await protocols.load();

	_gameHandler = new GameHandler(
		gamemode,
		factory.client(startData, total),
		playerIdx,
		protocols.get()
	);
	_gameHandler.frame();

	dom.openPlay();

	return _gameHandler;
}

export function deleteGameHandler() {
	_gameHandler = null;
}

import type { GMJumpies } from "../../GMJumpies";
import type { Block } from "../Block";
import type { Player } from "../Player";
import { DEATH_TIME, HEIGHT, JUMP_COUNT, PLAYER_HP, WIDTH } from "../constants";
import { BlockClientData } from "./BlockVisuals";
import { Camera, getRoomTarget } from "./Camera";
import { LeveledBar } from "./LeveledBar";

/** Formats a time in seconds as m:ss. */
function showTime(time: number) {
	const seconds = Math.ceil(time);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Progress of the death transition, from 1 (start) to 0 (end). */
function deathTransitionCurve(ratio: number) {
	return Math.sin(ratio * Math.PI / 2);
}

/**
 * Everything specific to one client: HTML overlay, bars, camera, the client
 * data of each block, and the inputs already sent. None of this is ever shared.
 */
export class ClientData {
	firstFrame = true;

	readonly html: HTMLDivElement;
	private readonly time: HTMLDivElement;
	private readonly status: HTMLDivElement;

	readonly camera = new Camera();
	readonly blocks: Record<number, BlockClientData> = {};
	private lastRoom = -1;

	// Inputs are only sent when they change.
	lastMove = 0;
	lastFall = false;

	private readonly jumpBar = new LeveledBar({
		orientation: "vertical",
		x: 1500, y: 150, w: 30, h: 600,
		sections: ["#FFA800", "#FFD000", "#FFF200"],
		animColor: "#fffdce",
		borderColor: "black"
	});

	private readonly hpBar = new LeveledBar({
		orientation: "horizontal",
		x: 300, y: 100, w: 1000, h: 30,
		sections: ["#ff0044", "#ff002f", "#ff001a"],
		animColor: "#ffb1c5",
		borderColor: "black"
	});

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-jumpies-root");

		this.time = document.createElement("div");
		this.time.classList.add("game-jumpies-time");

		this.status = document.createElement("div");
		this.status.classList.add("game-jumpies-status");

		this.html.appendChild(this.time);
		this.html.appendChild(this.status);
	}

	/** Creates the client data of the blocks of the game. */
	initBlocks(blocks: Block[]) {
		for (const block of blocks) {
			this.blocks[block.id] = new BlockClientData(block);
		}
	}

	/** Reads the shared state: nothing here can change the game. */
	update(game: GMJumpies, playerIdx: number, dt: number) {
		const player = game.players[playerIdx];

		this.time.innerText = showTime(game.finishCooldown >= 0 ? game.finishCooldown : game.time);
		this.status.innerText = this.getStatus(game, player);

		this.hpBar.setRatio(player.hp / PLAYER_HP);
		this.jumpBar.setRatio(player.jumps / JUMP_COUNT);
		this.hpBar.update(dt);
		this.jumpBar.update(dt);

		this.updateCamera(game, player, dt);
	}

	/** Tells the player where they stand in the race. */
	private getStatus(game: GMJumpies, player: Player) {
		if (player.isFinished())
			return `Finished: #${player.finishRank + 1}`;

		return game.finishCooldown >= 0 ? "Hurry up!" : "";
	}

	/**
	 * Follows the player. Changing room starts the transition of the camera,
	 * except for a respawn, which is hidden by the death transition.
	 */
	private updateCamera(game: GMJumpies, player: Player, dt: number) {
		const room = game.stage.rooms[player.room];
		const target = getRoomTarget(player.x, player.y, room);

		if (this.lastRoom === player.room) {
			if (player.isAlive()) {
				this.camera.move(target.x, target.y);
			}
		} else if (this.lastRoom < 0 || player.deathCooldown >= 0) {
			this.camera.teleport(target.x, target.y);
		} else {
			this.camera.startTracker(target.x, target.y);
		}

		this.lastRoom = player.room;
		this.camera.update(player, dt);
	}

	/** Draws the bars, in screen coordinates. */
	drawBars(ctx: CanvasRenderingContext2D) {
		this.jumpBar.draw(ctx);
		this.hpBar.draw(ctx);
	}

	/** Draws the red curtain crossing the screen during a death, in screen coordinates. */
	drawDeathTransition(ctx: CanvasRenderingContext2D, cooldown: number) {
		if (cooldown < 0)
			return;

		const t = deathTransitionCurve(cooldown / DEATH_TIME);
		const width = WIDTH * 2 * Math.min(t, 1 - t);

		ctx.fillStyle = "#ff0044";
		if (t < 0.5) {
			ctx.fillRect(WIDTH - width, 0, width, HEIGHT);
		} else {
			ctx.fillRect(0, 0, width, HEIGHT);
		}
	}
}

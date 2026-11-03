import type { GMJumpies } from "../../GMJumpies";
import type { Block } from "../Block";
import type { Player } from "../Player";
import { DEATH_TIME, HEIGHT, JUMP_COUNT, PLAYER_HP, WIDTH } from "../constants";
import { BlockClientData } from "./BlockVisuals";
import { Camera, getRoomTarget } from "./Camera";
import { LeveledBar } from "./LeveledBar";

// The time is only shown when it becomes short.
const TIME_DISPLAY_LIMIT = 60;

/** Shows the seconds left, or nothing while there is enough time. */
function showTime(time: number) {
	return time < TIME_DISPLAY_LIMIT ? String(Math.ceil(time)) : "";
}

// Blue glow around the screen once the current player has arrived
const FINISH_GLOW_COLOR = "0, 150, 255";
const FINISH_GLOW_ALPHA = 0.55;
const FINISH_GLOW_PULSE = 0.1;
const FINISH_GLOW_SPEED = 2;
const FINISH_GLOW_FADE_IN = 1.5; // seconds for the glow to reach its full strength

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
	private readonly leaderboard: HTMLOListElement;
	private shownArrivals = 0;
	private glowTime = 0;
	private glowFade = 0; // 0 before the arrival, then grows up to 1

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

	constructor(private readonly playerColors: string[]) {
		this.html = document.createElement("div");
		this.html.classList.add("game-jumpies-root");

		this.time = document.createElement("div");
		this.time.classList.add("game-jumpies-time");

		this.status = document.createElement("div");
		this.status.classList.add("game-jumpies-status");

		this.leaderboard = document.createElement("ol");
		this.leaderboard.classList.add("game-jumpies-leaderboard");

		this.html.appendChild(this.time);
		this.html.appendChild(this.status);
		this.html.appendChild(this.leaderboard);
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

		this.time.innerText = showTime(
			game.finishCooldown >= 0 ? Math.min(game.finishCooldown, game.time) : game.time
		);
		this.status.innerText = this.getStatus(game, player);
		this.updateLeaderboard(game, playerIdx);
		this.glowTime += dt;
		this.glowFade = player.isFinished()
			? Math.min(1, this.glowFade + dt / FINISH_GLOW_FADE_IN)
			: 0;

		this.hpBar.setRatio(player.hp / PLAYER_HP);
		this.jumpBar.setRatio(player.jumps / JUMP_COUNT);
		this.hpBar.update(dt);
		this.jumpBar.update(dt);

		this.updateCamera(game, player, dt);
	}

	/** Lists the arrived players, by arrival order. Rebuilt only on a new arrival. */
	private updateLeaderboard(game: GMJumpies, playerIdx: number) {
		if (game.finishCount === this.shownArrivals)
			return;

		this.shownArrivals = game.finishCount;
		const arrived = game.players
			.filter(p => p.isFinished())
			.sort((a, b) => a.finishRank - b.finishRank);

		this.leaderboard.replaceChildren(...arrived.map(p => {
			const entry = document.createElement("li");
			const color = document.createElement("span");
			color.classList.add("game-jumpies-leaderboard-color");
			color.style.backgroundColor = this.playerColors[p.id % this.playerColors.length];

			entry.appendChild(color);
			entry.append(p.id === playerIdx ? "You" : `Player ${p.id + 1}`);
			return entry;
		}));
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

	/**
	 * Draws a pulsing blue glow on the borders of the screen, in screen coordinates.
	 * It appears progressively after the arrival.
	 */
	drawFinishGlow(ctx: CanvasRenderingContext2D) {
		if (this.glowFade <= 0)
			return;

		// Ease out: the glow comes fast, then settles softly.
		const fade = 1 - (1 - this.glowFade) ** 3;
		const pulse = FINISH_GLOW_ALPHA + FINISH_GLOW_PULSE * Math.sin(this.glowTime * FINISH_GLOW_SPEED);
		const alpha = pulse * fade;
		const gradient = ctx.createRadialGradient(
			WIDTH / 2, HEIGHT / 2, HEIGHT * 0.45,
			WIDTH / 2, HEIGHT / 2, WIDTH * 0.6
		);
		gradient.addColorStop(0, `rgba(${FINISH_GLOW_COLOR}, 0)`);
		gradient.addColorStop(1, `rgba(${FINISH_GLOW_COLOR}, ${alpha})`);

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
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

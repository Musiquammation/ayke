import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader, ImageLoaderFolder } from "../util/ImageLoader";

const protocols = getProtocol('crayzoll', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

// ---------------------------------------------------------------------------
// World constants. There is ONE single screen. World coordinates are centered:
// the screen covers x in [-WIDTH/2, WIDTH/2] and y in [-HEIGHT/2, HEIGHT/2].
// ---------------------------------------------------------------------------
const GRAVITY = 1100;
const WIDTH = 3600;
const HEIGHT = 2025;
const HALF_W = WIDTH / 2;
const HALF_H = HEIGHT / 2;

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
const WINNING_SCORE = 3;          // first team to win this many rounds wins the game
const ROUND_TIME = 60;            // max duration of a round (seconds)
const ROUND_BREAK = 1;            // pause between two rounds (seconds)
const PLAYER_DEAD_OPACITY = 0.6;  // opacity of "ghost" players (dead but still playing)

// Spawn layout (per team, each teammate is shifted by SPAWN_SLOT_GAP)
const SPAWN_X = WIDTH * 0.3;
const SPAWN_SLOT_GAP = 150;

// ---------------------------------------------------------------------------
// Gems
// ---------------------------------------------------------------------------
const GEM_SPAWN_INTERVAL = 1;     // one gem spawns at the center every second
const GEM_SPAWN_JUMP = 700;       // initial upward velocity of a gem
const GEM_SPAWN_VX = 400;         // random horizontal velocity is in [-GEM_SPAWN_VX, GEM_SPAWN_VX]
const GEM_GRAVITY = 900;
const GEM_RADIUS = 30;
const MAX_GEMS = 100;             // safety cap on the number of gems in the world

// ---------------------------------------------------------------------------
// Ball / projection
// ---------------------------------------------------------------------------
const BALL_BASE_SPEED = 1800;     // norm of a "normal" throw
const GEM_BOOST = 150;            // extra throw speed per gem owned by the thrower
const SPEED_REDUCTION = 700;      // the norm of a player's "effect" vector decreases by this per second

/**
 * Moves `value` towards `target` by at most `step` (never overshoots).
 */
function approach(value: number, target: number, step: number): number {
	if (value < target) return Math.min(target, value + step);
	return Math.max(target, value - step);
}

/**
 * The ball. It is thrown between players; when it hits an enemy of its
 * previous holder, its whole velocity is transferred to that enemy.
 */
class Ball {
	static readonly RADIUS = 40;
	static readonly SPAWN_JUMP = 300;
	static readonly GRAVITY = 500;
	static readonly OOB_TOP = 1500; // the ball may fly above the screen and come back

	x = 0;
	y = 0;
	vx = 0;
	vy = -Ball.SPAWN_JUMP;

	grabber = -1;
	prevGrabber = -1;

	/**
	 * Speed norm of the ball at the moment a teammate of the previous holder
	 * caught it (-1 = nothing saved). It is restored when that teammate throws.
	 */
	savedSpeed = -1;

	/** Current speed norm of the free ball. */
	speed() {
		return Math.hypot(this.vx, this.vy);
	}

	/** Applies gravity and moves the ball (does nothing while it is grabbed). */
	move(dt: number) {
		if (this.grabber >= 0) {
			return;
		}

		this.vy += Ball.GRAVITY * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;

		const minX = -HALF_W + Ball.RADIUS;
		const maxX = HALF_W - Ball.RADIUS;
		const minY = -HALF_H + Ball.RADIUS;
		const maxY = HALF_H - Ball.RADIUS;

		// Left / right walls
		if (this.x < minX) {
			this.x = minX;
			this.vx = Math.abs(this.vx);
		} else if (this.x > maxX) {
			this.x = maxX;
			this.vx = -Math.abs(this.vx);
		}

		// Top / bottom walls
		if (this.y < minY) {
			this.y = minY;
			this.vy = Math.abs(this.vy);
		} else if (this.y > maxY) {
			this.y = maxY;
			this.vy = -Math.abs(this.vy);
		}
	}

	/** Puts the ball back at the center of the screen with a small jump. */
	reset() {
		this.x = 0;
		this.y = 0;
		this.vx = 0;
		this.vy = -Ball.SPAWN_JUMP;
		this.grabber = -1;
		this.prevGrabber = -1;
		this.savedSpeed = -1;
	}

	/** Left/right/bottom: lost as soon as fully outside. Top: lost only very far away. */
	isOOB() {
		return (
			this.x < -HALF_W - Ball.RADIUS ||
			this.x > HALF_W + Ball.RADIUS ||
			this.y > HALF_H + Ball.RADIUS ||
			this.y < -HALF_H - Ball.OOB_TOP
		);
	}

	/** The current holder releases the ball (it remembers who held it). */
	removeGrabber() {
		if (this.grabber < 0)
			return;

		this.prevGrabber = this.grabber;
		this.grabber = -1;
	}

	/** Serializes the free-ball part of the state. */
	save() {
		return { x: this.x, y: this.y, vx: this.vx, vy: this.vy };
	}

	/** Loads the ball from a protobuf State. */
	load(obj: Fields) {
		if (obj.ball === 'freeBall') {
			this.x = obj.freeBall.x;
			this.y = obj.freeBall.y;
			this.vx = obj.freeBall.vx;
			this.vy = obj.freeBall.vy;
			this.grabber = -1;
		} else {
			this.grabber = obj.grabbedBall.owner;
		}

		this.prevGrabber = obj.prevBallGrabber;
		this.savedSpeed = obj.savedBallSpeed;
	}
}

/** A purple hexagonal gem. Collecting gems makes your throws faster. */
class Gem {
	constructor(
		public x: number,
		public y: number,
		public vx: number,
		public vy: number
	) {}

	/** Gravity only: gems keep flying through left/right/top. */
	move(dt: number) {
		this.vy += GEM_GRAVITY * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
	}

	/** Destroyed once it is completely below the screen. */
	isDestroyed() {
		return this.y > HALF_H + GEM_RADIUS;
	}

	save() {
		return { x: this.x, y: this.y, vx: this.vx, vy: this.vy };
	}
}

interface FixedTarget {
	x: number;
	y: number;
}

class Player {
	static readonly GRAB_GRAVITY = 900;
	static readonly SPEED = 1500;
	static readonly ACCELERATION = 10000;
	static readonly MIN_DECELERATION = 1000;
	static readonly SOFT_DECELERATION = 10000;
	static readonly QUICK_DECELERATION = 30000;
	static readonly JUMP = 800;
	static readonly SPAWN_JUMP = 90;
	static readonly WIDTH = 50;   // hit box
	static readonly HEIGHT = 100; // hit box and sprite height
	static readonly SPRITE_WIDTH = Player.WIDTH * 4 / 3; // sprite is wider than the hit box
	static readonly PUSH_DOWN = 1000;
	static readonly BOUNCE_X = 1000;
	static readonly BOUNCE_Y = 100;
	static readonly ALIVE_OOB_MARGIN_X = Player.SPRITE_WIDTH / 2;
	static readonly ALIVE_OOB_MARGIN_Y = Player.HEIGHT / 2;

	static readonly DEAD_OOB_MARGIN_X = -Player.WIDTH / 2;
	static readonly DEAD_OOB_MARGIN_Y = -Player.HEIGHT / 2;


	spawnX: number | null = null;
	spawnY: number | null = null;
	connected = true;

	/**
	 * -1 => alive.
	 * >= 0 => dead this round ("ghost"), the value tells if we were the 0th, 1st, ...
	 * of our team to die. Ghosts can still play (grab/throw the ball).
	 */
	alive = -1;

	vx = 0;         // velocity controlled by the player
	vy = -Player.SPAWN_JUMP;
	ex = 0;         // "effect" velocity given by a ball hit (Smash-like projection)
	ey = 0;
	dir = 0;
	pushDown = false;
	gems = 0;       // gems currently owned (lost on death, reset each round)
	deaths = 0;     // total deaths during the game (used for the final ranking)
	target: FixedTarget | null = null;
	team: 'red' | 'blue' = 'red';

	constructor(
		public x: number,
		public y: number
	) {}

	/** Sets the spawn position and the team (called once at game creation). */
	initSpawn(x: number, y: number, team: 'red' | 'blue') {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
		this.team = team;
	}

	isAlive() {
		return this.alive < 0;
	}

	/** Norm of the projection effect. */
	effectNorm() {
		return Math.hypot(this.ex, this.ey);
	}

	/** Puts the player back at its spawn for a new round. Inputs (dir, target...) are kept. */
	resetForRound() {
		this.x = this.spawnX ?? 0;
		this.y = this.spawnY ?? 0;
		this.vx = 0;
		this.vy = -Player.SPAWN_JUMP;
		this.ex = 0;
		this.ey = 0;
		this.alive = -1;
		this.gems = 0;
	}

	/** Horizontal acceleration / deceleration depending on the pressed direction. */
	private steerHorizontally(dt: number) {
		if (this.dir === 0) {
			this.vx = approach(this.vx, 0, Player.SOFT_DECELERATION * dt);
			return;
		}

		// Moving against the pressed direction: brake quickly
		if (Math.sign(this.vx) === -this.dir) {
			this.vx = approach(this.vx, 0, Player.QUICK_DECELERATION * dt);
			return;
		}

		const target = this.dir * Player.SPEED;
		if (Math.abs(this.vx) < Player.SPEED) {
			this.vx = approach(this.vx, target, Player.ACCELERATION * dt);
		} else {
			// Faster than the max speed: slowly go back to it
			this.vx = approach(this.vx, target, Player.MIN_DECELERATION * dt);
		}
	}

	/** The norm of the effect vector decreases linearly with time. */
	private decayEffect(dt: number) {
		const norm = this.effectNorm();
		if (norm <= 0) return;

		const newNorm = norm - SPEED_REDUCTION * dt;
		if (newNorm <= 0) {
			this.ex = 0;
			this.ey = 0;
		} else {
			const k = newNorm / norm;
			this.ex *= k;
			this.ey *= k;
		}
	}

	/**
	 * Advances the player physics. Ghosts (dead players) keep moving but
	 * collide against the screen borders instead of leaving the screen.
	 */
	move(dt: number, holdsBall: boolean) {
		this.steerHorizontally(dt);
		this.vy += (holdsBall ? Player.GRAB_GRAVITY : GRAVITY) * dt;
		this.decayEffect(dt);

		this.x += (this.vx + this.ex) * dt;
		this.y += (this.vy + this.ey) * dt;

		if (this.pushDown) {
			this.y += Player.PUSH_DOWN * dt;
		}
	}

	/** Keeps the hit box inside the screen and kills the velocity going outward. */
	clampToScreen() {
		const maxX = HALF_W - Player.WIDTH / 2;
		const maxY = HALF_H - Player.HEIGHT / 2;

		if (this.x < -maxX) { this.x = -maxX; this.vx = Math.max(0, this.vx); this.ex = Math.max(0, this.ex); }
		if (this.x > maxX) { this.x = maxX; this.vx = Math.min(0, this.vx); this.ex = Math.min(0, this.ex); }
		if (this.y < -maxY) { this.y = -maxY; this.vy = Math.max(0, this.vy); this.ey = Math.max(0, this.ey); }
		if (this.y > maxY) { this.y = maxY; this.vy = Math.min(0, this.vy); this.ey = Math.min(0, this.ey); }
	}

	/** True when the skin (sprite) is not visible at all anymore. */
	isOOB() {
		const marginX = this.isAlive()
			? Player.ALIVE_OOB_MARGIN_X
			: Player.DEAD_OOB_MARGIN_X;

		const marginY = this.isAlive()
			? Player.ALIVE_OOB_MARGIN_Y
			: Player.DEAD_OOB_MARGIN_Y;

		return (
			this.x < -HALF_W - marginX ||
			this.x > HALF_W + marginX ||
			this.y < -HALF_H - marginY ||
			this.y > HALF_H + marginY
		);
	}

	touchsBall(ball: Ball) {
		return collisions.RectCircle({
			x: this.x,
			y: this.y,
			w: Player.WIDTH,
			h: Player.HEIGHT,
		}, {
			x: ball.x,
			y: ball.y,
			r: Ball.RADIUS,
		});
	}

	/** Serializes everything that is not sent at game creation. */
	save() {
		return {
			x: this.x,
			y: this.y,
			vx: this.vx,
			vy: this.vy,
			ex: this.ex,
			ey: this.ey,
			dir: this.dir,
			alive: this.alive,
			deaths: this.deaths,
			gems: this.gems,
			pushDown: this.pushDown,
			connected: this.connected,

			...(this.target
				? { fixed: { x: this.target.x, y: this.target.y } }
				: { none: {} })
		};
	}

	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.ex = obj.ex;
		this.ey = obj.ey;
		this.dir = obj.dir;
		this.alive = obj.alive;
		this.deaths = obj.deaths;
		this.gems = obj.gems;
		this.pushDown = obj.pushDown;
		this.connected = obj.connected;

		this.target = obj.target === 'fixed'
			? { x: obj.fixed.x, y: obj.fixed.y }
			: null;
	}
}

// ---------------------------------------------------------------------------
// Client-only data (never shared, never needed by the simulation)
// ---------------------------------------------------------------------------

/** A "Smash Bros"-like KO effect played where a player left the screen. */
interface DeathFx {
	x: number;
	y: number;
	nx: number; // outward normal of the border that was crossed
	ny: number;
	start: number;
	team: 'red' | 'blue';
}

class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;
	skins: string[] = [];

	// Input helpers (used to avoid sending unchanged values)
	lastSentX = NaN;
	lastSentY = NaN;
	mobileDir = 0;
	mobileAiming = false;
	selfX = 0;
	selfY = 0;

	readonly html: HTMLDivElement;
	readonly time: HTMLDivElement;
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;
	readonly banner: HTMLDivElement;

	private clientWasDead = true;
	private spawnTime = performance.now();
	private youOpacity = 1;
	private lastDirs: Record<number, boolean> = {};
	private prevAlive: number[] = [];
	private deathFx: DeathFx[] = [];

	static readonly YOU_AFTER_SPAWN = 3000;
	static readonly YOU_NEAR_MATE_DISTANCE = 600;
	static readonly FADE_SPEED = 0.08;
	static readonly DEATH_FX_MS = 1000;
	static readonly SHAKE_MS = 350;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-crayzol-root");

		this.time = document.createElement("div");
		this.time.classList.add("game-crayzol-time");

		const scores = document.createElement("div");
		scores.classList.add("game-crayzol-scores");
		this.redScore = document.createElement("div");
		this.blueScore = document.createElement("div");
		this.redScore.classList.add("game-crayzol-red-score");
		this.blueScore.classList.add("game-crayzol-blue-score");

		const tiret = document.createElement("div");
		tiret.textContent = "-";

		scores.appendChild(this.redScore);
		scores.appendChild(tiret);
		scores.appendChild(this.blueScore);

		this.banner = document.createElement("div");
		this.banner.classList.add("game-crayzol-banner");

		this.html.appendChild(scores);
		this.html.appendChild(this.time);
		this.html.appendChild(this.banner);
	}

	/** Formats seconds as m:ss.s */
	static showTime(time: number) {
		const t = Math.max(0, time);
		const minutes = Math.floor(t / 60);
		const seconds = (t % 60).toFixed(1);

		return `${minutes}:${seconds.padStart(4, "0")}`;
	}

	/** Text displayed in the middle of the screen between rounds. */
	private static bannerText(game: GMCrayzoll) {
		if (game.breakTime <= 0 && !game.finished) return "";

		const who = game.lastRoundWinner === 1
			? "Red team"
			: game.lastRoundWinner === -1 ? "Blue team" : null;

		if (who === null) return "Draw!";
		return game.finished ? `${who} wins the game!` : `${who} wins the round!`;
	}

	/** Refreshes the DOM, detects deaths (for the KO animation) and keeps client state. */
	update(game: GMCrayzoll, playerIdx: number) {
		this.time.innerText = ClientData.showTime(game.time);
		this.redScore.innerText = String(game.redScore).padStart(2, "0");
		this.blueScore.innerText = String(game.blueScore).padStart(2, "0");

		const text = ClientData.bannerText(game);
		this.banner.innerText = text;
		this.banner.classList.toggle("game-crayzol-banner-visible", text !== "");

		// Detect alive -> dead transitions to trigger the KO animation
		for (const [i, p] of game.players.entries()) {
			const was = this.prevAlive[i] ?? -1;
			if (was < 0 && p.alive >= 0) {
				this.spawnDeathFx(p);
			}
			this.prevAlive[i] = p.alive;
		}

		// Local player
		const player = game.players[playerIdx];
		if (this.clientWasDead && player.alive < 0) {
			this.spawnTime = performance.now(); // show "You" again at each (re)spawn
		}
		this.clientWasDead = (player.alive >= 0);

		this.selfX = player.x;
		this.selfY = player.y;
	}

	/** Creates a KO effect at the border where the (now ghost) player was stopped. */
	private spawnDeathFx(p: Player) {
		const rx = Math.abs(p.x) / HALF_W;
		const ry = Math.abs(p.y) / HALF_H;

		let nx = 0;
		let ny = 0;
		if (rx >= ry) {
			nx = p.x < 0 ? -1 : 1;
		} else {
			ny = p.y < 0 ? -1 : 1;
		}

		this.deathFx.push({ x: p.x, y: p.y, nx, ny, start: performance.now(), team: p.team });
	}

	/** Screen shake offset, strong right after a KO. */
	getShake() {
		const now = performance.now();
		let amp = 0;
		for (const fx of this.deathFx) {
			const age = now - fx.start;
			if (age < ClientData.SHAKE_MS) {
				amp = Math.max(amp, 30 * (1 - age / ClientData.SHAKE_MS));
			}
		}

		return {
			x: (Math.random() * 2 - 1) * amp,
			y: (Math.random() * 2 - 1) * amp
		};
	}

	/** Draws a 5-branch star. */
	private static drawStar(
		ctx: CanvasRenderingContext2D,
		outer: number,
		inner: number,
		rotation: number
	) {
		ctx.beginPath();
		for (let i = 0; i < 10; i++) {
			const r = i % 2 === 0 ? outer : inner;
			const a = rotation + i * Math.PI / 5 - Math.PI / 2;
			const px = Math.cos(a) * r;
			const py = Math.sin(a) * r;
			if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
		}
		ctx.closePath();
	}

	/**
	 * Draws every running KO effect (light beam entering the screen, expanding
	 * ring, radial spikes and a spinning star). Drawn on top of everything.
	 */
	drawDeathFx(ctx: CanvasRenderingContext2D) {
		const now = performance.now();
		this.deathFx = this.deathFx.filter(fx => now - fx.start < ClientData.DEATH_FX_MS);

		for (const fx of this.deathFx) {
			const t = (now - fx.start) / ClientData.DEATH_FX_MS; // 0 -> 1
			const fade = 1 - t;
			const color = fx.team === 'red' ? '#ff4f99' : '#4f99ff';

			ctx.save();
			ctx.translate(fx.x, fx.y);

			// 1. Light beam pointing towards the inside of the screen
			ctx.save();
			ctx.rotate(Math.atan2(-fx.ny, -fx.nx));
			const beamLen = 1000 * Math.min(1, t * 4);
			const beamWidth = 160 * fade;
			const gradient = ctx.createLinearGradient(0, 0, beamLen, 0);
			gradient.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
			gradient.addColorStop(1, "rgba(255,255,255,0)");
			ctx.fillStyle = gradient;
			ctx.fillRect(0, -beamWidth / 2, beamLen, beamWidth);
			ctx.restore();

			// 2. Expanding ring in the team color
			ctx.globalAlpha = fade;
			ctx.strokeStyle = color;
			ctx.lineWidth = 30 * fade;
			ctx.beginPath();
			ctx.arc(0, 0, 40 + 450 * (1 - fade * fade), 0, Math.PI * 2);
			ctx.stroke();

			// 3. Radial spikes
			ctx.strokeStyle = "white";
			ctx.lineWidth = 10 * fade;
			for (let k = 0; k < 12; k++) {
				const a = k * Math.PI / 6 + t * 0.6;
				const r0 = 60 + 250 * t;
				const r1 = r0 + 140 * fade;
				ctx.beginPath();
				ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
				ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
				ctx.stroke();
			}

			// 4. Spinning KO star
			ctx.fillStyle = "white";
			ctx.strokeStyle = color;
			ctx.lineWidth = 8;
			ClientData.drawStar(ctx, 90 * (1 + t), 40 * (1 + t), t * Math.PI * 2);
			ctx.fill();
			ctx.stroke();

			ctx.restore();
		}
	}

	/** Opacity of the "You" label: shown after (re)spawn and near a teammate. */
	getYouAlpha(game: GMCrayzoll, playerIdx: number): number {
		const player = game.players[playerIdx];

		let shouldShow = performance.now() - this.spawnTime <= ClientData.YOU_AFTER_SPAWN;

		if (!shouldShow) {
			for (let i = 0; i < game.players.length; i++) {
				if (i === playerIdx) continue;

				const mate = game.players[i];
				if (mate.team !== player.team) continue;

				if (norm2(mate.x - player.x, mate.y - player.y) <=
					ClientData.YOU_NEAR_MATE_DISTANCE * ClientData.YOU_NEAR_MATE_DISTANCE) {
					shouldShow = true;
					break;
				}
			}
		}

		if (shouldShow) {
			this.youOpacity = Math.min(1, this.youOpacity + ClientData.FADE_SPEED);
		} else {
			this.youOpacity = Math.max(0, this.youOpacity - ClientData.FADE_SPEED);
		}

		return ClientData.animateOpacity(this.youOpacity);
	}

	static animateOpacity(x: number): number {
		const k = 5;
		return (1 - Math.exp(-k * x)) / (1 - Math.exp(-k));
	}

	/** Returns [column, row, lookLeft] of the skin sprite sheet. */
	getPlayerTextureCode(
		grabbing: boolean,
		player: Player,
		idx: number
	): [number, number, boolean] {
		let first: number;
		if (player.vy < -600) {
			first = 1;
		} else if (player.vy >= 0) {
			first = 2;
		} else {
			first = 0;
		}

		const second = grabbing ? 1 : 0;

		let third: boolean;
		if (player.dir === 0) {
			if (player.vx < 0) {
				third = true;
			} else if (player.vx > 0) {
				third = false;
			} else {
				third = this.lastDirs[idx] ?? false;
			}
		} else {
			third = player.dir < 0;
		}

		this.lastDirs[idx] = third;

		return [first, second, third];
	}
}


class TutorialData {
	private step = 0;

	constructor(private readonly game: GMCrayzoll) {}

	frame(dt: number, clock: number) {
		const player = this.game.players[0];
		const bot = this.game.players[1];

		// Keep the dummy bot in the air by making it hop when it gets low
		if (bot && bot.isAlive() && bot.y > 200) {
			bot.vy = -Player.JUMP;
		}

		if (!player.isAlive()) {
			this.step = 0; // restart
		}

		if (this.step === 0) {
			if (this.game.ball.grabber === 0 || this.game.ball.prevGrabber === 0) this.step = 1;
			return "Move and jump (arrow keys) to touch the ball";
		}

		if (this.step === 1) {
			if (bot && !bot.isAlive()) this.step = 2;
			return (
				"Aim with the mouse and click to throw the ball at the blue player.\n" +
				"A hit sends him flying: get him out of the screen!"
			);
		}

		if (this.step === 2) {
			if (player.gems >= 1) this.step = 3;
			return "Nice! Now grab the purple gems: each one makes your throws faster";
		}

		return ""; // no text to show
	}

	lockGame() {
		return false;
	}
}


function generateClientDom(unlockedSkins: string[]) {
	return {
		skin: Object.keys(GMCrayzoll.SKINS)[0],
		preferTeam: 0,
		SKINS: GMCrayzoll.SKINS,
		unlockedSkins: unlockedSkins,

		produce() {
			const {StartData} = protocols.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		},

		hasSkin(skin: string) {
			return this.unlockedSkins.includes(skin);
		},

		getIconPath: GameMode.getSkinIconPath
	};
}

/**
 * Checks for AABB collisions between all ALIVE players.
 * If a collision is found, projects the players in opposite directions.
 * Ghosts (dead players) do not collide with anybody.
 */
function applyCollisions(players: Player[]) {
	for (let i = 0; i < players.length; i++) {
		for (let j = i + 1; j < players.length; j++) {
			const p1 = players[i];
			const p2 = players[j];

			if (!p1.isAlive() || !p2.isAlive()) continue;

			const dx = p1.x - p2.x;
			const dy = p1.y - p2.y;

			if (Math.abs(dx) < Player.WIDTH && Math.abs(dy) < Player.HEIGHT) {
				const dist = Math.sqrt(dx * dx + dy * dy);

				// Fallback if both players are exactly on the same point
				const nx = dist === 0 ? 1 : dx / dist;
				const ny = dist === 0 ? 0 : dy / dist;

				p1.vx += nx * Player.BOUNCE_X;
				p1.vy += ny * Player.BOUNCE_Y;

				p2.vx -= nx * Player.BOUNCE_X;
				p2.vy -= ny * Player.BOUNCE_Y;
			}
		}
	}
}

/**
 * Computes the initial velocity of a projectile launched with speed norm N
 * (under gravity g) so that it reaches the point (X, Y) relative to its origin.
 * If the target cannot be reached, it returns a straight vector of norm N
 * towards the target with success = false.
 */
function getVectorToReachTarget(
	X: number,
	Y: number,
	N: number,
	g: number
): { x: number, y: number, success: boolean } {
	if (X === 0) {
		return { x: 0, y: Y > 0 ? N : -N, success: false };
	}

	const X2 = X * X;
	const Y2 = Y * Y;
	const N2 = N * N;
	const g2 = g * g;

	const delta = X2 * (N2 * N2 + 2 * N2 * g * Y - g2 * X2);

	function fail() {
		const n = N / Math.sqrt(X2 + Y2);
		return {x: X*n, y: Y*n, success: false};
	}

	if (delta < 0) {
		return fail();
	}

	const a = X2 + Y2;
	const b = -X2 * (N2 + g * Y);

	const S = (-b + Math.sqrt(delta)) / (2 * a);

	if (S <= 0) {
		return fail();
	}

	const v0 = Math.sign(X) * Math.sqrt(S);
	const w0 = (v0 / X) * (Y - (g * X2) / (2 * S));

	return { x: v0, y: w0, success: true };
}

/**
 * Draws the aiming guide: a target circle at the mouse position and the
 * predicted trajectory of a throw made with the speed norm `throwSpeed`.
 * `color`: team color (string) when holding the ball,
 *          true (black) when the ball can be grabbed, false (grey) otherwise.
 */
function drawAimGuide(
	ctx: CanvasRenderingContext2D,
	srcX: number,
	srcY: number,
	destX: number,
	destY: number,
	color: string | boolean,
	throwSpeed: number
) {
	let style: { width: number, color: string, radius: number, outline: boolean };
	if (color === true) {
		style = { width: 5, color: "black", radius: 5, outline: false };
	} else if (color === false) {
		style = { width: 4, color: "grey", radius: 4, outline: false };
	} else {
		style = { width: 10, color: color, radius: 10, outline: true };
	}

	// Strokes a path (with a black outline for team colors)
	const strokePath = (trace: () => void) => {
		if (style.outline) {
			ctx.beginPath();
			trace();
			ctx.lineWidth = style.width + 4;
			ctx.strokeStyle = "black";
			ctx.stroke();
		}

		ctx.beginPath();
		trace();
		ctx.lineWidth = style.width;
		ctx.strokeStyle = style.color;
		ctx.stroke();
	};

	// Target circle
	strokePath(() => ctx.arc(destX, destY, style.radius, 0, Math.PI * 2));

	const X = destX - srcX;
	const Y = destY - srcY;
	const velocity = getVectorToReachTarget(X, Y, throwSpeed, Ball.GRAVITY);

	// Unable to reach the target (or no speed at all): draw a straight line
	if (velocity.x === 0 || !velocity.success) {
		const distance = Math.sqrt(X * X + Y * Y);
		if (distance === 0) return;

		// Start 40 pixels away from the player
		const startX = srcX + X / distance * 40;
		const startY = srcY + Y / distance * 40;

		strokePath(() => {
			ctx.moveTo(startX, startY);
			ctx.lineTo(destX, destY);
		});
		return;
	}

	const g = Ball.GRAVITY;
	const T = X / velocity.x; // time needed to reach the target
	if (T <= 0) return;

	// Sample the parabola
	const steps = 50;
	const points: { x: number; y: number }[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = T * i / steps;
		points.push({
			x: srcX + velocity.x * t,
			y: srcY + velocity.y * t + (g / 2) * t * t
		});
	}

	// Skip the first 40 pixels (they are hidden by the player)
	let startIndex = 0;
	for (let i = 1; i < points.length; i++) {
		if (norm2(points[i].x - srcX, points[i].y - srcY) >= 40 * 40) {
			startIndex = i;
			break;
		}
	}

	strokePath(() => {
		ctx.moveTo(points[startIndex].x, points[startIndex].y);
		for (let i = startIndex + 1; i < points.length; i++) {
			ctx.lineTo(points[i].x, points[i].y);
		}
	});
}


/** Spawn position of the `slot`-th player (0, 1, ...) of a team. */
function getSpawnPosition(isRed: boolean, slot: number) {
	const x = SPAWN_X + slot * SPAWN_SLOT_GAP;
	return { x: isRed ? -x : x, y: 0 };
}


export class GMCrayzoll extends GameMode {
	static readonly types = {Player, Gem, Ball};

	static readonly DATA = {
		GRAVITY,
		WIDTH,
		HEIGHT
	};

	readonly players: Player[];
	readonly ball = new Ball();
	gems: Gem[] = [];
	redScore = 0;
	blueScore = 0;

	time = ROUND_TIME;    // remaining time of the current round
	breakTime = 0;        // > 0 => we are between two rounds
	gemTimer = GEM_SPAWN_INTERVAL;
	lastRoundWinner = 0;  // 1 = red, -1 = blue, 0 = draw / none yet
	finished = false;

	/**
	 * State of the shared pseudo random generator (mulberry32). The initial
	 * seed is sent at game creation (StartDataClient) and the state is part of
	 * save/load, so the server and every client generate the same numbers.
	 */
	rngState = 1;

	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0)
		);
	}

	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const {StartData, StartDataClient} = protocols.get();

		const game = new GMCrayzoll(total);

		// Seed of the shared random generator
		game.rngState = ((Math.random() * 0x100000000) >>> 0) || 1;

		function decode(i: number) {
			if (i < players.length)
				return decodeFullMessage(StartData.decode(players[i].data));

			return generateClientDom([]);
		}

		// Pre-decode all player messages once for performance
		const playerInfos = await Promise.all(
			game.players.map(async (p, i) => {
				const d = decode(i);
				let skin: string;
				const pseudo = i < players.length ? players[i].pseudo : null;
				if (pseudo !== null && GMCrayzoll.SKINS_IDS.includes(d.skin)) {
					if (await hasSkin('crayzoll', d.skin, pseudo)) {
						skin = d.skin as string;
					} else {
						skin = GMCrayzoll.SKINS_IDS[0];
					}
				} else {
					skin = GMCrayzoll.SKINS_IDS[0];
				}

				return {
					player: p,
					index: i,
					skin: skin,
					pref: d.preferTeam ?? 0
				}
			})
		);

		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);

		const assigned = new Array<boolean>(totalPlayers);
		let redCount = 0;
		let blueCount = 0;

		// Phase 1: Assign players with explicit valid preferences if team capacity allows
		for (let i = 0; i < totalPlayers; i++) {
			const info = playerInfos[i];
			if (info.pref === 1 && redCount < maxPerTeam) {
				assigned[info.index] = true; // Red
				redCount++;
			} else if (info.pref === -1 && blueCount < maxPerTeam) {
				assigned[info.index] = false; // Blue
				blueCount++;
			}
		}

		// Phase 2: Fill remaining slots by alternating to maintain balanced team sizes
		for (let i = 0; i < totalPlayers; i++) {
			if (assigned[i] !== undefined) continue;

			const isRed = redCount < blueCount || (redCount === blueCount && i % 2 === 0);
			if (isRed && redCount < maxPerTeam) {
				assigned[i] = true;
				redCount++;
			} else {
				assigned[i] = false;
				blueCount++;
			}
		}

		// Phase 3: Initialize spawn points based on final team assignments
		let redSlot = 0;
		let blueSlot = 0;
		for (const [i, p] of game.players.entries()) {
			const redTeam = assigned[i];
			const pos = getSpawnPosition(redTeam, redTeam ? redSlot++ : blueSlot++);
			p.initSpawn(pos.x, pos.y, redTeam ? 'red' : 'blue');
		}

		const data = StartDataClient.encode({
			seed: game.rngState,
			players: game.players.map((p, idx) => ({
				x: p.spawnX,
				y: p.spawnY,
				skin: playerInfos[idx].skin,
				isRed: p.team === 'red'
			}))
		}).finish();

		return {
			game,
			data
		}
	}

	static createClient(
		{data, origin}: MultiplayerClientEntry,
		total: number,
		_playerIdx?: number
	) {
		const game = new GMCrayzoll(total);
		const {StartData, StartDataClient} = protocols.get();
		const clientData = new ClientData();
		let skins: { [k: string]: string; };

		if (origin === 'server') {
			const {players, seed} = decodeFullMessage(StartDataClient.decode(data));
			game.rngState = seed || 1;

			const skinSet = new Set<string>();
			for (const [idx, p] of players.entries()) {
				game.players[idx].initSpawn(p.x, p.y, p.isRed ? 'red' : 'blue');
				clientData.skins.push(p.skin);
				skinSet.add(p.skin);
			}
			skins = Object.fromEntries(
				[...skinSet].map(key => ['skin-' + key, GameMode.getSkinTexturePath(key)])
			);

		} else { // origin === 'client' (tutorial / local game)
			const {skin} = decodeFullMessage(StartData.decode(data));
			game.rngState = ((Math.random() * 0x100000000) >>> 0) || 1;

			// Even indexes are red, odd indexes are blue
			let redSlot = 0;
			let blueSlot = 0;
			for (let i = 0; i < game.players.length; i++) {
				const isRed = i % 2 === 0;
				const pos = getSpawnPosition(isRed, isRed ? redSlot++ : blueSlot++);
				game.players[i].initSpawn(pos.x, pos.y, isRed ? 'red' : 'blue');
			}

			clientData.skins = Array.from(
				{length: game.players.length},
				() => GMCrayzoll.SKINS_IDS[0]
			);
			clientData.skins[0] = skin;

			skins = { ['skin-' + skin]: GameMode.getSkinTexturePath(skin) };
		}

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins
		};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly SKINS = {
		joe: "Joe",
		luck: "Luck",
		kwanita: "Kwanita",
		nooby: "Nooby",
		willy: "Willy"
	};
	static readonly SKINS_IDS = Object.keys(GMCrayzoll.SKINS);

	static readonly TEXTURES = {
		'ball': "/assets/games/airbasket/ball.png",
		'gem': "/assets/games/airbasket/gem.svg",
		'background': "/assets/games/airbasket/background.png",
		'skin-joe': GameMode.getSkinTexturePath('joe')
	};

	static readonly EXPLAINATION_SLIDES = [
		"0.png",
		"1.png",
		"2.png"
	];


	override init(): void {

	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
	}

	// -----------------------------------------------------------------------
	// Shared pseudo random generator
	// -----------------------------------------------------------------------

	/** Next number of the shared generator, in [0, 1). Advances rngState. */
	private nextRandom(): number {
		this.rngState = (this.rngState + 0x6D2B79F5) >>> 0;
		let t = this.rngState;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/** Random horizontal velocity in [-GEM_SPAWN_VX, GEM_SPAWN_VX]. */
	private nextGemVx(): number {
		return (this.nextRandom() * 2 - 1) * GEM_SPAWN_VX;
	}

	// -----------------------------------------------------------------------
	// Gems
	// -----------------------------------------------------------------------

	/** Spawns a gem at (x, y) with a jump and a pseudo random horizontal speed. */
	private spawnGem(x: number, y: number) {
		const vx = this.nextGemVx(); // always consume the generator (determinism)
		if (this.gems.length >= MAX_GEMS) return;

		this.gems.push(new Gem(x, y, vx, -GEM_SPAWN_JUMP));
	}

	/** Every GEM_SPAWN_INTERVAL seconds, a gem appears at the center of the screen. */
	private spawnGemsOverTime(dt: number) {
		this.gemTimer -= dt;
		while (this.gemTimer <= 0) {
			this.spawnGem(0, 0);
			this.gemTimer += GEM_SPAWN_INTERVAL;
		}
	}

	/** Moves gems and removes the ones that fell below the screen. */
	private moveGems(dt: number) {
		for (const gem of this.gems) {
			gem.move(dt);
		}
		this.gems = this.gems.filter(g => !g.isDestroyed());
	}

	/** Alive players collect the gems they touch (ghosts cannot). */
	private collectGems() {
		this.gems = this.gems.filter(gem => {
			for (const p of this.players) {
				if (!p.isAlive()) continue;

				const touched = collisions.RectCircle({
					x: p.x,
					y: p.y,
					w: Player.WIDTH,
					h: Player.HEIGHT,
				}, {
					x: gem.x,
					y: gem.y,
					r: GEM_RADIUS,
				});

				if (touched) {
					p.gems++;
					return false; // gem consumed
				}
			}
			return true;
		});
	}

	// -----------------------------------------------------------------------
	// Ball
	// -----------------------------------------------------------------------

	/**
	 * Speed norm used when `thrower` throws the ball:
	 * - while being projected: the norm of its effect vector (0 once cancelled),
	 * - else the saved speed if a teammate of the previous holder caught the ball,
	 * - else the base speed.
	 * In every case, GEM_BOOST * gems is added.
	 */
	getThrowSpeed(thrower: Player): number {
		const effect = thrower.effectNorm();

		let base: number;
		if (effect > 0) {
			base = effect;
		} else if (this.ball.savedSpeed >= 0) {
			base = this.ball.savedSpeed;
		} else {
			base = BALL_BASE_SPEED;
		}

		return base + GEM_BOOST * thrower.gems;
	}

	/** If the holder has an aim target, throws the ball towards it. */
	private processThrow() {
		if (this.ball.grabber < 0) return;

		const thrower = this.players[this.ball.grabber];
		if (!thrower.target) return;

		const dx = thrower.target.x - thrower.x;
		const dy = thrower.target.y - thrower.y;
		if (dx === 0 && dy === 0) return;

		const v = getVectorToReachTarget(dx, dy, this.getThrowSpeed(thrower), Ball.GRAVITY);
		this.ball.vx = v.x;
		this.ball.vy = v.y;
		this.ball.savedSpeed = -1;
		this.ball.removeGrabber();
	}

	/** A held ball follows its holder. */
	private attachBallToGrabber() {
		if (this.ball.grabber < 0) return;

		const grabber = this.players[this.ball.grabber];
		this.ball.x = grabber.x;
		this.ball.y = grabber.y;
	}

	/**
	 * Handles players touching the free ball:
	 * - alive ENEMY of the previous holder => hit: the whole ball velocity is
	 *   transferred to it as an "effect", and the ball goes back to the center,
	 * - enemy ghost => ignored (the ball goes through),
	 * - teammate of the previous holder => catches the ball, and the ball speed
	 *   is saved so it can be restored on the next throw,
	 * - anybody if nobody held the ball => grabs it.
	 * The previous holder cannot re-grab it, and two simultaneous grabbers cancel out.
	 */
	private resolveBallContacts() {
		if (this.ball.grabber >= 0) return;

		const prev = this.ball.prevGrabber >= 0 ? this.players[this.ball.prevGrabber] : null;

		let candidate = -1;
		let candidates = 0;

		for (const [i, p] of this.players.entries()) {
			if (i === this.ball.prevGrabber) continue;
			if (!p.touchsBall(this.ball)) continue;

			const isEnemy = prev !== null && p.team !== prev.team;
			if (isEnemy) {
				if (p.isAlive()) {
					this.hitPlayer(p);
					return;
				}
				continue; // enemy ghost: ignored
			}

			candidate = i;
			candidates++;
		}

		if (candidates === 1) {
			this.grabBall(candidate, prev);
		}
	}

	/** Player `idx` takes the ball; saves its speed if it comes from a teammate. */
	private grabBall(idx: number, prev: Player | null) {
		const fromMate = prev !== null && this.players[idx].team === prev.team;
		this.ball.savedSpeed = fromMate ? this.ball.speed() : -1;
		this.ball.vx = 0;
		this.ball.vy = 0;
		this.ball.grabber = idx;
	}

	/** Transfers the whole ball velocity to `target` (Smash-like projection). */
	private hitPlayer(target: Player) {
		target.ex += this.ball.vx;
		target.ey += this.ball.vy;

		// The projection replaces the player's own movement
		target.vx = 0;
		target.vy = 0;

		// The player hit by the ball now holds it.
		this.ball.grabber = this.players.indexOf(target);
		this.ball.prevGrabber = -1;
		this.ball.vx = 0;
		this.ball.vy = 0;
		this.ball.savedSpeed = -1;
	}

	// -----------------------------------------------------------------------
	// Rounds
	// -----------------------------------------------------------------------

	/** Kills a player: it becomes a ghost stuck against the screen border and drops its gems. */
	private killPlayer(idx: number) {
		const p = this.players[idx];

		// Rank of death inside the team (0 = first of the team to die)
		let rank = 0;
		for (const q of this.players) {
			if (q !== p && q.team === p.team && !q.isAlive()) rank++;
		}

		p.alive = rank;
		p.deaths++;

		// Put the ghost against the border of the screen
		p.clampToScreen();

		// Its gems appear on the map
		for (let k = 0; k < p.gems; k++) {
			this.spawnGem(p.x, p.y);
		}
		p.gems = 0;

		p.vx = 0;
		p.vy = 0;
		p.ex = 0;
		p.ey = 0;
	}

	/** Kills every alive player whose skin is completely out of the screen. */
	private killOutOfScreenPlayers() {
		for (const [idx, p] of this.players.entries()) {
			const isOOB = p.isOOB();

			if (!p.isAlive()) {
				p.clampToScreen();
			}
			if (!isOOB) {
				continue;
			}

			// Eject ball
			if (idx === this.ball.grabber) {
				this.ball.grabber = -1;
				const dx = -p.x;
				const dy = -p.y;
				const distance = Math.hypot(dx, dy);

				const BALL_EJECTION_SPEED = 1000;

				if (distance > 0) {
					this.ball.vx = dx / distance * BALL_EJECTION_SPEED;
					this.ball.vy = dy / distance * BALL_EJECTION_SPEED;
				} else {
					this.ball.vx = 0;
					this.ball.vy = 0;
				}
			}

			if (p.isAlive()) {
				this.killPlayer(idx);
			}

		}
	}

	private teamSize(team: 'red' | 'blue') {
		return this.players.filter(p => p.team === team).length;
	}

	private countAlive(team: 'red' | 'blue') {
		return this.players.filter(p => p.team === team && p.isAlive()).length;
	}

	private gemsHeld(team: 'red' | 'blue') {
		return this.players
			.filter(p => p.team === team && p.isAlive())
			.reduce((sum, p) => sum + p.gems, 0);
	}

	/** Timeout: most survivors wins, then most gems held, else draw. */
	private decideTimeoutWinner(): 'red' | 'blue' | null {
		const ra = this.countAlive('red');
		const ba = this.countAlive('blue');
		if (ra !== ba) return ra > ba ? 'red' : 'blue';

		const rg = this.gemsHeld('red');
		const bg = this.gemsHeld('blue');
		if (rg !== bg) return rg > bg ? 'red' : 'blue';

		return null;
	}

	/** Ends the round when a team is fully dead or when time is over. */
	private checkRoundEnd() {
		// Without opponents (e.g. solo test) there is no round logic
		if (this.teamSize('red') === 0 || this.teamSize('blue') === 0) return;

		const red = this.countAlive('red');
		const blue = this.countAlive('blue');

		if (red === 0 && blue === 0) {
			this.endRound(null);
		} else if (red === 0) {
			this.endRound('blue');
		} else if (blue === 0) {
			this.endRound('red');
		} else if (this.time <= 0) {
			this.time = 0;
			this.endRound(this.decideTimeoutWinner());
		}
	}

	/** Gives the point, then either finishes the game or starts the break. */
	private endRound(winner: 'red' | 'blue' | null) {
		this.lastRoundWinner = winner === 'red' ? 1 : winner === 'blue' ? -1 : 0;
		if (winner === 'red') this.redScore++;
		if (winner === 'blue') this.blueScore++;

		if (this.redScore >= WINNING_SCORE || this.blueScore >= WINNING_SCORE) {
			this.finished = true;
			this.breakTime = 0;
		} else {
			this.breakTime = ROUND_BREAK;
		}
	}

	/** Resets the whole arena for a new round (scores are kept). */
	private startRound() {
		for (const p of this.players) {
			p.resetForRound();
		}

		this.ball.reset();
		this.gems = [];
		this.gemTimer = GEM_SPAWN_INTERVAL;
		this.time = ROUND_TIME;
		this.breakTime = 0;
	}

	// -----------------------------------------------------------------------
	// Main loop
	// -----------------------------------------------------------------------

	/**
	 * NOTE: all randomness comes from the shared `rngState` (seed sent in
	 * StartDataClient and saved in State), so the optional random generator
	 * given by the engine is not needed.
	 */
	override run(dt: number, produceFinish: boolean): FinishGame | null {
		if (!this.finished) {
			if (this.breakTime > 0) {
				this.runBreak(dt);
			} else {
				this.runRound(dt);
			}
		}

		if (produceFinish && this.finished) {
			return this.produceFinish();
		}
		return null;
	}

	/** Between two rounds everything is frozen until the break is over. */
	private runBreak(dt: number) {
		this.breakTime -= dt;
		if (this.breakTime <= 0) {
			this.startRound();
		}
	}

	/** One simulation step of a running round. */
	private runRound(dt: number) {
		this.time -= dt;
		this.spawnGemsOverTime(dt);

		// Players
		for (const [idx, p] of this.players.entries()) {
			p.move(dt, idx === this.ball.grabber);
		}
		applyCollisions(this.players);

		// Ball
		this.processThrow();
		this.ball.move(dt);
		this.attachBallToGrabber();
		this.resolveBallContacts();

		// Gems
		this.moveGems(dt);
		this.collectGems();

		// Deaths and end of round
		this.killOutOfScreenPlayers();
		this.checkRoundEnd();
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		switch (input.action) {
			case 'right':
				player.dir = 1;
				break;

			case 'left':
				player.dir = -1;
				break;

			case 'stop':
				player.dir = 0;
				break;

			case 'jump':
				// Jump only if the ball is not held by this player
				if (this.ball.grabber !== playerIdx) {
					player.vy = -Player.JUMP;
				}
				break;

			case 'downOn':
				player.pushDown = true;
				break;

			case 'downOff':
				player.pushDown = false;
				break;

			case 'throwTarget':
				player.target = {
					x: input.throwTarget.x,
					y: input.throwTarget.y,
				};
				break;

			case 'throwOff':
				player.target = null;
				break;
		}
	}

	override collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		const throwTarget = mouse.getCoords();
		data.mouseX = throwTarget.x;
		data.mouseY = throwTarget.y;

		/** Keyboard left/right resolution (returns null when nothing changed). */
		function getMoveInput(): Fields|null {
			const r0 = keyboard.first('right');
			const l0 = keyboard.first('left');

			const right = {right: {}, action: 'right'};
			const left = {left: {}, action: 'left'};
			const stop = {stop: {}, action: 'stop'};

			if (r0 && !l0)
				return right;

			if (!r0 && l0)
				return left;

			if (r0 && l0)
				return stop;

			const rK = keyboard.killed('right');
			const lK = keyboard.killed('left');

			if (rK && lK)
				return stop;

			const r = keyboard.press('right');
			const l = keyboard.press('left');

			if (rK) {
				return l ? left : stop;
			}

			if (lK) {
				return r ? right : stop;
			}

			return null;
		}

		const inputs: Fields[] = [];

		// Left / Right
		const moveInput = getMoveInput();
		if (moveInput) {
			inputs.push(moveInput);
		}

		// Jump / Down
		if (keyboard.first('up')) {
			inputs.push({jump: {}, action: 'jump'});
		}

		if (keyboard.first('down')) {
			inputs.push({downOn: {}, action: 'downOn'});
		}

		if (keyboard.killed('down')) {
			inputs.push({downOff: {}, action: 'downOff'});
		}

		// Throw target (mouse): only send it when it changed
		if (mouse.press(0)) {
			if (mouse.first(0) || throwTarget.x !== data.lastSentX || throwTarget.y !== data.lastSentY) {
				inputs.push({throwTarget, action: 'throwTarget'});
				data.lastSentX = throwTarget.x;
				data.lastSentY = throwTarget.y;
			}
		} else if (mouse.killed(0)) {
			inputs.push({throwOff: {}, action: 'throwOff'});
			data.lastSentX = NaN;
			data.lastSentY = NaN;
		}

		if (mobile) {
			this.collectMobileInputs(mobile, data, inputs);
		}

		return inputs;
	}

	/** Mobile controls: "move" joystick, "aim" joystick (throws) and "jump" button. */
	private collectMobileInputs(
		mobile: IMobileController,
		data: ClientData,
		inputs: Fields[]
	) {
		// Movement: only send when the direction changes
		const move = mobile.getJoystick('move');
		const dir = move.x > 0.3 ? 1 : move.x < -0.3 ? -1 : 0;
		if (dir !== data.mobileDir) {
			data.mobileDir = dir;
			inputs.push(
				dir === 1 ? {right: {}, action: 'right'}
				: dir === -1 ? {left: {}, action: 'left'}
				: {stop: {}, action: 'stop'}
			);
		}

		if (mobile.first('jump')) {
			inputs.push({jump: {}, action: 'jump'});
		}

		// Aim: the joystick gives a direction, we aim far away in that direction
		const AIM_DISTANCE = 1200;
		const aim = mobile.getJoystick('aim');
		const norm = Math.hypot(aim.x, aim.y);
		if (norm > 0.3) {
			const target = {
				x: data.selfX + aim.x / norm * AIM_DISTANCE,
				y: data.selfY + aim.y / norm * AIM_DISTANCE
			};

			if (!data.mobileAiming || target.x !== data.lastSentX || target.y !== data.lastSentY) {
				inputs.push({throwTarget: target, action: 'throwTarget'});
				data.lastSentX = target.x;
				data.lastSentY = target.y;
			}
			data.mobileAiming = true;
			data.mouseX = target.x;
			data.mouseY = target.y;
		} else if (data.mobileAiming) {
			data.mobileAiming = false;
			data.lastSentX = NaN;
			data.lastSentY = NaN;
			inputs.push({throwOff: {}, action: 'throwOff'});
		}
	}

	// -----------------------------------------------------------------------
	// Drawing
	// -----------------------------------------------------------------------

	/** Background image + a red frame showing the "danger" border of the screen. */
	private drawBackground(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		ctx.drawImage(imageLoader.get('background'), -HALF_W, -HALF_H, WIDTH, HEIGHT);

		ctx.strokeStyle = "rgba(255, 80, 80, 0.5)";
		ctx.lineWidth = 6;
		ctx.strokeRect(-HALF_W, -HALF_H, WIDTH, HEIGHT);
	}

	private drawGems(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		const image = imageLoader.get('gem');
		for (const gem of this.gems) {
			ctx.drawImage(image, gem.x - GEM_RADIUS, gem.y - GEM_RADIUS, GEM_RADIUS * 2, GEM_RADIUS * 2);
		}
	}

	/** The ball is only drawn when it is free (a held ball is shown by the skin). */
	private drawBall(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		if (this.ball.grabber >= 0) return;

		ctx.drawImage(
			imageLoader.get('ball'),
			this.ball.x - Ball.RADIUS,
			this.ball.y - Ball.RADIUS,
			Ball.RADIUS * 2,
			Ball.RADIUS * 2
		);
	}

	/** Draws every player; ghosts are semi-transparent. */
	private drawPlayers(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder, data: ClientData) {
		for (const [idx, p] of this.players.entries()) {
			let [tx, ty, lookLeft] = data.getPlayerTextureCode(
				this.ball.grabber === idx,
				p,
				idx
			);

			if (p.team === 'red') {
				tx += 3;
			}

			const texture = imageLoader.get('skin-' + data.skins[idx]);
			const w = texture.width / 6;
			const h = texture.height / 4;
			const width = Player.SPRITE_WIDTH;

			ctx.save();
			ctx.globalAlpha = p.isAlive() ? 1 : PLAYER_DEAD_OPACITY;

			if (lookLeft) {
				ctx.translate(p.x + width / 2, p.y - Player.HEIGHT / 2);
				ctx.scale(-1, 1);
				ctx.drawImage(texture, tx * w, ty * h, w, h, 0, 0, width, Player.HEIGHT);
			} else {
				ctx.drawImage(
					texture, tx * w, ty * h, w, h,
					p.x - width / 2, p.y - Player.HEIGHT / 2, width, Player.HEIGHT
				);
			}

			ctx.restore();
		}
	}

	/** Trajectory preview of the local player. */
	private drawLocalAim(ctx: CanvasRenderingContext2D, playerIdx: number, data: ClientData) {
		const player = this.players[playerIdx];

		let color: string | boolean;
		if (this.ball.grabber === playerIdx) {
			color = player.team;
		} else {
			color = this.ball.prevGrabber !== playerIdx; // true = can grab the ball
		}

		drawAimGuide(
			ctx,
			player.x,
			player.y,
			data.mouseX,
			data.mouseY,
			color,
			this.getThrowSpeed(player)
		);
	}

	/**
	 * Draws texts above players: the gem counter (closest to the head) and the
	 * "You" label above it. Drawn AFTER all sprites so they are never hidden.
	 */
	private drawLabels(
		ctx: CanvasRenderingContext2D,
		imageLoader: ImageLoaderFolder,
		playerIdx: number,
		data: ClientData
	) {
		const gemImage = imageLoader.get('gem');
		const ICON = 36;

		ctx.font = "bold 40px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";

		for (const p of this.players) {
			const y = p.y - Player.HEIGHT / 2 - 30;
			const text = String(p.gems);
			const total = ICON + 6 + ctx.measureText(text).width;
			const startX = p.x - total / 2;

			ctx.save();
			ctx.globalAlpha = p.isAlive() ? 1 : PLAYER_DEAD_OPACITY;
			ctx.drawImage(gemImage, startX, y - ICON / 2, ICON, ICON);

			ctx.lineWidth = 6;
			ctx.strokeStyle = "#333";
			ctx.fillStyle = "white";
			ctx.strokeText(text, startX + ICON + 6, y);
			ctx.fillText(text, startX + ICON + 6, y);
			ctx.restore();
		}

		// "You" label
		const youAlpha = data.getYouAlpha(this, playerIdx);
		if (youAlpha > 0) {
			const p = this.players[playerIdx];

			ctx.save();
			ctx.globalAlpha = youAlpha;
			ctx.font = "bold 50px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "bottom";
			ctx.fillStyle = "white";
			ctx.strokeStyle = "#333";
			ctx.lineWidth = 8;

			const labelY = p.y - Player.HEIGHT / 2 - 60;
			ctx.strokeText("You", p.x, labelY);
			ctx.fillText("You", p.x, labelY);
			ctx.restore();
		}
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader,
		_addCamZ: number,
		_dt: number
	) {
		ctx.imageSmoothingEnabled = false;

		const imageLoader = _imageLoader.getFolder('crayzoll');

		const data = _data as ClientData;
		if (data.firstFrame) {
			data.firstFrame = false;
		}

		data.update(this, playerIdx);

		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		// The camera is fixed: world origin = center of the screen (+ KO shake)
		const shake = data.getShake();
		ctx.save();
		ctx.translate(WIDTH / 2 + shake.x, HEIGHT / 2 + shake.y);

		// Draw order = priority (last is on top)
		this.drawBackground(ctx, imageLoader);
		this.drawGems(ctx, imageLoader);
		this.drawBall(ctx, imageLoader);
		this.drawPlayers(ctx, imageLoader, data);
		this.drawLocalAim(ctx, playerIdx, data);
		this.drawLabels(ctx, imageLoader, playerIdx, data);
		data.drawDeathFx(ctx);

		ctx.restore();
	}

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	// -----------------------------------------------------------------------
	// Save / Load
	// -----------------------------------------------------------------------

	override save(): Uint8Array {
		const {State} = protocols.get();

		// Everything is shared (except data sent in createServ)
		const object: Fields = {
			players: this.players.map(p => p.save()),
			gems: this.gems.map(g => g.save()),
			prevBallGrabber: this.ball.prevGrabber,
			savedBallSpeed: this.ball.savedSpeed,
			time: this.time,
			breakTime: this.breakTime,
			gemTimer: this.gemTimer,
			redScore: this.redScore,
			blueScore: this.blueScore,
			lastRoundWinner: this.lastRoundWinner,
			finished: this.finished,
			rngState: this.rngState,
		};

		if (this.ball.grabber >= 0) {
			object.grabbedBall = {owner: this.ball.grabber};
		} else {
			object.freeBall = this.ball.save();
		}

		return State.encode(object).finish();
	}

	override load(data: Uint8Array): void {
		const {State} = protocols.get();
		const obj = State.decode(data);

		for (const [idx, player] of obj.players.entries()) {
			this.players[idx].load(player);
		}

		this.gems = obj.gems.map((g: Fields) => new Gem(g.x, g.y, g.vx, g.vy));

		this.ball.load(obj);

		this.time = obj.time;
		this.breakTime = obj.breakTime;
		this.gemTimer = obj.gemTimer;
		this.redScore = obj.redScore;
		this.blueScore = obj.blueScore;
		this.lastRoundWinner = obj.lastRoundWinner;
		this.finished = obj.finished;
		this.rngState = obj.rngState;
	}

	override getSize() {
		return {width: WIDTH, height: HEIGHT};
	}

	/** Screen coordinates -> world coordinates (fixed camera centered on the screen). */
	override evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;

		const ret = {
			x: x - WIDTH / 2,
			y: y - HEIGHT / 2
		};

		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;

		return ret;
	}

	override getMobileDesc(): MobileDescriptor {
		return {
			joysticks: {
				move: {x: 60, xp: 'left', y: 60, yp: 'bottom', size: 140, color: '#ffffff'},
				aim: {x: 60, xp: 'right', y: 60, yp: 'bottom', size: 140, color: '#ff9b7a'}
			},

			buttons: {
				jump: {x: 60, xp: 'right', y: 240, yp: 'bottom', size: 90, color: '#4f99ff'}
			}
		};
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	/**
	 * Final ranking. The winning team is first. Inside a team, players are
	 * sorted by number of deaths (fewer is better), then by their death order
	 * in the last round (`alive`: survivor > died later > died earlier).
	 */
	private produceFinish(): FinishGame {
		const redTeam: number[] = [];
		const blueTeam: number[] = [];
		const playerEqualities: number[] = [];

		for (const [idx, player] of this.players.entries()) {
			if (player.team === 'red') {
				redTeam.push(idx);
			} else {
				blueTeam.push(idx);
			}
		}

		// Survivors get Infinity, ghosts their death order (later = better)
		const survivalKey = (idx: number) => {
			const a = this.players[idx].alive;
			return a < 0 ? Infinity : a;
		};

		for (const team of [redTeam, blueTeam]) {
			team.sort((a, b) => {
				const pa = this.players[a];
				const pb = this.players[b];
				if (pa.deaths !== pb.deaths) return pa.deaths - pb.deaths;

				const ka = survivalKey(a);
				const kb = survivalKey(b);
				if (ka === kb) return 0;
				return ka > kb ? -1 : 1;
			});

			// Detect equalities between two consecutive players
			for (let i = 0; i < team.length - 1; i++) {
				const a = team[i];
				const b = team[i + 1];
				if (
					this.players[a].deaths === this.players[b].deaths &&
					survivalKey(a) === survivalKey(b)
				) {
					playerEqualities.push(a);
				}
			}
		}

		playerEqualities.sort((a, b) => a - b);

		// Sort teams
		let teams: number[][];
		const teamEqualities: number[] = [];

		if (this.redScore >= this.blueScore) {
			teams = [redTeam, blueTeam];
			if (this.redScore === this.blueScore) {
				teamEqualities.push(0);
			}
		} else {
			teams = [blueTeam, redTeam];
		}

		return {
			results: teams,
			teamEqualities,
			playerEqualities
		};
	}
}

import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader, ImageLoaderFolder } from "../util/ImageLoader";

const protocols = getProtocol('lavaBall', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

// =====================================================================
// CONSTANTS
// All gameplay-relevant magic numbers requested by the design doc are
// centralised here so they are easy to tune and to audit.
// =====================================================================

// -- Teams / players --------------------------------------------------
const TOTAL_PLAYERS = 4;
const PLAYERS_PER_TEAM = 2;

// -- Level / camera -----------------------------------------------------
const LEVEL_WIDTH = 1400;              // total horizontal play area (world units)
const SCREEN_HEIGHT = 900;             // vertical size of the visible window
const MAX_LEVEL_HEIGHT = 5000;         // a round instantly ends when yLevel reaches this

// -- Ball physics --------------------------------------------------------
const BALL_GRAVITY = 900;              // px/s^2, downward acceleration applied to the ball
const PLAYER_THROW_SPEED = 950;        // initial speed (px/s) imparted to a thrown ball
const BALL_RADIUS = 22;

// -- Obstacles -------------------------------------------------------------
const OBSTACLE_CHECK_INTERVAL = 0.85;  // seconds between "should I spawn an obstacle?" rolls
const OBSTACLE_SPAWN_DELAY = 1;        // seconds a WaitingObstacle waits before actually spawning
const OBSTACLE_SPAWN_CHANCE = 0.6;     // probability (per check) that an obstacle is queued
const OBSTACLE_MIN_SIZE = 40;
const OBSTACLE_MAX_SIZE = 110;
const OBSTACLE_MAX_SPEED = 140;
const OBSTACLE_MAX_ROTATION_SPEED = 2.5; // rad/s
const OBSTACLE_DESPAWN_MARGIN = SCREEN_HEIGHT * 3; // how far below yLevel an obstacle is culled

// -- Turn timing -----------------------------------------------------------
const TURN_WAIT1 = 1;                  // idle phase before aiming
const TURN_AIM = 3;                    // aiming phase duration
const TURN_WAIT2 = 1;                  // idle phase after the throw
const TURN_DURATION = TURN_WAIT1 + TURN_AIM + TURN_WAIT2; // = 5s total, kept for reference/UI
const SLOWMO_MIN_SPEED = 0.2;          // game speed at the start of the aiming phase
const SLOWMO_MAX_SPEED = 1;            // game speed reached by the end of the aiming phase
const ROUND_END_DELAY = 3;             // seconds spent on the "round summary" screen

// -- Scoring -----------------------------------------------------------------
const LAST_STANDING_MULTIPLIER = 1.2;  // bonus multiplier for the sole survivor of a round
const WIN_SCORE = 10000;               // first player to reach this total score wins the match
const TOP_LEVEL_BONUS = 5000;          // instantly awarded to whoever reaches MAX_LEVEL_HEIGHT

// Turn phase identifiers. Kept as small integers so they serialize cheaply
// through protobuf (see TurnState.phase in lavaBall.proto).
const enum TurnPhase {
	Wait1 = 0,
	Aim = 1,
	Wait2 = 2,
	RoundEnd = 3
}

const enum ObstacleKind {
	Rect = 0,
	Circle = 1
}

type Team = 'red' | 'blue';


// =====================================================================
// PROVIDED PHYSICS / RENDER HELPERS (copied verbatim from the design doc)
// =====================================================================

/**
 * Computes the initial velocity vector required for a projectile
 * starting at the origin (0, 0) to reach the target position (X, Y)
 * with an initial speed of N and a constant gravitational acceleration g.
 *
 * Returns success = true when a valid ballistic trajectory exists.
 * When no valid trajectory can be found, returns a fallback vector
 * pointing approximately toward the target.
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
		return { x: X * n, y: Y * n, success: false };
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
 * Draws an aiming trajectory (curve or straight fallback line) plus a
 * target marker, from (srcX, srcY) to (destX, destY).
 * `color` follows the same tri-state convention as the design doc:
 *  - true  => "self" style (black, thick)
 *  - false => "other/ghost" style (grey, thin)
 *  - string => custom color with an outline (used here for team colors)
 */
function drawPlayerToTarget(
	ctx: CanvasRenderingContext2D,
	srcX: number,
	srcY: number,
	destX: number,
	destY: number,
	color: string | boolean
) {
	const X = destX - srcX;
	const Y = destY - srcY;

	let radius: number;
	let lineWidth: number;
	let outline = false;

	if (color === true) {
		lineWidth = 5;
		ctx.strokeStyle = "black";
		color = "black";
		radius = 5;
	} else if (color === false) {
		lineWidth = 4;
		ctx.strokeStyle = "grey";
		color = "grey";
		radius = 4;
	} else {
		lineWidth = 10;
		ctx.strokeStyle = color;
		radius = 10;
		outline = true;
	}

	// Draw target circle
	if (outline) {
		ctx.beginPath();
		ctx.arc(destX, destY, radius + 2, 0, Math.PI * 2);
		ctx.lineWidth = lineWidth + 4;
		ctx.strokeStyle = "black";
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(destX, destY, radius, 0, Math.PI * 2);
		ctx.lineWidth = lineWidth;
		ctx.strokeStyle = color;
		ctx.stroke();
	} else {
		ctx.beginPath();
		ctx.arc(destX, destY, radius, 0, Math.PI * 2);
		ctx.stroke();
	}

	const velocity = getVectorToReachTarget(
		X,
		Y,
		Player.THROW,
		Ball.GRAVITY
	);

	// Unable to calculate a valid trajectory
	if (velocity.x === 0 || !velocity.success) {
		const dx = destX - srcX;
		const dy = destY - srcY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance === 0) {
			return;
		}

		const startX = srcX + dx / distance * 40;
		const startY = srcY + dy / distance * 40;

		ctx.beginPath();
		ctx.moveTo(startX, startY);
		ctx.lineTo(destX, destY);

		if (outline) {
			ctx.lineWidth = lineWidth + 4;
			ctx.strokeStyle = "black";
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo(startX, startY);
			ctx.lineTo(destX, destY);

			ctx.lineWidth = lineWidth;
			ctx.strokeStyle = color;
			ctx.stroke();
		} else {
			ctx.stroke();
		}

		return;
	}

	const vx = velocity.x;
	const vy = velocity.y;
	const g = Ball.GRAVITY;

	const T = X / vx;

	if (T <= 0) {
		return;
	}

	const steps = 50;
	const points: { x: number; y: number }[] = [];

	for (let i = 0; i <= steps; i++) {
		const t = T * i / steps;

		const x = srcX + vx * t;
		const y = srcY + vy * t + (g / 2) * t * t;

		points.push({ x, y });
	}

	let startIndex = 0;

	for (let i = 1; i < points.length; i++) {
		const dx = points[i].x - srcX;
		const dy = points[i].y - srcY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance >= 40) {
			startIndex = i;
			break;
		}
	}

	const drawCurve = () => {
		ctx.beginPath();
		ctx.moveTo(points[startIndex].x, points[startIndex].y);

		for (let i = startIndex + 1; i < points.length; i++) {
			ctx.lineTo(points[i].x, points[i].y);
		}

		ctx.stroke();
	};

	if (outline) {
		ctx.lineWidth = lineWidth + 4;
		ctx.strokeStyle = "black";
		drawCurve();
	}

	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color as string;
	drawCurve();
}


// =====================================================================
// SLOW MOTION EASING
// =====================================================================

/**
 * Maps t in [0, TURN_AIM] to a game-speed multiplier in
 * [SLOWMO_MIN_SPEED, SLOWMO_MAX_SPEED], using a smoothstep curve so the
 * transition in and out of slow motion is progressive rather than an
 * instant jump. t = 0 is the very start of the aiming phase (slowest),
 * t = TURN_AIM is the moment the throw actually fires (back to normal).
 */
function getAimSpeedMultiplier(t: number): number {
	const clamped = Math.max(0, Math.min(TURN_AIM, t));
	const ratio = clamped / TURN_AIM;
	// Smoothstep: eases both ends of the transition (3t^2 - 2t^3).
	const eased = ratio * ratio * (3 - 2 * ratio);
	return SLOWMO_MIN_SPEED + (SLOWMO_MAX_SPEED - SLOWMO_MIN_SPEED) * eased;
}


// =====================================================================
// WORLD OBJECTS
// All of the classes below hold only SHARED, server-authoritative data.
// Nothing here is client-only: everything must survive save()/load() so
// that a load() mid-game never produces desynced/undefined behaviour.
// =====================================================================

/**
 * A hazard that moves through the level. Always drawn in red.
 * Rotation is purely cosmetic (collision uses an axis-aligned box).
 */
class Obstacle {
	constructor(
		public id: number,
		public kind: ObstacleKind,
		public x: number,
		public y: number,
		public w: number,       // width (rect) or radius (circle)
		public h: number,       // height (rect only, unused for circle)
		public vx: number,
		public vy: number,
		public rotation: number,
		public rotationSpeed: number,
		public gravityAffected: boolean
	) {}

	/** Advances the obstacle by dt seconds, scaled by the current game speed. */
	move(dt: number, speedMultiplier: number) {
		const sdt = dt * speedMultiplier;

		if (this.gravityAffected) {
			this.vy -= BALL_GRAVITY * sdt;
		}

		this.x += this.vx * sdt;
		this.y += this.vy * sdt;
		this.rotation += this.rotationSpeed * sdt;
	}

	/** Whether this obstacle has drifted far enough below play to be culled. */
	isFarBelow(yLevel: number): boolean {
		return this.y < yLevel - OBSTACLE_DESPAWN_MARGIN;
	}

	/** Tests collision against the ball (always treated as a circle). */
	collidesWithBall(ball: Ball): boolean {
		const ballCircle = { x: ball.x, y: ball.y, r: BALL_RADIUS };

		if (this.kind === ObstacleKind.Rect) {
			const rect = { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
			return collisions.RectCircle(rect, ballCircle);
		}

		const circle = { x: this.x, y: this.y, r: this.w };
		return collisions.CircleCircle(circle, ballCircle);
	}
}

/**
 * An obstacle that has been decided upon but is not yet visible/solid.
 * Must be shared (see mission doc) so a load() mid-delay doesn't lose it.
 */
class WaitingObstacle {
	constructor(
		public kind: ObstacleKind,
		public x: number,
		public y: number,
		public w: number,
		public h: number,
		public vx: number,
		public vy: number,
		public gravityAffected: boolean,
		public timer: number // seconds remaining before it actually spawns
	) {}
}

/** The single shared ball thrown in turn by whichever player is active. */
class Ball {
	static readonly GRAVITY = BALL_GRAVITY;

	x = 0;
	y = 0;
	vx = 0;
	vy = 0;
	inFlight = false;

	/** Advances the ball by dt seconds and bounces it off the side walls. */
	move(dt: number, speedMultiplier: number) {
		if (!this.inFlight) {
			return;
		}

		const sdt = dt * speedMultiplier;

		this.vy -= Ball.GRAVITY * sdt;
		this.x += this.vx * sdt;
		this.y += this.vy * sdt;

		const half = LEVEL_WIDTH / 2;
		if (this.x < -half) {
			this.x = -half;
			this.vx = Math.abs(this.vx);
		} else if (this.x > half) {
			this.x = half;
			this.vx = -Math.abs(this.vx);
		}
	}

	/** Launches the ball from its current resting spot towards (targetX, targetY). */
	throwTo(targetX: number, targetY: number) {
		const rel = getVectorToReachTarget(
			targetX - this.x,
			targetY - this.y,
			Player.THROW,
			Ball.GRAVITY
		);

		this.vx = rel.x;
		this.vy = rel.y;
		this.inFlight = true;
	}

	/** Resets the ball to a resting position, ready to be thrown again. */
	restAt(x: number, y: number) {
		this.x = x;
		this.y = y;
		this.vx = 0;
		this.vy = 0;
		this.inFlight = false;
	}

	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.inFlight = obj.inFlight;
	}
}

/**
 * A single competitor. Holds ONLY shared/authoritative data: nothing
 * client-specific lives here (that belongs in ClientData).
 */
class Player {
	static readonly THROW = PLAYER_THROW_SPEED;

	team: Team = 'red';
	score = 0;
	connected = true;             // must be tracked as shared state (see onDisconnection)
	eliminatedThisRound = false;

	// Last aim target sent by this player's client. Used by ALL clients to
	// render the live trajectory preview while it is this player's turn.
	aimX = 0;
	aimY = 0;

	load(obj: Fields) {
		this.team = obj.team === 1 ? 'blue' : 'red';
		this.score = obj.score;
		this.connected = obj.connected;
		this.eliminatedThisRound = obj.eliminatedThisRound;
		this.aimX = obj.aimX;
		this.aimY = obj.aimY;
	}
}


// =====================================================================
// CLIENT-ONLY DATA
// =====================================================================

class ClientData {
	firstFrame = true;

	// Tracks the last aim position actually sent to the server, so
	// collectInputs() only emits a packet when the pointer has moved.
	lastSentAimX = Number.NaN;
	lastSentAimY = Number.NaN;

	readonly html: HTMLDivElement;
	readonly turnIndicator: HTMLDivElement;
	readonly scorePanel: HTMLDivElement;
	readonly timerLabel: HTMLDivElement;
	readonly roundBanner: HTMLDivElement;

	// Camera is always centered on (0, yLevel); no smoothing is required
	// per the mission doc, so we just mirror the authoritative value.
	cameraY = 0;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-lavaBall-root");

		this.turnIndicator = document.createElement("div");
		this.turnIndicator.classList.add("game-lavaBall-turn-indicator");

		this.scorePanel = document.createElement("div");
		this.scorePanel.classList.add("game-lavaBall-score-panel");

		this.timerLabel = document.createElement("div");
		this.timerLabel.classList.add("game-lavaBall-timer");

		this.roundBanner = document.createElement("div");
		this.roundBanner.classList.add("game-lavaBall-round-banner");

		this.html.appendChild(this.turnIndicator);
		this.html.appendChild(this.scorePanel);
		this.html.appendChild(this.timerLabel);
		this.html.appendChild(this.roundBanner);
	}

	/** Refreshes the DOM overlay (turn indicator, scores, timer) every frame. */
	update(game: GMLavaBall, playerIdx: number) {
		this.cameraY = game.yLevel;

		// Timer: show only the remaining whole/decimal seconds of the phase.
		this.timerLabel.innerText = game.turnPhaseTimer.toFixed(1) + "s";

		// Turn indicator: "1 2 3 4", self replaced by "M", colored by team,
		// current player underlined, eliminated players greyed but keeping
		// a visible trace of their team color.
		this.turnIndicator.innerHTML = "";
		for (let i = 0; i < game.players.length; i++) {
			const p = game.players[i];
			const span = document.createElement("span");
			span.classList.add("game-lavaBall-turn-slot");
			span.classList.add(p.team === 'red' ? "game-lavaBall-team-red" : "game-lavaBall-team-blue");

			if (p.eliminatedThisRound) {
				span.classList.add("game-lavaBall-eliminated");
			}
			if (i === game.turnCurrentPlayer) {
				span.classList.add("game-lavaBall-active-turn");
			}

			span.innerText = (i === playerIdx) ? "M" : String(i + 1);
			this.turnIndicator.appendChild(span);
		}

		// Score panel, always in player order 1..4.
		this.scorePanel.innerHTML = "";
		for (let i = 0; i < game.players.length; i++) {
			const p = game.players[i];
			const row = document.createElement("div");
			row.classList.add("game-lavaBall-score-row");
			row.classList.add(p.team === 'red' ? "game-lavaBall-team-red" : "game-lavaBall-team-blue");
			row.innerText = `P${i + 1}: ${Math.floor(p.score)}`;
			this.scorePanel.appendChild(row);
		}

		// Round-end banner.
		if (game.turnPhase === TurnPhase.RoundEnd) {
			this.roundBanner.innerText = `Round ${game.round} finished — next round starting...`;
			this.roundBanner.style.display = "block";
		} else {
			this.roundBanner.style.display = "none";
		}
	}
}


// =====================================================================
// MINIMAL TUTORIAL STUB
// =====================================================================

class TutorialData {
	constructor(private readonly game: GMLavaBall) {}

	frame(dt: number, clock: number) {
		return ""; // No guided tutorial text for this game mode.
	}
}


// =====================================================================
// PRE-GAME CLIENT DOM (produced by lavaBall.html via Alpine)
// =====================================================================

function generateClientDom() {
	return {
		preferTeam: 0,

		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({
				preferTeam: this.preferTeam
			}).finish();
		}
	};
}


// =====================================================================
// GAME MODE
// =====================================================================

export class GMLavaBall extends GameMode {
	static readonly types = { Player, Ball, Obstacle, WaitingObstacle };

	static readonly DATA = {
		LEVEL_WIDTH,
		SCREEN_HEIGHT,
		MAX_LEVEL_HEIGHT,
		BALL_GRAVITY,
		PLAYER_THROW_SPEED
	};

	readonly players: Player[];
	readonly ball = new Ball();

	obstacles: Obstacle[] = [];
	waitingObstacles: WaitingObstacle[] = [];
	nextObstacleId = 0;
	obstacleSpawnClock = 0;

	yLevel = 0;
	round = 0;
	gameFinished = false;

	// Turn state machine.
	turnCurrentPlayer = 0;
	turnPhase: TurnPhase = TurnPhase.Wait1;
	turnPhaseTimer = TURN_WAIT1;

	// Amount awarded to each player during the CURRENT round (0 while still
	// alive and undecided). Used to compute the "second place" bonus and to
	// accumulate into Player.score once a round concludes.
	private roundAward: number[] = [];

	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player()
		);
		this.roundAward = Array.from({ length: total }, () => 0);
	}

	// -------------------------------------------------------------
	// SETUP
	// -------------------------------------------------------------

	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();

		const game = new GMLavaBall(total);

		function decode(i: number) {
			if (i < players.length) {
				return decodeFullMessage(StartData.decode(players[i].data));
			}
			return generateClientDom();
		}

		const prefs = game.players.map((_, i) => decode(i).preferTeam ?? 0);

		// Balanced team assignment identical in spirit to the reference
		// example: honour explicit preferences first, then fill evenly.
		const maxPerTeam = Math.ceil(total / 2);
		const assignedRed = new Array<boolean>(total);
		let redCount = 0;
		let blueCount = 0;

		for (let i = 0; i < total; i++) {
			if (prefs[i] === 1 && redCount < maxPerTeam) {
				assignedRed[i] = true;
				redCount++;
			} else if (prefs[i] === -1 && blueCount < maxPerTeam) {
				assignedRed[i] = false;
				blueCount++;
			}
		}

		for (let i = 0; i < total; i++) {
			if (assignedRed[i] !== undefined) continue;
			const putRed = redCount < blueCount || (redCount === blueCount && i % 2 === 0);
			if (putRed && redCount < maxPerTeam) {
				assignedRed[i] = true;
				redCount++;
			} else {
				assignedRed[i] = false;
				blueCount++;
			}
		}

		for (let i = 0; i < total; i++) {
			game.players[i].team = assignedRed[i] ? 'red' : 'blue';
		}

		game.startRound();

		const data = StartDataClient.encode({
			players: game.players.map(p => ({
				team: p.team === 'red' ? 0 : 1
			}))
		}).finish();

		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		playerIdx: number
	) {
		const game = new GMLavaBall(total);
		const { StartData, StartDataClient } = protocols.get();
		const clientData = new ClientData();

		if (origin === 'server') {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
			for (const [idx, p] of players.entries()) {
				game.players[idx].team = p.team === 1 ? 'blue' : 'red';
			}
		} else {
			// origin === 'client': local preview before the server has spoken.
			// Alternate teams as a reasonable default guess.
			for (let i = 0; i < total; i++) {
				game.players[i].team = (i % 2 === 0) ? 'red' : 'blue';
			}
		}

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: {}
		};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly TEXTURES = {
		'ball': "/assets/games/lavaBall/ball.png",
		'obstacle-rect': "/assets/games/lavaBall/obstacle_rect.png",
		'obstacle-circle': "/assets/games/lavaBall/obstacle_circle.png",
		'background': "/assets/games/lavaBall/background.png",
		'platform': "/assets/games/lavaBall/platform.png"
	};

	override init(): void {
		// Round is already started by createServ(); nothing else to do here.
	}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	// -------------------------------------------------------------
	// ROUND MANAGEMENT
	// -------------------------------------------------------------

	/** Resets all round-local state and picks the first player to act. */
	private startRound() {
		this.round += 1;
		this.yLevel = 0;
		this.obstacles = [];
		this.waitingObstacles = [];
		this.nextObstacleId = 0;
		this.obstacleSpawnClock = 0;
		this.ball.restAt(0, 0);

		for (let i = 0; i < this.players.length; i++) {
			this.players[i].eliminatedThisRound = false;
			this.roundAward[i] = 0;
		}

		this.turnCurrentPlayer = this.firstAlivePlayer();
		this.turnPhase = TurnPhase.Wait1;
		this.turnPhaseTimer = TURN_WAIT1;
	}

	private firstAlivePlayer(): number {
		for (let i = 0; i < this.players.length; i++) {
			if (!this.players[i].eliminatedThisRound) return i;
		}
		return 0;
	}

	private aliveIndices(): number[] {
		const out: number[] = [];
		for (let i = 0; i < this.players.length; i++) {
			if (!this.players[i].eliminatedThisRound) out.push(i);
		}
		return out;
	}

	private nextAlivePlayer(after: number): number {
		const n = this.players.length;
		for (let step = 1; step <= n; step++) {
			const idx = (after + step) % n;
			if (!this.players[idx].eliminatedThisRound) return idx;
		}
		return after;
	}

	/** Eliminates a player, records their round award, and checks round-enders. */
	private eliminatePlayer(idx: number) {
		const player = this.players[idx];
		if (player.eliminatedThisRound) return;

		player.eliminatedThisRound = true;
		this.roundAward[idx] = this.yLevel;

		this.maybeEndRoundByElimination();
	}

	/** Ends the round instantly if only one competitor is left standing. */
	private maybeEndRoundByElimination() {
		const alive = this.aliveIndices();

		if (alive.length === 1) {
			const winner = alive[0];

			// "yLevelOfTheSecondPlayer": the best award among everyone else,
			// i.e. the last player eliminated before the winner.
			let secondBest = 0;
			for (let i = 0; i < this.players.length; i++) {
				if (i !== winner) secondBest = Math.max(secondBest, this.roundAward[i]);
			}

			this.roundAward[winner] = secondBest * LAST_STANDING_MULTIPLIER;
			this.endRound();
		} else if (alive.length === 0) {
			// Extremely unlikely (simultaneous elimination), but keep it safe.
			this.endRound();
		}
	}

	/** Ends the round because someone reached the top of the level. */
	private endRoundByTopReached(winnerIdx: number) {
		for (let i = 0; i < this.players.length; i++) {
			if (i === winnerIdx) {
				this.roundAward[i] = TOP_LEVEL_BONUS;
			} else if (!this.players[i].eliminatedThisRound) {
				// Non-eliminated players who did not reach the top get 0 this round.
				this.roundAward[i] = 0;
			}
			this.players[i].eliminatedThisRound = true;
		}
		this.endRound();
	}

	/** Commits round awards into cumulative scores and moves to the RoundEnd phase. */
	private endRound() {
		for (let i = 0; i < this.players.length; i++) {
			this.players[i].score += this.roundAward[i];
		}

		this.turnPhase = TurnPhase.RoundEnd;
		this.turnPhaseTimer = ROUND_END_DELAY;

		if (this.players.some(p => p.score >= WIN_SCORE)) {
			this.gameFinished = true;
		}
	}

	// -------------------------------------------------------------
	// OBSTACLES
	// -------------------------------------------------------------

	private tickObstacleSpawner(dt: number, speedMultiplier: number) {
		this.obstacleSpawnClock += dt * speedMultiplier;

		while (this.obstacleSpawnClock >= OBSTACLE_CHECK_INTERVAL) {
			this.obstacleSpawnClock -= OBSTACLE_CHECK_INTERVAL;

			if (Math.random() < OBSTACLE_SPAWN_CHANCE) {
				this.queueObstacle();
			}
		}

		// Advance the delay of every queued obstacle, spawning it once ready.
		const stillWaiting: WaitingObstacle[] = [];
		for (const w of this.waitingObstacles) {
			w.timer -= dt * speedMultiplier;
			if (w.timer <= 0) {
				this.spawnObstacle(w);
			} else {
				stillWaiting.push(w);
			}
		}
		this.waitingObstacles = stillWaiting;
	}

	/** Decides the shape/position/motion of a future obstacle and queues it. */
	private queueObstacle() {
		const kind = Math.random() < 0.5 ? ObstacleKind.Rect : ObstacleKind.Circle;
		const size = OBSTACLE_MIN_SIZE + Math.random() * (OBSTACLE_MAX_SIZE - OBSTACLE_MIN_SIZE);
		const gravityAffected = Math.random() < 0.5;

		// Obstacles always spawn outside the currently visible screen, above
		// the top edge, at a random horizontal position.
		const x = (Math.random() - 0.5) * LEVEL_WIDTH;
		const y = this.yLevel + SCREEN_HEIGHT / 2 + size;

		const vx = (Math.random() - 0.5) * 2 * OBSTACLE_MAX_SPEED;
		const vy = gravityAffected ? 0 : (Math.random() - 0.5) * 2 * OBSTACLE_MAX_SPEED;
		const rotationSpeed = (Math.random() - 0.5) * 2 * OBSTACLE_MAX_ROTATION_SPEED;

		this.waitingObstacles.push(new WaitingObstacle(
			kind, x, y, size, size, vx, vy, gravityAffected, OBSTACLE_SPAWN_DELAY
		));

		// Rotation speed is stored on the WaitingObstacle's `h` slot is NOT
		// reused here; instead we stash it via a closure-free trick: we just
		// recompute it identically at spawn time using the same seed is not
		// possible, so instead we simply carry it directly on spawn below.
		this.pendingRotationSpeeds.set(this.waitingObstacles[this.waitingObstacles.length - 1], rotationSpeed);
	}

	// Rotation speed isn't part of the shared WaitingObstacle payload (the
	// proto only stores what's needed to render/collide once spawned); we
	// keep a small local map to carry it across the spawn delay. This map
	// is purely a server-side convenience and never needs to be persisted:
	// on load(), any still-waiting obstacle simply gets a fresh rotation
	// speed, which is a harmless cosmetic difference.
	private pendingRotationSpeeds = new WeakMap<WaitingObstacle, number>();

	private spawnObstacle(w: WaitingObstacle) {
		const rotationSpeed = this.pendingRotationSpeeds.get(w) ?? (Math.random() - 0.5) * 2 * OBSTACLE_MAX_ROTATION_SPEED;
		this.pendingRotationSpeeds.delete(w);

		this.obstacles.push(new Obstacle(
			this.nextObstacleId++,
			w.kind,
			w.x,
			w.y,
			w.w,
			w.h,
			w.vx,
			w.vy,
			Math.random() * Math.PI * 2,
			rotationSpeed,
			w.gravityAffected
		));
	}

	private tickObstacles(dt: number, speedMultiplier: number) {
		const kept: Obstacle[] = [];
		for (const o of this.obstacles) {
			o.move(dt, speedMultiplier);
			if (!o.isFarBelow(this.yLevel)) {
				kept.push(o);
			}
		}
		this.obstacles = kept;
	}

	// -------------------------------------------------------------
	// MAIN LOOP
	// -------------------------------------------------------------

	override run(dt: number, produceFinish: boolean): FinishGame | null {
		if (this.gameFinished) {
			return produceFinish ? this.produceFinish() : null;
		}

		switch (this.turnPhase) {
			case TurnPhase.Wait1:
				this.tickObstacleSpawner(dt, 1);
				this.tickObstacles(dt, 1);
				this.ball.move(dt, 1);
				this.trackYLevel();

				this.turnPhaseTimer -= dt;
				if (this.turnPhaseTimer <= 0) {
					this.turnPhase = TurnPhase.Aim;
					this.turnPhaseTimer = TURN_AIM;
				}
				break;

			case TurnPhase.Aim: {
				// Elapsed time since the aim phase started, used for the
				// progressive slow-motion easing.
				const elapsed = TURN_AIM - this.turnPhaseTimer;
				const speed = getAimSpeedMultiplier(elapsed);

				this.tickObstacleSpawner(dt, speed);
				this.tickObstacles(dt, speed);
				this.ball.move(dt, speed);
				this.trackYLevel();
				this.checkCurrentPlayerDeath();

				this.turnPhaseTimer -= dt;
				if (this.turnPhaseTimer <= 0) {
					this.fireThrow();
					if (this.turnPhase === TurnPhase.Aim) {
						// Not diverted into RoundEnd by the throw itself.
						this.turnPhase = TurnPhase.Wait2;
						this.turnPhaseTimer = TURN_WAIT2;
					}
				}
				break;
			}

			case TurnPhase.Wait2:
				this.tickObstacleSpawner(dt, 1);
				this.tickObstacles(dt, 1);
				this.ball.move(dt, 1);
				this.trackYLevel();
				this.checkCurrentPlayerDeath();
				this.checkTopReached();

				this.turnPhaseTimer -= dt;
				// Even if the active player already died this turn, we still
				// honour the full cooldown before moving on (per the mission
				// doc: "the next turn must still begin only after the normal
				// cooldown has elapsed").
				if (this.turnPhaseTimer <= 0 && this.turnPhase === TurnPhase.Wait2) {
					this.advanceTurn();
				}
				break;

			case TurnPhase.RoundEnd:
				this.turnPhaseTimer -= dt;
				if (this.turnPhaseTimer <= 0) {
					if (this.gameFinished) {
						break;
					}
					this.startRound();
				}
				break;
		}

		if (produceFinish && this.gameFinished) {
			return this.produceFinish();
		}

		return null;
	}

	/** Keeps yLevel as the highest y ever reached by the ball. */
	private trackYLevel() {
		if (this.ball.y > this.yLevel) {
			this.yLevel = this.ball.y;
		}
	}

	/** Checks whether the currently active player's ball has died this frame. */
	private checkCurrentPlayerDeath() {
		if (this.turnPhase === TurnPhase.RoundEnd) return;
		const idx = this.turnCurrentPlayer;
		if (this.players[idx].eliminatedThisRound) return;
		if (!this.ball.inFlight) return;

		let dead = false;

		// Left the screen vertically.
		if (this.ball.y <= this.yLevel - SCREEN_HEIGHT / 2) {
			dead = true;
		}

		// Hit a red obstacle.
		if (!dead) {
			for (const o of this.obstacles) {
				if (o.collidesWithBall(this.ball)) {
					dead = true;
					break;
				}
			}
		}

		if (dead) {
			this.ball.inFlight = false;
			this.eliminatePlayer(idx);
		}
	}

	/** Checks whether the top of the level has just been reached. */
	private checkTopReached() {
		if (this.turnPhase === TurnPhase.RoundEnd) return;
		if (this.yLevel >= MAX_LEVEL_HEIGHT) {
			this.endRoundByTopReached(this.turnCurrentPlayer);
		}
	}

	/** Fires the current player's throw using their last known aim target. */
	private fireThrow() {
		const idx = this.turnCurrentPlayer;
		const player = this.players[idx];

		if (!player.eliminatedThisRound) {
			this.ball.restAt(this.ball.inFlight ? this.ball.x : this.ball.x, this.ball.inFlight ? this.ball.y : this.ball.y);
			this.ball.throwTo(player.aimX, player.aimY);
		}
	}

	/** Moves the turn state machine to the next living player. */
	private advanceTurn() {
		if (this.turnPhase === TurnPhase.RoundEnd) return; // already diverted

		const alive = this.aliveIndices();
		if (alive.length <= 1) {
			// Round-ending conditions are handled by eliminatePlayer(); if we
			// got here it means nobody was eliminated but the round is over
			// for another reason (shouldn't normally happen). Be defensive.
			return;
		}

		this.turnCurrentPlayer = this.nextAlivePlayer(this.turnCurrentPlayer);
		this.turnPhase = TurnPhase.Wait1;
		this.turnPhaseTimer = TURN_WAIT1;
		this.ball.restAt(this.ball.x, this.ball.y);
	}

	// -------------------------------------------------------------
	// INPUT
	// -------------------------------------------------------------

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];

		switch (input.action) {
			case 'aim':
				// Only meaningful while it is this player's turn, but storing
				// it unconditionally is harmless and keeps this function simple.
				player.aimX = input.aim.x;
				player.aimY = input.aim.y;
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
		const inputs: Fields[] = [];

		const coords = mouse.getCoords();

		// Only send the aim target when it actually changed, to avoid
		// spamming the network with redundant packets.
		if (coords.x !== data.lastSentAimX || coords.y !== data.lastSentAimY) {
			data.lastSentAimX = coords.x;
			data.lastSentAimY = coords.y;

			inputs.push({
				action: 'aim',
				aim: { x: coords.x, y: coords.y }
			});
		}

		return inputs;
	}

	// -------------------------------------------------------------
	// RENDERING
	// -------------------------------------------------------------

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = false;

		const imageLoader = _imageLoader.getFolder('lavaBall');
		const data = _data as ClientData;

		if (data.firstFrame) {
			data.firstFrame = false;
		}

		data.update(this, playerIdx);

		const width = SCREEN_HEIGHT * 1.6; // approximate viewport width in world units
		ctx.fillStyle = "#1a1a2e";
		ctx.fillRect(0, 0, width, SCREEN_HEIGHT);

		// Camera is centered on (0, yLevel). World Y grows upward, canvas Y
		// grows downward, so we flip the vertical axis on the way in.
		ctx.save();
		ctx.translate(width / 2, SCREEN_HEIGHT / 2);
		ctx.scale(1, -1);
		ctx.translate(0, -this.yLevel);

		this.drawObstacles(ctx, imageLoader);
		this.drawBall(ctx, imageLoader);
		this.drawAimPreview(ctx, playerIdx);

		ctx.restore();
	}

	private drawObstacles(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		ctx.fillStyle = "#ff0000"; // all obstacles are drawn in red

		for (const o of this.obstacles) {
			ctx.save();
			ctx.translate(o.x, o.y);
			ctx.rotate(o.rotation);

			if (o.kind === ObstacleKind.Rect) {
				ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
			} else {
				ctx.beginPath();
				ctx.arc(0, 0, o.w, 0, Math.PI * 2);
				ctx.fill();
			}

			ctx.restore();
		}
	}

	private drawBall(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		ctx.fillStyle = "#ffdd00";
		ctx.beginPath();
		ctx.arc(this.ball.x, this.ball.y, BALL_RADIUS, 0, Math.PI * 2);
		ctx.fill();
	}

	/** Draws the live aiming trajectory for whoever's turn it currently is. */
	private drawAimPreview(ctx: CanvasRenderingContext2D, playerIdx: number) {
		if (this.turnPhase !== TurnPhase.Aim) return;

		const active = this.players[this.turnCurrentPlayer];
		const isSelf = this.turnCurrentPlayer === playerIdx;
		const color = active.team === 'red' ? "#ff4d4d" : "#4d8bff";

		// Note: drawPlayerToTarget draws in the same (Y-up) coordinate
		// space we've already set up via ctx transforms above, so we can
		// feed world coordinates directly. Because the canvas Y axis is
		// flipped, arcs/circles still render correctly (they're symmetric).
		drawPlayerToTarget(
			ctx,
			this.ball.x,
			this.ball.y,
			active.aimX,
			active.aimY,
			isSelf ? true : color
		);
	}

	// -------------------------------------------------------------
	// PERSISTENCE
	// -------------------------------------------------------------

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const { State } = protocols.get();

		const object: Fields = {
			players: this.players.map(p => ({
				team: p.team === 'red' ? 0 : 1,
				score: p.score,
				connected: p.connected,
				eliminatedThisRound: p.eliminatedThisRound,
				aimX: p.aimX,
				aimY: p.aimY
			})),
			ball: {
				x: this.ball.x,
				y: this.ball.y,
				vx: this.ball.vx,
				vy: this.ball.vy,
				inFlight: this.ball.inFlight
			},
			obstacles: this.obstacles.map(o => ({
				id: o.id,
				kind: o.kind,
				x: o.x,
				y: o.y,
				w: o.w,
				h: o.h,
				vx: o.vx,
				vy: o.vy,
				rotation: o.rotation,
				rotationSpeed: o.rotationSpeed,
				gravityAffected: o.gravityAffected
			})),
			waitingObstacles: this.waitingObstacles.map(w => ({
				kind: w.kind,
				x: w.x,
				y: w.y,
				w: w.w,
				h: w.h,
				vx: w.vx,
				vy: w.vy,
				gravityAffected: w.gravityAffected,
				timer: w.timer
			})),
			turn: {
				currentPlayer: this.turnCurrentPlayer,
				phase: this.turnPhase,
				phaseTimer: this.turnPhaseTimer,
				round: this.round
			},
			yLevel: this.yLevel,
			nextObstacleId: this.nextObstacleId,
			obstacleSpawnClock: this.obstacleSpawnClock,
			gameFinished: this.gameFinished
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = decodeFullMessage(State.decode(data));

		for (let i = 0; i < this.players.length; i++) {
			this.players[i].load(obj.players[i]);
		}

		this.ball.load(obj.ball);

		this.obstacles = obj.obstacles.map((o: Fields) => new Obstacle(
			o.id, o.kind, o.x, o.y, o.w, o.h, o.vx, o.vy, o.rotation, o.rotationSpeed, o.gravityAffected
		));

		this.waitingObstacles = obj.waitingObstacles.map((w: Fields) => new WaitingObstacle(
			w.kind, w.x, w.y, w.w, w.h, w.vx, w.vy, w.gravityAffected, w.timer
		));

		this.turnCurrentPlayer = obj.turn.currentPlayer;
		this.turnPhase = obj.turn.phase;
		this.turnPhaseTimer = obj.turn.phaseTimer;
		this.round = obj.turn.round;

		this.yLevel = obj.yLevel;
		this.nextObstacleId = obj.nextObstacleId;
		this.obstacleSpawnClock = obj.obstacleSpawnClock;
		this.gameFinished = obj.gameFinished;

		// roundAward isn't persisted (it's only meaningful transiently while
		// resolving a round-ending elimination within a single frame), so we
		// simply reinitialize it. It gets repopulated immediately as needed.
		this.roundAward = this.players.map(() => 0);
		this.pendingRotationSpeeds = new WeakMap();
	}

	override getSize() {
		const width = SCREEN_HEIGHT * 1.6;
		return { width, height: SCREEN_HEIGHT };
	}

	override evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		_clientData: any
	) {
		const width = SCREEN_HEIGHT * 1.6;

		// Inverse of the draw() transform: translate to origin, undo the
		// Y-flip, then undo the camera offset.
		const ret = {
			x: x - width / 2,
			y: -(y - SCREEN_HEIGHT / 2) + this.yLevel
		};

		return ret;
	}

	override getMobileDesc(): MobileDescriptor {
		// Aiming is done via a raw pointer position (like the mouse), so no
		// joysticks or buttons are required for this game mode.
		return {
			joysticks: {},
			buttons: {}
		};
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	// -------------------------------------------------------------
	// FINISH
	// -------------------------------------------------------------

	private produceFinish(): FinishGame {
		const redIdx = this.players
			.map((p, i) => i)
			.filter(i => this.players[i].team === 'red')
			.sort((a, b) => this.players[b].score - this.players[a].score);

		const blueIdx = this.players
			.map((p, i) => i)
			.filter(i => this.players[i].team === 'blue')
			.sort((a, b) => this.players[b].score - this.players[a].score);

		const redTotal = redIdx.reduce((s, i) => s + this.players[i].score, 0);
		const blueTotal = blueIdx.reduce((s, i) => s + this.players[i].score, 0);

		let results: number[][];
		const teamEqualities: number[] = [];

		if (redTotal >= blueTotal) {
			results = [redIdx, blueIdx];
		} else {
			results = [blueIdx, redIdx];
		}
		if (redTotal === blueTotal) {
			teamEqualities.push(0);
		}

		// Player-level equalities: compare consecutive players in the
		// flattened result order.
		const flat = results.flat();
		const playerEqualities: number[] = [];
		for (let i = 0; i < flat.length - 1; i++) {
			if (this.players[flat[i]].score === this.players[flat[i + 1]].score) {
				playerEqualities.push(i);
			}
		}

		return { results, teamEqualities, playerEqualities };
	}
}

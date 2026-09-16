import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";
import { GameRandomGenerator } from "../util/GameRandomGenerator";

const protocols = getProtocol('lavaBall', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

/* ============================================================================
 * DESIGN NOTES (important assumptions taken to resolve ambiguities in spec)
 * ----------------------------------------------------------------------------
 * - World coordinate convention: Y INCREASES when going UP (not the usual
 *   canvas convention). This matches the spec formulas directly:
 *     yLevel = max(ball.y) over time  -> going "higher" means bigger y.
 *     ball.y <= yLevel - SCREEN_HEIGHT/2 -> ball fell behind the camera.
 *   Gravity therefore SUBTRACTS from vy every frame (vy -= GRAVITY*dt).
 *   When drawing on the <canvas> (which is Y-down), we flip manually via
 *   worldToScreen().
 *
 * - There is a SINGLE shared ball for the whole match. Players take turns
 *   throwing it, trying to push it as high as possible. If a player's turn
 *   ends in death (obstacle hit or falling off-screen), the ball is reset to
 *   the last "checkpoint" (the last platform it safely rested on) so the
 *   next player can continue the climb. The dying player is eliminated for
 *   the rest of the round and banks points equal to the yLevel reached so far.
 *
 * - Score is ACCUMULATED across rounds (never reset to 0), matching the
 *   requirement "preserving accumulated scores between rounds". The overall
 *   game ends as soon as any player's accumulated score reaches
 *   WIN_SCORE_LIMIT.
 *
 * - Platforms are procedurally generated ONCE by the server in createServ()
 *   and sent to clients as init data (StartDataClient), exactly like
 *   spawnX/spawnY in the reference example. They are NOT re-sent on every
 *   save() since they never change during the match (this matches "les
 *   données d'initialisation... ne doivent pas être recopiées à chaque
 *   save"). Rounds reuse the same platform layout; only the ball, obstacles,
 *   turn order and "eliminated" flags are reset between rounds.
 *
 * - Obstacles ARE fully dynamic runtime data (position/velocity/rotation
 *   change every frame due to physics) so, unlike platforms, they MUST be
 *   part of State and therefore fully synchronized through save()/load().
 *
 * - Rotating rectangle obstacles are collided against the ball using the
 *   provided axis-aligned collisions.RectCircle() helper (no true OBB
 *   rotation support was provided), which is an intentional simplification.
 * ==========================================================================*/


/* ============================================================================
 * GAMEPLAY CONSTANTS
 * All gameplay "magic numbers" requested by the spec are centralized here.
 * ==========================================================================*/

// --- World / camera ---------------------------------------------------------
const LEVEL_WIDTH = 1000;              // Horizontal play area width (world units)
const SCREEN_HEIGHT = 1200;            // Vertical size of the camera viewport
const MAX_LEVEL_HEIGHT = 5000;         // Maximum height of a level (spec: "5000")

// --- Ball physics ------------------------------------------------------------
const BALL_GRAVITY = 1200;             // Gravity applied to the ball (world units/s^2)
const BALL_RADIUS = 26;                // Ball collision radius
const PLAYER_THROW_SPEED = 1650;       // Initial speed (N) used by getVectorToReachTarget

// --- Turn timing ---------------------------------------------------------
const TURN_WAIT_BEFORE = 1;            // Seconds of "do nothing" before aiming
const TURN_AIM_DURATION = 3;           // Seconds during which the player may aim/throw
const TURN_WAIT_AFTER = 1;             // Seconds of "do nothing" after the throw
const TURN_TOTAL_DURATION = TURN_WAIT_BEFORE + TURN_AIM_DURATION + TURN_WAIT_AFTER; // 5s

const SLOW_MOTION_MIN_SPEED = 0.1;     // Game speed multiplier at the deepest point of aiming

// --- Turn phases (kept as plain numeric constants so they can be stored in State int32) ---
const PHASE_WAIT_BEFORE = 0;
const PHASE_AIMING = 1;
const PHASE_WAIT_AFTER = 2;

// --- Scoring ---------------------------------------------------------
const LAST_SURVIVOR_MULTIPLIER = 1.2;  // Score multiplier for the last player standing
const WIN_SCORE_LIMIT = 10000;         // First player to reach this total wins the whole game
const TOP_OF_LEVEL_BONUS = 5000;       // Instant bonus for reaching MAX_LEVEL_HEIGHT

// --- Rounds ---------------------------------------------------------
const ROUND_END_DELAY = 3;             // Seconds shown as "round over" screen before next round

// --- Obstacles ---------------------------------------------------------
const OBSTACLE_CHECK_INTERVAL = 0.65;  // Server checks whether to queue a new obstacle every 0.85s
const OBSTACLE_SPAWN_DELAY = 0.5;      // Delay between "waiting" obstacle selection and actual spawn
const OBSTACLE_SPAWN_CHANCE = 0.65;    // Probability of actually spawning something on a given check
const OBSTACLE_SPAWN_YRANGE = 800;
const OBSTACLE_CLEANUP_MARGIN = SCREEN_HEIGHT; // Distance outside camera before an obstacle is removed
const OBSTACLE_GRAVITY = BALL_GRAVITY/3;

const OBSTACLE_RECT_MIN_SIZE = 60;
const OBSTACLE_RECT_MAX_SIZE = 140;
const OBSTACLE_RECT_MIN_ANGULAR_VEL = -3;
const OBSTACLE_RECT_MAX_ANGULAR_VEL = 3;

const OBSTACLE_CIRCLE_MIN_RADIUS = 30;
const OBSTACLE_CIRCLE_MAX_RADIUS = 70;

const OBSTACLE_MIN_SPEED = 80;
const OBSTACLE_MAX_SPEED = 260;


// --- Level generation (platforms) ---------------------------------------------------------
const PLATFORM_MIN_GAP = 180;          // Minimal vertical gap between two consecutive platforms
const PLATFORM_MAX_GAP = 520;          // Maximal vertical gap between two consecutive platforms
const PLATFORM_MIN_WIDTH = 140;
const PLATFORM_MAX_WIDTH = 280;
const PLATFORM_HEIGHT = 30;
const PLATFORM_X_MARGIN = 60;          // Keeps platforms from touching the side walls
const START_PLATFORM_WIDTH = 360;      // The very first platform is wide & centered, for fairness

// --- Colors ---------------------------------------------------------
const TEAM_COLORS = { red: '#ff4444', blue: '#4477ff' } as const;
const OBSTACLE_COLOR = '#ff0000';      // "All obstacles must be drawn in red"
const ELIMINATED_GREY = '#888888';


/* ============================================================================
 * PURE HELPER FUNCTIONS (math / physics, provided or derived from the spec)
 * ==========================================================================*/

/**
 * Maps aiming-phase local time t in [0, TURN_AIM_DURATION] to a game speed
 * multiplier in [SLOW_MOTION_MIN_SPEED, 1]. The curve starts and ends at 1
 * (normal speed, smooth entry/exit) and dips down to SLOW_MOTION_MIN_SPEED
 * exactly at the midpoint of the aiming phase, using a cosine for a smooth,
 * non-instantaneous transition in both directions.
 */
function aimSpeedScale(t: number): number {
	if (t < TURN_AIM_DURATION) {
		return SLOW_MOTION_MIN_SPEED;
	}

	return 1;
}

/**
 * Computes the initial velocity vector required for a projectile starting at
 * the origin (0, 0) to reach the target position (X, Y) with initial speed N
 * and constant gravitational acceleration g. Returns a fallback vector
 * pointing roughly at the target when no valid ballistic solution exists.
 * (Provided verbatim by the spec.)
 */
function getVectorToReachTarget(
	X: number,
	Y: number,
	N: number,
	g: number
): { x: number; y: number; success: boolean } {
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
 * Draws the ballistic aiming trajectory from (srcX, srcY) to (destX, destY)
 * in whatever coordinate space the caller uses (we always call this with
 * SCREEN-space coordinates, see worldToScreen()). (Provided verbatim by the
 * spec, parameterized on Player.THROW / Ball.GRAVITY renamed to local
 * constants PLAYER_THROW_SPEED / BALL_GRAVITY.)
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

	const velocity = getVectorToReachTarget(X, Y, PLAYER_THROW_SPEED, -BALL_GRAVITY);

	if (velocity.x === 0 || !velocity.success) {
		const dx = destX - srcX;
		const dy = destY - srcY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance === 0) {
			return;
		}

		const startX = srcX + (dx / distance) * 40;
		const startY = srcY + (dy / distance) * 40;

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
	const g = BALL_GRAVITY;

	const T = X / vx;

	if (T <= 0) {
		return;
	}

	const steps = 50;
	const points: { x: number; y: number }[] = [];

	for (let i = 0; i <= steps; i++) {
		const t = (T * i) / steps;
		const x = srcX + vx * t;
		const y = srcY + vy * t - (g / 2) * t * t;
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


/* ============================================================================
 * DATA TYPES
 * ==========================================================================*/

type ObstacleType = 'rect' | 'circle';

/** A queued obstacle: parameters are already fully decided (for determinism)
 *  but it only becomes a real, collidable Obstacle after `timeLeft` elapses. */
interface WaitingObstacleData {
	id: number;
	type: ObstacleType;
	x: number;
	y: number;
	vx: number;
	vy: number;
	angle: number;
	angularVelocity: number;
	affectedByGravity: boolean;
	radius: number;
	w: number;
	h: number;
	timeLeft: number;
}

/** A live, collidable obstacle. Always drawn in red. */
class Obstacle {
	constructor(
		public id: number,
		public type: ObstacleType,
		public x: number,
		public y: number,
		public vx: number,
		public vy: number,
		public angle: number,
		public angularVelocity: number,
		public affectedByGravity: boolean,
		public radius: number,
		public w: number,
		public h: number
	) {}

	/** Advances physics for this obstacle by dt seconds (already speed-scaled). */
	move(dt: number) {
		if (this.affectedByGravity) {
			this.vy -= OBSTACLE_GRAVITY * dt;
		}
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.angle += this.angularVelocity * dt;
	}

	/** True when this obstacle is far enough from the camera to be garbage-collected. */
	isFarFrom(cameraY: number) {
		return (
			this.y < cameraY - SCREEN_HEIGHT / 2 - OBSTACLE_CLEANUP_MARGIN ||
			this.y > cameraY + SCREEN_HEIGHT / 2 + OBSTACLE_CLEANUP_MARGIN ||
			Math.abs(this.x) > LEVEL_WIDTH * 2
		);
	}

	/**
	 * Checks whether this (red, deadly) obstacle currently overlaps the ball.
	 * NOTE: rotation is ignored for the collision test (only the provided
	 * axis-aligned collisions.* helpers are available) - a documented
	 * simplification.
	 */
	collidesWithBall(ballX: number, ballY: number, ballRadius: number): boolean {
		if (this.type === 'circle') {
			return collisions.CircleCircle(
				{ x: this.x, y: this.y, r: this.radius },
				{ x: ballX, y: ballY, r: ballRadius }
			);
		}

		return collisions.RotatedRectCircle(
			{ x: this.x, y: this.y, w: this.w, h: this.h, angle: this.angle },
			{ x: ballX, y: ballY, r: ballRadius }
		);
	}
}

/** A static platform the ball can rest on between throws. */
interface Platform {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The single shared ball. */
class Ball {
	x = 0;
	y = 0;
	vx = 0;
	vy = 0;

	/** True while flying (thrown, not resting on a platform / at start). */
	inFlight = false;

	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.inFlight = obj.inFlight;
	}
}

/** Per-player persistent (shared) state. No client-only data here. */
class Player {
	isRed = true;
	connected = true;
	eliminated = false;
	score = 0;

	/** Last aimed target, kept in State so every client can render it. */
	aimX = 0;
	aimY = 0;
	aiming = false;
	askThrow = false;

	load(obj: Fields) {
		this.isRed = obj.isRed;
		this.connected = obj.connected;
		this.eliminated = obj.eliminated;
		this.score = obj.score;
		this.aimX = obj.aimX;
		this.aimY = obj.aimY;
		this.aiming = obj.aiming;
		this.askThrow = obj.askThrow;
	}
}


/* ============================================================================
 * CAMERA (client-side helper, follows the shared yLevel)
 * ==========================================================================*/

class Camera {
	/** Current vertical focus point, smoothly follows the authoritative yLevel. */
	y = 0;

	static readonly SCALE = 0.75;

	update(targetY: number, dt: number) {
		// Simple critically-damped-ish follow so the camera doesn't snap on
		// every tiny yLevel change (e.g. when the ball is still low in flight).
		const diff = targetY - this.y;
		this.y += diff * Math.min(1, dt * 4);
	}

	teleport(targetY: number) {
		this.y = targetY;
	}

	getCoords() {
		return { x: 0, y: this.y };
	}
}


/* ============================================================================
 * CLIENT-ONLY DATA (never saved/loaded, never simulated - ClientData exists
 * precisely so nothing here needs to survive a load()).
 * ==========================================================================*/

class ClientData {
	firstFrame = true;

	/** Last sent aim target, used to avoid re-sending identical inputs. */
	lastSentAimX: number | null = null;
	lastSentAimY: number | null = null;

	/**
	 * ID of the finger currently controlling the aim.
	 * This lets us distinguish a new touch from a finger that is still held.
	 */
	mobileAimTouchId: number | null = null;

	/**
	 * Whether the current mobile aim touch has already produced a throw.
	 */
	mobileAimTouchActive = false;

	readonly camera = new Camera();

	readonly html: HTMLDivElement;
	readonly turnIndicator: HTMLDivElement;
	readonly scoreBoard: HTMLDivElement;
	readonly timerLabel: HTMLDivElement;
	readonly roundBanner: HTMLDivElement;

	private readonly playerSlots: HTMLElement[] = [];
	private readonly scoreSlots: HTMLDivElement[] = [];

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-lavaBall-root");

		this.turnIndicator = document.createElement("div");
		this.turnIndicator.classList.add("game-lavaBall-turn-indicator");

		for (let i = 0; i < 4; i++) {
			const slot = document.createElement("span");
			slot.classList.add("game-lavaBall-turn-slot");
			this.turnIndicator.appendChild(slot);
			this.playerSlots.push(slot);
		}

		this.scoreBoard = document.createElement("div");
		this.scoreBoard.classList.add("game-lavaBall-scoreboard");

		for (let i = 0; i < 4; i++) {
			const row = document.createElement("div");
			row.classList.add("game-lavaBall-score-row");
			this.scoreBoard.appendChild(row);
			this.scoreSlots.push(row);
		}

		this.timerLabel = document.createElement("div");
		this.timerLabel.classList.add("game-lavaBall-timer");

		this.roundBanner = document.createElement("div");
		this.roundBanner.classList.add("game-lavaBall-round-banner");

		this.html.appendChild(this.turnIndicator);
		this.html.appendChild(this.scoreBoard);
		this.html.appendChild(this.timerLabel);
		this.html.appendChild(this.roundBanner);
	}

	/** Refreshes all DOM overlays from the authoritative game state. */
	update(game: GMLavaBall, playerIdx: number, dt: number) {
		// Turn indicator: "1 2 3 4", local player shown as "M", underline
		// whoever is currently playing, grey-out eliminated players while
		// keeping their team color visible via a colored underline/border.
		for (let i = 0; i < game.players.length; i++) {
			const player = game.players[i];
			const slot = this.playerSlots[i];
			const label = (i === playerIdx) ? "M" : String(i + 1);

			slot.textContent = label;
			slot.classList.toggle('is-turn', i === game.currentPlayer);
			slot.classList.toggle('is-eliminated', player.eliminated);
			slot.classList.toggle('is-red', player.isRed);
			slot.classList.toggle('is-blue', !player.isRed);
		}

		// Score board, always in player order 1..4.
		for (let i = 0; i < game.players.length; i++) {
			const player = game.players[i];
			const row = this.scoreSlots[i];
			row.textContent = `${i + 1}: ${Math.round(player.score)}`;
			row.classList.toggle('is-red', player.isRed);
			row.classList.toggle('is-blue', !player.isRed);
			row.classList.toggle('is-eliminated', player.eliminated);
		}

		// Timer: only the remaining whole seconds of the current turn.
		const remaining = Math.max(0, TURN_TOTAL_DURATION - game.turnTimer);
		this.timerLabel.textContent = game.roundEnding ? "" : String(Math.ceil(remaining));

		// Round banner, shown only during the end-of-round pause.
		this.roundBanner.textContent = game.roundEnding
			? (game.gameOver ? "Game over!" : "Round over - next round starting...")
			: "";
		this.roundBanner.classList.toggle('visible', game.roundEnding);

		// Camera smoothly follows the shared yLevel.
		this.camera.update(game.yLevel, dt);
	}
}


/* ============================================================================
 * TUTORIAL (very small, explains the throw mechanic)
 * ==========================================================================*/

class TutorialData {
	private step = 0;

	constructor(private readonly game: GMLavaBall) {}

	frame(dt: number, clock: number) {
		if (this.step === 0) {
			return "Aim with your mouse/finger, then click/tap to throw the ball!";
		}
		return "";
	}
}


/* ============================================================================
 * LEVEL GENERATION (procedural platforms)
 * ==========================================================================*/

/**
 * Procedurally builds a vertical chain of platforms from y=0 up to
 * MAX_LEVEL_HEIGHT. The first platform is wide and centered so every match
 * starts fairly. This is called ONCE per match by the server (createServ);
 * the resulting list is then shipped to clients as init data.
 */
function generatePlatforms(rng: GameRandomGenerator): Platform[] {
	const platforms: Platform[] = [];

	// Starting platform: always centered, extra wide for a safe first throw.
	platforms.push({ x: 0, y: 0, w: START_PLATFORM_WIDTH, h: PLATFORM_HEIGHT });

	let currentY = 0;
	while (currentY < MAX_LEVEL_HEIGHT) {
		currentY += PLATFORM_MIN_GAP + Math.random() * (PLATFORM_MAX_GAP - PLATFORM_MIN_GAP);
		if (currentY >= MAX_LEVEL_HEIGHT) break;

		const width = PLATFORM_MIN_WIDTH + Math.random() * (PLATFORM_MAX_WIDTH - PLATFORM_MIN_WIDTH);
		const halfRange = LEVEL_WIDTH / 2 - PLATFORM_X_MARGIN - width / 2;
		const x = (Math.random() * 2 - 1) * Math.max(0, halfRange);

		platforms.push({ x, y: currentY, w: width, h: PLATFORM_HEIGHT });
	}

	// One final platform right at the top, to make "reaching 5000" tangible.
	platforms.push({ x: 0, y: MAX_LEVEL_HEIGHT, w: START_PLATFORM_WIDTH, h: PLATFORM_HEIGHT });

	return platforms;
}

/** Finds the highest platform at or below a given y (used to compute checkpoints). */
function findPlatformBelow(platforms: Platform[], y: number): Platform {
	let best = platforms[0];
	for (const p of platforms) {
		if (p.y <= y + 1 && p.y > best.y) {
			best = p;
		}
	}
	return best;
}


/* ============================================================================
 * OBSTACLE GENERATION
 * ==========================================================================*/
/**
 * Randomly builds the full description of a new obstacle, ready to be
 * queued as a WaitingObstacleData.
 *
 * All randomness happens exactly once, at selection time, so the eventual
 * spawn is fully deterministic given the data stored in State
 * (no re-rolling on the client).
 */
function pickRandomObstacle(id: number, yLevel: number): WaitingObstacleData {
	const type: ObstacleType = Math.random() < 0.7 ? 'rect' : 'circle';
	const affectedByGravity = Math.random() < 0.5;

	let x: number;
	let y: number;
	let vx: number;
	let vy: number;

	const speed =
		OBSTACLE_MIN_SPEED +
		Math.random() * (OBSTACLE_MAX_SPEED - OBSTACLE_MIN_SPEED);

	{
		// Choose whether the obstacle enters from the left or the right.
		const fromLeft = Math.random() < 0.5;

		// Spawn slightly outside the visible horizontal area.
		// x = 0 is assumed to be the horizontal center of the screen.
		const spawnOffset = 120;

		x = fromLeft
			? -LEVEL_WIDTH / 2 - spawnOffset
			: LEVEL_WIDTH / 2 + spawnOffset;

		// Spawn at a random vertical position within the visible screen.
		y = yLevel + (Math.random() + .3) * OBSTACLE_SPAWN_YRANGE;

		// Make the obstacle always move toward the screen.
		// Left side  -> positive vx
		// Right side -> negative vx
		vx = fromLeft ? speed : -speed;

		// Gravity controls the vertical movement when enabled.
		// Otherwise, give the obstacle a small random vertical velocity.
		vy = affectedByGravity
			? 0
			: (Math.random() * 2 - 1) * speed * 0.5;
	}

	const radius =
		OBSTACLE_CIRCLE_MIN_RADIUS +
		Math.random() *
			(OBSTACLE_CIRCLE_MAX_RADIUS - OBSTACLE_CIRCLE_MIN_RADIUS);

	const size =
		OBSTACLE_RECT_MIN_SIZE +
		Math.random() *
			(OBSTACLE_RECT_MAX_SIZE - OBSTACLE_RECT_MIN_SIZE);

	const angularVelocity =
		OBSTACLE_RECT_MIN_ANGULAR_VEL +
		Math.random() *
			(OBSTACLE_RECT_MAX_ANGULAR_VEL -
				OBSTACLE_RECT_MIN_ANGULAR_VEL);

	return {
		id,
		type,
		x,
		y,
		vx,
		vy,
		angle: Math.random() * Math.PI * 2,
		angularVelocity: type === 'rect' ? angularVelocity : 0,
		affectedByGravity,
		radius,
		w: size,
		h: size * (0.5 + Math.random()),
		timeLeft: OBSTACLE_SPAWN_DELAY
	};
}


/* ============================================================================
 * CLIENT DOM CONFIGURATION (example.html -> data object)
 * ==========================================================================*/

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


/* ============================================================================
 * MAIN GAME MODE CLASS
 * ==========================================================================*/

export class GMLavaBall extends GameMode {
	static readonly types = { Player, Ball, Obstacle };

	static readonly DATA = {
		LEVEL_WIDTH,
		SCREEN_HEIGHT,
		MAX_LEVEL_HEIGHT,
		BALL_GRAVITY,
		BALL_RADIUS
	};

	static readonly generateClientDom = generateClientDom;

	static readonly TEXTURES = {
		'ball': "/assets/games/lavaBall/ball.png",
		'platform': "/assets/games/lavaBall/platform.png",
		'obstacle-rect': "/assets/games/lavaBall/obstacle_rect.png",
		'obstacle-circle': "/assets/games/lavaBall/obstacle_circle.png",
		'background': "/assets/games/lavaBall/background.png"
	};

	// --- Shared, saved state ---------------------------------------------------------
	readonly players: Player[];
	readonly ball = new Ball();

	/** Maximum ball.y ever reached during the CURRENT round. */
	yLevel = 0;

	/** yLevel recorded at the moment of the most recent elimination this round (used for the last-survivor bonus). */
	lastEliminatedYLevel = 0;

	currentPlayer = 0;
	turnPhase = PHASE_WAIT_BEFORE;
	turnTimer = 0;

	/** True once the current turn's ball has already been thrown (prevents double-throw / late auto-throw). */
	private thrownThisTurn = false;

	roundNumber = 0;
	roundEnding = false;
	roundEndTimer = 0;
	roundStartPlayer = 0;

	obstacles: Obstacle[] = [];
	waitingObstacles: WaitingObstacleData[] = [];
	obstacleSpawnTimer = 0;
	nextObstacleId = 0;

	gameOver = false;

	/** Checkpoint the ball respawns to after an elimination (last safe platform). Not part of State: fully derivable from the platform list + yLevel is NOT enough, so we DO store it explicitly below. */
	checkpointX = 0;
	checkpointY = 0;

	/** Init data only: never resaved (see design notes above). */
	platforms: Platform[] = [];

	private constructor(total: number) {
		super();
		this.players = Array.from({ length: total }, () => new Player());
	}

	/* ==========================================================================
	 * SERVER-SIDE MATCH SETUP
	 * ========================================================================*/

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

		// Resolve team preferences into a balanced 2v2 split, exactly like
		// the reference example (phase 1: honor explicit preferences while
		// capacity allows, phase 2: fill the rest alternating).
		const prefs = game.players.map((_, i) => decode(i).preferTeam ?? 0);
		const maxPerTeam = Math.ceil(total / 2);
		const assignedRed = new Array<boolean>(total);
		let redCount = 0, blueCount = 0;

		for (let i = 0; i < total; i++) {
			if (prefs[i] === 1 && redCount < maxPerTeam) {
				assignedRed[i] = true; redCount++;
			} else if (prefs[i] === -1 && blueCount < maxPerTeam) {
				assignedRed[i] = false; blueCount++;
			}
		}
		for (let i = 0; i < total; i++) {
			if (assignedRed[i] !== undefined) continue;
			const putRed = redCount < blueCount || (redCount === blueCount && i % 2 === 0);
			if (putRed && redCount < maxPerTeam) { assignedRed[i] = true; redCount++; }
			else { assignedRed[i] = false; blueCount++; }
		}

		for (let i = 0; i < total; i++) {
			game.players[i].isRed = assignedRed[i];
		}

		// Procedurally generate the level ONCE. This is init data.
		const rng = () => Math.random();
		game.platforms = generatePlatforms(rng);

		// Set up the very first round.
		game.startNewRound(/*firstRound*/ true);

		const data = StartDataClient.encode({
			players: game.players.map(p => ({ isRed: p.isRed })),
			platforms: game.platforms
		}).finish();

		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		playerIdx: number
	) {
		const game = new GMLavaBall(total);
		const { StartDataClient } = protocols.get();
		const clientData = new ClientData();

		if (origin === 'server') {
			const { players, platforms } = decodeFullMessage(StartDataClient.decode(data));
			for (const [idx, p] of players.entries()) {
				game.players[idx].isRed = p.isRed;
			}
			game.platforms = platforms;
		} else {
			// Local single-machine testing fallback: 2v2 alternating teams.
			for (let i = 0; i < total; i++) {
				game.players[i].isRed = (i % 2 === 0);
			}
			const rng = () => Math.random();
			game.platforms = generatePlatforms(rng);
		}

		game.startNewRound(true);
		clientData.camera.teleport(0);

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: {}
		};
	}

	/* ==========================================================================
	 * ROUND / TURN MANAGEMENT (server-authoritative)
	 * ========================================================================*/

	/** Resets everything needed for a fresh round, keeping accumulated scores. */
	private startNewRound(firstRound: boolean) {
		this.roundNumber++;
		this.yLevel = 0;
		this.lastEliminatedYLevel = 0;
		this.obstacles = [];
		this.waitingObstacles = [];
		this.obstacleSpawnTimer = 0;
		this.roundEnding = false;
		this.roundEndTimer = 0;

		for (const p of this.players) {
			p.eliminated = false;
			p.aiming = false;
		}

		// Rotate who starts, for fairness across rounds.
		this.roundStartPlayer = firstRound ? 0 : (this.roundStartPlayer + 1) % this.players.length;
		this.currentPlayer = this.firstAlivePlayerFrom(this.roundStartPlayer);

		this.resetBallToStart();
		this.beginTurn();
	}

	/** Puts the ball back on the starting platform, at rest. */
	private resetBallToStart() {
		const start = this.platforms.length > 0 ? this.platforms[0] : { x: 0, y: 0, w: 0, h: 0 };
		this.ball.x = start.x;
		this.ball.y = start.y + start.h / 2 + BALL_RADIUS;
		this.ball.vx = 0;
		this.ball.vy = 0;
		this.ball.inFlight = false;
		this.checkpointX = this.ball.x;
		this.checkpointY = this.ball.y;
	}

	/** Prepares the turn-timer/phase state for whoever is about to play. */
	private beginTurn() {
		this.turnPhase = PHASE_WAIT_BEFORE;
		this.turnTimer = 0;
		this.thrownThisTurn = false;
		this.players[this.currentPlayer].aiming = false;
		this.players[this.currentPlayer].askThrow = false;
	}

	private firstAlivePlayerFrom(start: number): number {
		for (let offset = 0; offset < this.players.length; offset++) {
			const idx = (start + offset) % this.players.length;
			if (!this.players[idx].eliminated) return idx;
		}
		return start;
	}

	/** Advances to the next non-eliminated player's turn. */
	private advanceTurn() {
		const next = this.firstAlivePlayerFrom((this.currentPlayer + 1) % this.players.length);
		this.currentPlayer = next;
		this.beginTurn();
	}

	private countAlive(): number {
		return this.players.filter(p => !p.eliminated).length;
	}

	/* ==========================================================================
	 * MAIN SIMULATION LOOP (server-authoritative)
	 * ========================================================================*/

	override init(): void {
		// Nothing extra: everything relevant is already initialized by
		// createServ()/createClient() -> startNewRound().
	}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	override run(
		dt: number,
		produceFinish: boolean,
		rng: GameRandomGenerator | null
	): FinishGame | null {
		if (this.gameOver) {
			return produceFinish ? this.produceFinish() : null;
		}

		if (this.roundEnding) {
			// The end-of-round pause runs at normal, unscaled speed - it's a
			// pure UI pause, no physics need to happen while it's shown.
			this.roundEndTimer -= dt;
			if (this.roundEndTimer <= 0) {
				this.startNewRound(false);
			}
			return null;
		}

		// 1) Compute this frame's game-speed multiplier from the CURRENT
		//    (pre-advance) turn phase/timer, exactly as it was during the
		//    frame we are simulating.
		const speedScale = this.computeSpeedScale();
		const scaledDt = dt * speedScale;

		// 2) Advance ball physics & obstacles using the slowed-down time.
		this.updateBall(scaledDt);
		if (rng) {
			this.updateObstacles(scaledDt, rng);
		}

		// Throw ball
		const currentPlayer = this.players[this.currentPlayer];
		if (currentPlayer.askThrow) {
			this.throwBall(currentPlayer.aimX, currentPlayer.aimY);
			this.turnPhase = PHASE_WAIT_AFTER;
			// Jump the timer to the boundary of the aiming window so the
			// remaining "wait after" cooldown still applies in full.
			this.turnTimer = Math.max(this.turnTimer, TURN_WAIT_BEFORE + TURN_AIM_DURATION);
			currentPlayer.askThrow = false;
		}

		// 3) Advance the turn timer using REAL time (the timer itself is
		//    what defines the slow-motion window, so it can't be scaled).
		this.turnTimer += dt;

		// 4) Auto-throw if the aiming window just closed without an explicit throw.
		if (this.turnPhase === PHASE_AIMING &&
			this.turnTimer >= TURN_WAIT_BEFORE + TURN_AIM_DURATION) {
			this.turnPhase = PHASE_WAIT_AFTER;
			if (!this.thrownThisTurn) {
				this.autoThrow();
			}
		} else if (this.turnPhase === PHASE_WAIT_BEFORE &&
			this.turnTimer >= TURN_WAIT_BEFORE) {
			this.turnPhase = PHASE_AIMING;
		}

		// 5) End of turn -> hand off to the next alive player.
		if (this.turnTimer >= TURN_TOTAL_DURATION) {
			this.advanceTurn();
		}

		// 6) Check win/round-end conditions triggered by what just happened.
		this.checkRoundEndConditions();

		if (this.gameOver && produceFinish) {
			return this.produceFinish();
		}
		return null;
	}

	/** Returns the game speed multiplier that applies RIGHT NOW, based on turn phase. */
	private computeSpeedScale(): number {
		if (this.turnPhase !== PHASE_AIMING) return 1;
		const localT = this.turnTimer - TURN_WAIT_BEFORE;
		return aimSpeedScale(localT);
	}

	/** Physics step for the shared ball: gravity, wall bounce, platform landing, obstacle collision. */
	private updateBall(dt: number) {
		if (!this.ball.inFlight) return;

		this.ball.vy -= BALL_GRAVITY * dt;
		this.ball.x += this.ball.vx * dt;
		this.ball.y += this.ball.vy * dt;

		// Bounce off the side walls.
		const limit = (LEVEL_WIDTH/2 - BALL_RADIUS) / Camera.SCALE;
		if (this.ball.x < -limit) {
			this.ball.x = -limit;
			this.ball.vx = Math.abs(this.ball.vx);
		} else if (this.ball.x > limit) {
			this.ball.x = limit;
			this.ball.vx = -Math.abs(this.ball.vx);
		}

		// Track the highest point ever reached this round.
		if (this.ball.y > this.yLevel) {
			this.yLevel = this.ball.y;
		}

		// Landing on a platform (only while falling, from above).
		if (this.ball.vy <= 0) {
			for (const platform of this.platforms) {
				const rect = { x: platform.x, y: platform.y, w: platform.w, h: platform.h };
				const circle = { x: this.ball.x, y: this.ball.y, r: BALL_RADIUS };
				const topOfPlatform = platform.y + platform.h / 2;

				if (collisions.RectCircle(rect, circle)) {
					this.ball.y = topOfPlatform + BALL_RADIUS;
					this.ball.vx = 0;
					this.ball.vy = 0;
					this.ball.inFlight = false;

					// This platform becomes the new checkpoint.
					this.checkpointX = this.ball.x;
					this.checkpointY = this.ball.y;
					break;
				}
			}
		}

		// Reaching the very top of the level ends the round immediately.
		if (this.ball.y >= MAX_LEVEL_HEIGHT) {
			this.handleTopOfLevelReached();
			return;
		}

		// Obstacle collision (deadly).
		for (const obstacle of this.obstacles) {
			if (obstacle.collidesWithBall(this.ball.x, this.ball.y, BALL_RADIUS)) {
				this.eliminateCurrentPlayer();
				return;
			}
		}

		// Falling behind the camera (off-screen below) is deadly too.
		if (this.ball.y <= this.yLevel - SCREEN_HEIGHT * Camera.SCALE) {
			this.eliminateCurrentPlayer();
		}
	}

	/** Removes the current player from the round and resets the ball to the last checkpoint. */
	private eliminateCurrentPlayer() {
		const player = this.players[this.currentPlayer];
		if (player.eliminated) return; // safety guard

		player.eliminated = true;
		player.score += this.yLevel;
		this.lastEliminatedYLevel = this.yLevel;

		// The ball goes back to the last safe platform for the next player.
		this.ball.x = this.checkpointX;
		this.ball.y = this.checkpointY;
		this.ball.vx = 0;
		this.ball.vy = 0;
		this.ball.inFlight = false;
	}

	/** Handles a player reaching the top of the level: they win the round instantly. */
	private handleTopOfLevelReached() {
		const winner = this.players[this.currentPlayer];
		winner.score += TOP_OF_LEVEL_BONUS;
		// All other still-alive players score 0 for this round (no change).
		this.ball.inFlight = false;
		this.triggerRoundEnd();
	}

	/** Queues/spawns obstacles and advances obstacle physics. */
	private updateObstacles(dt: number, rng: GameRandomGenerator) {
		this.obstacleSpawnTimer += dt;
		if (this.obstacleSpawnTimer >= OBSTACLE_CHECK_INTERVAL) {
			this.obstacleSpawnTimer -= OBSTACLE_CHECK_INTERVAL;
			if (rng() < OBSTACLE_SPAWN_CHANCE) {
				this.waitingObstacles.push(pickRandomObstacle(this.nextObstacleId++, this.yLevel));
			}
		}

		// Promote waiting obstacles whose delay has elapsed.
		const stillWaiting: WaitingObstacleData[] = [];
		for (const w of this.waitingObstacles) {
			w.timeLeft -= dt;
			if (w.timeLeft <= 0) {
				this.obstacles.push(new Obstacle(
					w.id, w.type, w.x, w.y, w.vx, w.vy, w.angle,
					w.angularVelocity, w.affectedByGravity, w.radius, w.w, w.h
				));
			} else {
				stillWaiting.push(w);
			}
		}
		this.waitingObstacles = stillWaiting;

		// Move & clean up live obstacles.
		for (const o of this.obstacles) {
			o.move(dt);
		}
		this.obstacles = this.obstacles.filter(o => !o.isFarFrom(this.yLevel));
	}

	/** Throws the ball using the given world-space aim target and PLAYER_THROW_SPEED. */
	private throwBall(targetX: number, targetY: number) {
		const dx = targetX - this.ball.x;
		const dy = targetY - this.ball.y;
		const velocity = getVectorToReachTarget(dx, dy, PLAYER_THROW_SPEED, -BALL_GRAVITY);

		this.ball.vx = velocity.x;
		this.ball.vy = velocity.y;
		this.ball.inFlight = true;
		this.thrownThisTurn = true;
		this.players[this.currentPlayer].aiming = false;
		this.players[this.currentPlayer].askThrow = false;
	}

	/** Called when the aiming window closes without an explicit throw input. */
	private autoThrow() {
		const player = this.players[this.currentPlayer];
		// Default: throw straight up if the player never aimed at all.
		const targetX = player.aiming ? player.aimX : this.ball.x;
		const targetY = player.aiming ? player.aimY : this.ball.y + 1000;
		this.throwBall(targetX, targetY);
	}

	/** Checks whether the current round (or the whole game) must end now. */
	private checkRoundEndConditions() {
		if (this.roundEnding || this.gameOver) return;

		const alive = this.countAlive();
		if (alive <= 1) {
			// Find the lone survivor (if any) and award the last-survivor bonus.
			const survivor = this.players.find(p => !p.eliminated);
			if (survivor) {
				survivor.score += LAST_SURVIVOR_MULTIPLIER * this.lastEliminatedYLevel;
			}
			this.triggerRoundEnd();
			return;
		}

		for (const p of this.players) {
			if (p.score >= WIN_SCORE_LIMIT) {
				this.gameOver = true;
				this.roundEnding = false;
				return;
			}
		}
	}

	private triggerRoundEnd() {
		for (const p of this.players) {
			if (p.score >= WIN_SCORE_LIMIT) {
				this.gameOver = true;
				return;
			}
		}
		this.roundEnding = true;
		this.roundEndTimer = ROUND_END_DELAY;
	}

	/* ==========================================================================
	 * INPUT HANDLING
	 * ========================================================================*/

	override runInput(playerIdx: number, input: Fields): void {
		// Only the player whose turn it currently is may act. Everyone else's
		// inputs are simply ignored (server-authoritative anti-cheat).
		if (playerIdx !== this.currentPlayer) return;
		if (this.turnPhase !== PHASE_AIMING) return;

		const player = this.players[playerIdx];

		switch (input.action) {
			case 'aim': {
				player.aimX = input.aim.x;
				player.aimY = input.aim.y;
				player.aiming = true;
				break;
			}

			case 'throwBall': {
				if (this.thrownThisTurn) break;
				player.aimX = input.throwBall.x;
				player.aimY = input.throwBall.y;
				player.aiming = true;
				player.askThrow = true;
				break;
			}
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

		// Only the local player can control the ball during their aiming phase.
		const isMyTurn = this.turnPhase === PHASE_AIMING;
		if (!isMyTurn) {
			if (mobile) {
				// Reset the local touch state when the aiming phase ends.
				data.mobileAimTouchId = null;
				data.mobileAimTouchActive = false;
			}
			return inputs;
		}

		if (mobile) {
			const touches = mobile.getDigits();

			/*
			* Mobile controls:
			*
			* - Touching the screen starts aiming.
			* - Moving the finger updates the target.
			* - Keeping the finger down keeps aiming.
			* - Releasing the finger throws the ball at the last target.
			*
			* We deliberately use the touch ID so another finger cannot
			* accidentally take control of the current aim.
			*/

			// Start aiming with the first available finger.
			if (data.mobileAimTouchId === null && touches.length > 0) {
				const touch = touches[0];

				data.mobileAimTouchId = touch.id;
				data.mobileAimTouchActive = true;

				const target = this.evalMouseCoords(
					touch.x,
					touch.y,
					0,
					data
				);

				data.lastSentAimX = touch.x;
				data.lastSentAimY = touch.y;

				inputs.push({
					action: 'aim',
					aim: {
						x: touch.x,
						y: touch.y
					}
				});
			}

			// Find the finger that originally started the aim.
			const aimTouch = data.mobileAimTouchId === null
				? null
				: touches.find(t => t.id === data.mobileAimTouchId);

			if (aimTouch) {
				// The finger is still held: continuously update the aim target.
				const target = this.evalMouseCoords(
					aimTouch.x,
					aimTouch.y,
					0,
					data
				);

				if (
					data.lastSentAimX !== aimTouch.x ||
					data.lastSentAimY !== aimTouch.y
				) {
					data.lastSentAimX = aimTouch.x;
					data.lastSentAimY = aimTouch.y;

					inputs.push({
						action: 'aim',
						aim: {
							x: aimTouch.x,
							y: aimTouch.y
						}
					});
				}
			} else if (data.mobileAimTouchActive) {
				/*
				* The finger disappeared from getDigits(), meaning it was
				* released. Throw using the last target received while aiming.
				*/
				if (
					data.lastSentAimX !== null &&
					data.lastSentAimY !== null
				) {
					inputs.push({
						action: 'throwBall',
						throwBall: {
							x: data.lastSentAimX,
							y: data.lastSentAimY
						}
					});
				}

				// The touch has completed its aim/throw cycle.
				data.mobileAimTouchId = null;
				data.mobileAimTouchActive = false;
			}

			return inputs;
		}

		// Desktop controls keep the existing mouse behaviour.
		let targetX: number | null = null;
		let targetY: number | null = null;
		let wantsThrow = false;

		const coords = mouse.getCoords();

		targetX = coords.x;
		targetY = coords.y;

		if (mouse.first(0)) {
			wantsThrow = true;
		}

		if (targetX !== null && targetY !== null) {
			// Only send an 'aim' update when the target actually changed, to
			// avoid flooding the network with identical inputs every frame.
			if (data.lastSentAimX !== targetX || data.lastSentAimY !== targetY) {
				data.lastSentAimX = targetX;
				data.lastSentAimY = targetY;
				inputs.push({ action: 'aim', aim: { x: targetX, y: targetY } });
			}

			if (wantsThrow) {
				inputs.push({ action: 'throwBall', throwBall: { x: targetX, y: targetY } });
			}
		}

		return inputs;
	}

	/* ==========================================================================
	 * RENDERING (client-only)
	 * ========================================================================*/

	/** Converts world-space coordinates to on-canvas pixel coordinates, flipping the Y axis (world Y grows up, canvas Y grows down). */
	private worldToScreen(x: number, y: number, camera: Camera): { x: number; y: number } {
		return {
			x: LEVEL_WIDTH / 2 + (x - camera.getCoords().x) * Camera.SCALE,
			y: SCREEN_HEIGHT / 2 - (y - camera.getCoords().y) * Camera.SCALE
		};
	}

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
			data.camera.teleport(this.yLevel);
		}

		data.update(this, playerIdx, 1 / 60);
		const camera = data.camera;
		const cameraCoords = camera.getCoords();

		// Draw everything in world coordinates.
		// The canvas origin is moved to the center of the screen,
		// then the Y axis is flipped to match the world coordinate system.
		ctx.save();
		ctx.translate(LEVEL_WIDTH / 2, SCREEN_HEIGHT / 2);
		ctx.scale(Camera.SCALE, -Camera.SCALE);
		ctx.translate(-cameraCoords.x, -cameraCoords.y);

		// Background.
		ctx.fillStyle = "#1a1a2e";
		ctx.fillRect(
			cameraCoords.x - LEVEL_WIDTH / (2 * Camera.SCALE),
			cameraCoords.y - SCREEN_HEIGHT / (2 * Camera.SCALE),
			LEVEL_WIDTH / Camera.SCALE,
			SCREEN_HEIGHT / Camera.SCALE
		);

		// Platforms.
		ctx.fillStyle = "#fff";
		for (const p of this.platforms) {
			ctx.fillRect(
				p.x - p.w / 2,
				p.y - p.h / 2,
				p.w,
				p.h
			);
		}

		// Obstacles.
		ctx.fillStyle = OBSTACLE_COLOR;
		for (const o of this.obstacles) {
			ctx.save();
			ctx.translate(o.x, o.y);
			ctx.rotate(-o.angle);

			if (o.type === 'circle') {
				ctx.beginPath();
				ctx.arc(0, 0, o.radius, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.fillRect(
					-o.w / 2,
					-o.h / 2,
					o.w,
					o.h
				);
			}

			ctx.restore();
		}

		// Ball.
		ctx.fillStyle = "#ffee55";
		ctx.beginPath();
		ctx.arc(this.ball.x, this.ball.y, BALL_RADIUS, 0, Math.PI * 2);
		ctx.fill();

		// Aiming trajectory for whoever is currently playing.
		const activePlayer = this.players[this.currentPlayer];
		if (this.turnPhase === PHASE_AIMING && activePlayer.aiming) {
			const teamColor = activePlayer.isRed
				? TEAM_COLORS.red
				: TEAM_COLORS.blue;

			drawPlayerToTarget(
				ctx,
				this.ball.x,
				this.ball.y,
				activePlayer.aimX,
				activePlayer.aimY,
				teamColor
			);
		}

		ctx.restore();
	}

	/* ==========================================================================
	 * MISC OVERRIDES
	 * ========================================================================*/

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const { State } = protocols.get();
		const object: Fields = {
			players: this.players.map(p => ({
				isRed: p.isRed,
				connected: p.connected,
				eliminated: p.eliminated,
				score: p.score,
				aimX: p.aimX,
				aimY: p.aimY,
				aiming: p.aiming,
				askThrow: p.askThrow
			})),
			ball: {
				x: this.ball.x,
				y: this.ball.y,
				vx: this.ball.vx,
				vy: this.ball.vy,
				inFlight: this.ball.inFlight
			},
			yLevel: this.yLevel,
			lastEliminatedYLevel: this.lastEliminatedYLevel,

			currentPlayer: this.currentPlayer,
			turnPhase: this.turnPhase,
			turnTimer: this.turnTimer,

			roundNumber: this.roundNumber,
			roundEnding: this.roundEnding,
			roundEndTimer: this.roundEndTimer,
			roundStartPlayer: this.roundStartPlayer,
			thrownThisTurn: this.thrownThisTurn,

			obstacles: this.obstacles.map(o => ({
				id: o.id, type: o.type, x: o.x, y: o.y, vx: o.vx, vy: o.vy,
				angle: o.angle, angularVelocity: o.angularVelocity,
				affectedByGravity: o.affectedByGravity, radius: o.radius, w: o.w, h: o.h
			})),
			waitingObstacles: this.waitingObstacles,
			obstacleSpawnTimer: this.obstacleSpawnTimer,
			nextObstacleId: this.nextObstacleId,

			gameOver: this.gameOver
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
		this.yLevel = obj.yLevel;
		this.lastEliminatedYLevel = obj.lastEliminatedYLevel;

		this.currentPlayer = obj.currentPlayer;
		this.turnPhase = obj.turnPhase;
		this.turnTimer = obj.turnTimer;

		this.roundNumber = obj.roundNumber;
		this.roundEnding = obj.roundEnding;
		this.roundEndTimer = obj.roundEndTimer;
		this.roundStartPlayer = obj.roundStartPlayer;
		this.thrownThisTurn = obj.thrownThisTurn;

		this.obstacles = obj.obstacles.map((o: any) => new Obstacle(
			o.id, o.type, o.x, o.y, o.vx, o.vy, o.angle,
			o.angularVelocity, o.affectedByGravity, o.radius, o.w, o.h
		));
		this.waitingObstacles = obj.waitingObstacles;
		this.obstacleSpawnTimer = obj.obstacleSpawnTimer;
		this.nextObstacleId = obj.nextObstacleId;

		this.gameOver = obj.gameOver;

		// A load() can happen at any time (e.g. reconnection); we must
		// re-derive a sane checkpoint since it isn't part of State. Falling
		// back to the closest platform below the ball is a safe default.
		const platformBelow = findPlatformBelow(this.platforms, this.ball.y);
		this.checkpointX = this.ball.inFlight ? platformBelow.x : this.ball.x;
		this.checkpointY = this.ball.inFlight
			? platformBelow.y + platformBelow.h / 2 + BALL_RADIUS
			: this.ball.y;
	}

	override getSize() {
		return { width: LEVEL_WIDTH, height: SCREEN_HEIGHT };
	}

	override evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;
		const camera = clientData.camera;

		// Inverse of worldToScreen().
		const ret = {
			x: (x - LEVEL_WIDTH / 2) / Camera.SCALE + camera.getCoords().x,
			y: -(y - SCREEN_HEIGHT / 2) / Camera.SCALE + camera.getCoords().y
		};

		return ret;
	}

	override getMobileDesc(): MobileDescriptor {
		/*
		* Mobile aiming is handled directly through touch input.
		* No virtual joystick or throw button is required.
		*/
		return {
			joysticks: {},
			buttons: {}
		};
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	/* ==========================================================================
	 * FINISH GAME
	 * ========================================================================*/

	private produceFinish(): FinishGame {
		const redIndices = this.players
			.map((p, i) => ({ p, i }))
			.filter(({ p }) => p.isRed)
			.sort((a, b) => b.p.score - a.p.score)
			.map(({ i }) => i);

		const blueIndices = this.players
			.map((p, i) => ({ p, i }))
			.filter(({ p }) => !p.isRed)
			.sort((a, b) => b.p.score - a.p.score)
			.map(({ i }) => i);

		const redScore = redIndices.reduce((sum, i) => sum + this.players[i].score, 0);
		const blueScore = blueIndices.reduce((sum, i) => sum + this.players[i].score, 0);

		const results = redScore >= blueScore
			? [redIndices, blueIndices]
			: [blueIndices, redIndices];

		const teamEqualities: number[] = [];
		if (results.length === 2 && redScore === blueScore) {
			teamEqualities.push(0);
		}

		// Player-level ties are checked on adjacent positions of the
		// flattened result order, per the spec's example.
		const flatScores = results.flat().map(i => this.players[i].score);
		const playerEqualities: number[] = [];
		for (let i = 0; i < flatScores.length - 1; i++) {
			if (flatScores[i] === flatScores[i + 1]) {
				playerEqualities.push(i);
			}
		}

		return { results, teamEqualities, playerEqualities };
	}
}
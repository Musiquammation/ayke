import { getLogger } from "../../server/Logger";
import { Fields } from "../Fields";
import { FinishGame, GameMode, IKeyboardController, IMouseController } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

const protocols = getProtocol('airbasket');

interface PlayerInput {
	data: Uint8Array;
}

const GRAVITY = 1100;
const WIDTH = 2400;
const HEIGHT = 1350;

const X_LIMIT = WIDTH * 2.5;
const Y_LIMIT = HEIGHT * 1.5;

const TIMES = [
	180, // normal
	60, // grabber infinite
	120, // sudden death
];

const COLORS = [
	["#ff4f99", "#ff9b7a", "#ffffff", "#7199ff", "#4f99ff"],
	["#ff0770", "#ff7744", "#cccccc", "#4477ff", "#0077ff"],
	["#cc0059", "#cc5f36", "#999999", "#365fcc", "#005fcc"]
];

const BUCKET_POSITIONS: number[][] = [
	[-2, -1], [-1, -1],         [0, -1],          [+1, -1], [+2, -1],
	[-2,  0], [-1,  0],                           [+1,  0], [+2,  0],
	[-2, +1], [-1, +1], [-0.25, +1], [+0.25, +1], [+1, +1], [+2, +1],
]


class Ball {
	static readonly RADIUS = 70;
	static readonly SPAWN_JUMP = 20;
	static readonly GRAVITY = 500;
	static readonly EJECT = 1200;

	x = 0;
	y = 0;
	vx = 0;
	vy = -Ball.SPAWN_JUMP;

	grabber = -1;
	prevGrabber = -1;

	move(dt: number) {
		if (this.grabber >= 0) {
			return; // ball is grabbed
		}

		this.vy += Ball.GRAVITY * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;

		if (this.isOOB()) {
			this.reset();
		}
	}

	reset() {
		this.x = 0;
		this.y = 0;
		this.vx = 0;
		this.vy = -Ball.SPAWN_JUMP;
		this.prevGrabber = -1;
		this.removeGrabber();
	}

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
	}

	isOOB() {
		return (
			this.x < -X_LIMIT + Ball.RADIUS/2 ||
			this.x > X_LIMIT - Ball.RADIUS/2 ||
			this.y < -Y_LIMIT + Ball.RADIUS/2 ||
			this.y > Y_LIMIT - Ball.RADIUS/2
		);
	}

	removeGrabber() {
		if (this.grabber < 0)
			return;

		this.prevGrabber = this.grabber;
		this.grabber = -1;
	}

	eject() {
		this.removeGrabber();
		
		if (this.y <= -HEIGHT) {
			this.vy = 0;
		} else {
			this.vy = -Ball.EJECT;
		}

		if (this.x < -WIDTH) {
			this.vx = Ball.EJECT;
		}

		if (this.x > WIDTH) {
			this.vx = -Ball.EJECT;
		}


		// Place correctly
		if (this.x > X_LIMIT - Ball.RADIUS/2) {
			this.x = X_LIMIT - Ball.RADIUS/2;
		} else if (this.x < -X_LIMIT + Ball.RADIUS/2) {
			this.x = -X_LIMIT + Ball.RADIUS/2;
		}

		if (this.y > Y_LIMIT - Ball.RADIUS/2) {
			this.y = Y_LIMIT - Ball.RADIUS/2;
		} else if (this.y < -Y_LIMIT + Ball.RADIUS/2) {
			this.y = -Y_LIMIT + Ball.RADIUS/2;
		}
	}
}

interface FixedTarget {
	type: 'fixed';
	x: number;
	y: number;
}

interface DeltaTarget {
	type: 'delta';
	dx: number;
	dy: number;
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
	static readonly COOLDOWN = 1.5;
	static readonly WIDTH = 40;
	static readonly HEIGHT = 80;
	static readonly PUSH_DOWN = 1000;
	static readonly THROW = 1200;
	static readonly BOUNCE_X = 1000;
	static readonly BOUNCE_Y = 100;

	spawnX: number | null = null;
	spawnY: number | null = null
	connected = true;
	alive = -1;
	vx = 0;
	vy = -Player.SPAWN_JUMP;
	dir = 0;
	pushDown = false;
	score = 0;
	target : FixedTarget | DeltaTarget | null = null;
	team: 'red' | 'blue' = 'red';

	constructor(
		public x: number,
		public y: number
	) {
	}

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

	move(dt: number, grabber: boolean) {
		if (this.alive >= 0) {
			this.alive -= dt;
			if (this.alive >= 0)
				return;

			if (this.spawnX !== null) {this.x = this.spawnX;}
			if (this.spawnY !== null) {this.y = this.spawnY;}
		}

		// Set vx
		if (this.dir === 0) {
			if (this.vx > 0) {
				this.vx -= Player.SOFT_DECELERATION * dt;
				if (this.vx < 0) this.vx = 0;
			} else if (this.vx < 0) {
				this.vx += Player.SOFT_DECELERATION * dt;
				if (this.vx > 0) this.vx = 0;
			}
		} else if (this.dir > 0) {
			if (this.vx < 0) {
				this.vx += Player.QUICK_DECELERATION * dt;
				if (this.vx > 0) this.vx = 0;
			} else if (this.vx < Player.SPEED) {
				this.vx += Player.ACCELERATION * dt;
				if (this.vx > Player.SPEED) this.vx = Player.SPEED;
			} else if (this.vx > Player.SPEED) {
				this.vx -= Player.MIN_DECELERATION * dt;
				if (this.vx < Player.SPEED) this.vx = Player.SPAWN_JUMP;
			}
		} else /*if (this.dir < 0)*/ {
			if (this.vx > 0) {
				this.vx -= Player.QUICK_DECELERATION * dt;
				if (this.vx < 0) this.vx = 0;
			} else if (this.vx > -Player.SPEED) {
				this.vx -= Player.ACCELERATION * dt;
				if (this.vx < -Player.SPEED) this.vx = -Player.SPEED;
			} else if (this.vx < -Player.SPEED) {
				this.vx += Player.MIN_DECELERATION * dt;
				if (this.vx > -Player.SPEED) this.vx = -Player.SPAWN_JUMP;
			}
		}
		
		this.vy += (grabber ? Player.GRAB_GRAVITY : GRAVITY) * dt;

		this.x += this.vx * dt;
		this.y += this.vy * dt;

		if (this.pushDown) {
			this.y += Player.PUSH_DOWN * dt;
		}

		if (this.isOOB()) {
			this.die();
		}
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


	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.dir = obj.dir;
		this.alive = obj.alive;
		this.score = obj.score;
		this.pushDown = obj.pushDown;
	}

	isOOB() {
		return (
			this.x < -X_LIMIT + Player.WIDTH/2 ||
			this.x > X_LIMIT - Player.WIDTH/2 ||
			this.y < -Y_LIMIT + Player.HEIGHT/2 ||
			this.y > Y_LIMIT - Player.HEIGHT/2
		);
	}

	die() {
		this.vx = 0;
		this.vy = -Player.SPAWN_JUMP;
		this.alive = Player.COOLDOWN;
	}
}



class Bucket {
	team: 'red' | 'blue' | null = null;

	static readonly SIZE = 110;

	constructor(
		public readonly x: number,
		public readonly y: number
	) {}
}







class Camera {
	x = 0;
	y = 0;

	static readonly SCALE = 0.9;
	static readonly DURATION = 0.3;

	// Transition state variables
	private startX = 0;
	private startY = 0;
	private targetX = 0;
	private targetY = 0;
	private isTransitioning = false;
	private t = 0;

	/**
	 * Easing function: f([0;1]) -> [0;1]
	 * Here we use a standard "Smoothstep" (ease-in-out) function as an example.
	 */
	private easing(t: number): number {
		// Clamp t just in case
		const clampedT = Math.max(0, Math.min(1, t)); 
		return clampedT * clampedT * (3 - 2 * clampedT);
	}

	/**
	 * Calculates the center coordinates of the zone the player is currently in.
	 */
	private getZoneCenter(px: number, py: number) {
		// Calculate the zone index based on the player's position
		// Since zone starts at x*W - W/2, the center is exactly at x*W
		let zx = Math.round(px / WIDTH);
		let zy = Math.round(py / HEIGHT);

		// Clamp indices to your specific bounds: x in [-2, 2] and y in [-1, 1]
		zx = Math.max(-2, Math.min(2, zx));
		zy = Math.max(-1, Math.min(1, zy));

		return {
			cx: zx * WIDTH,
			cy: zy * HEIGHT
		};
	}

	/**
	 * Updates the camera position.
	 * @param px Player X position
	 * @param py Player Y position
	 * @param dt Delta time (time elapsed since last frame, e.g., in milliseconds)
	 */
	update(px: number, py: number, dt: number) {
		const { cx, cy } = this.getZoneCenter(px, py);

		// If the calculated zone center is different from our current target,
		// it means the player has entered a new zone.
		if (cx !== this.targetX || cy !== this.targetY) {
			// Setup the new transition. 
			// We start from the CURRENT camera position to prevent snapping 
			// if the zone changes while another transition is already running.
			this.startX = this.x;
			this.startY = this.y;
			this.targetX = cx;
			this.targetY = cy;
			
			// Reset transition timer
			this.t = 0;
			this.isTransitioning = true;
		}

		if (this.isTransitioning) {
			this.t += dt;

			if (this.t >= Camera.DURATION) {
				// Transition is over
				this.isTransitioning = false;
				this.x = this.targetX;
				this.y = this.targetY;
			} else {
				// Apply the easing function to interpolate the camera's position
				const progress = this.easing(this.t / Camera.DURATION);
				
				this.x = this.startX + (this.targetX - this.startX) * progress;
				this.y = this.startY + (this.targetY - this.startY) * progress;
			}
		} else {
			// Not transitioning, tightly lock to the target
			this.x = this.targetX;
			this.y = this.targetY;
		}
	}

	/**
	 * Instantly moves the camera to the player's current zone, 
	 * breaking any ongoing transition.
	 */
	teleport(px: number, py: number) {
		const { cx, cy } = this.getZoneCenter(px, py);
		
		// Instantly snap coordinates
		this.x = cx;
		this.y = cy;
		
		// Break the transition and update targets
		this.targetX = cx;
		this.targetY = cy;
		this.isTransitioning = false;
		this.t = 0;
	}

	getCoords() {
		return { x: this.x, y: this.y };
	}
}

class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;

	readonly html: HTMLDivElement;

	readonly time: HTMLDivElement;
	readonly period: HTMLDivElement;
	
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;

	readonly camera = new Camera();

	private clientWasDead = true;
	private lastDirs: Record<number, boolean> = {};

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-airbasket-client-data");

		this.time = document.createElement("div");
		this.time.classList.add("game-airbasket-time");

		this.period = document.createElement("div");
		this.period.classList.add("game-airbasket-period");

		const scores = document.createElement("div");
		scores.classList.add("game-airbasket-scores");
		this.redScore = document.createElement("div"),
		this.blueScore = document.createElement("div"),

		this.redScore.classList.add("game-airbasket-red-score");
		this.blueScore.classList.add("game-airbasket-blue-score");

		const tiret = document.createElement("div");
		tiret.textContent = "-";

		scores.appendChild(this.redScore);
		scores.appendChild(tiret);
		scores.appendChild(this.blueScore);
		
		this.html.appendChild(scores);
		this.html.appendChild(this.time);
		this.html.appendChild(this.period);
	}

	static readonly PERIODS = ["normal", "grabber infinite", "sudden death"];

	static showTime(time: number) {
		const minutes = Math.floor(time / 60);
		const seconds = (time % 60).toFixed(1);

		return `${minutes}:${seconds.padStart(4, "0")}`;
	}

	update(game: GMAirBasket, playerIdx: number) {
		this.time.innerText = 
			ClientData.showTime(game.time);

		this.period.innerText =
			ClientData.PERIODS[game.timeStep];

		this.redScore.innerText =
			String(game.redScore).padStart(2, "0");

		this.blueScore.innerText =
			String(game.blueScore).padStart(2, "0");


		// Player
		const player = game.players[playerIdx];
		if (this.clientWasDead && player.alive < 0) {
			this.camera.teleport(player.x, player.y)
		}
		this.clientWasDead = (player.alive >= 0);

		this.camera.update(player.x, player.y, 1/60);
	}

	getPlayerTextureCode(
		grabbing: boolean,
		player: Player,
		idx: number
	): [number, number, boolean] {
		let first: number;
		let second: number;
		let third: boolean;
		if (player.vy < -600) {
			first = 1;
		} else if (player.vy >= 0) {
			first = 2;
		} else {
			first = 0;
		}
		
		
		second = grabbing ? 1 : 0;

		if (player.dir === 0) {
			if (player.vx < 0) {
				third = true;
			} else if (player.vx > 0) {
				third = false;
			} else {
				third = this.lastDirs[idx];
			}
		
		} else  {
			third = player.dir < 0;
		}

		this.lastDirs[idx] = third;


		return [first, second, third];
	}
}


class TutorialData {
	private step = 0;
	private wakeUp = 0;


	constructor(private readonly game: GMAirBasket) {}

	frame(dt: number, clock: number) {
		const player = this.game.players[0];
		const bot = this.game.players[1];

		if (player.alive >= 0)
			this.step = 0; // restart

		if (this.step === 0) {
			this.game.ball.x = 0;
			this.game.ball.y = 0;
			this.game.ball.vy = 0;
			this.game.ball.prevGrabber = -1;

			if (this.game.ball.grabber === 0)
				this.step = 2;

			if (
				player.x >= -WIDTH/2 &&
				player.x <= WIDTH/2 &&
				player.y >= -HEIGHT/2 &&
				player.y <= HEIGHT/2
			) {
				this.step = 1;
			}

			return "Go towards the ball (jump to do not fall)";
		}


		if (this.step === 1) {
			if (this.game.ball.grabber === 0)
				this.step = 2;

			this.game.ball.prevGrabber = -1;
			return "Take the ball";
		}

		if (this.step === 2) {
			if (player.vy < 0) {
				this.step = 3;
			}
			return "";
		}

		if (this.step === 3) {
			if (this.game.ball.grabber !== -1) {
				this.step = 4;
				this.wakeUp = clock + 1.5;
			}

			return "You can't jump when holding the ball.\n Throw it with the mouse towards a mate or a GREEN bucket";
		}

		if (this.step === 4) {
			if (clock >= this.wakeUp) {
				bot.x = this.game.ball.x;
				bot.y = this.game.ball.y;
				bot.target = {
					type: 'fixed',
					x: player.x,
					y: player.y
				};
				this.wakeUp = clock + 1;
				this.step = 5;
			}

			return "You can't re-take the ball after have having thrown it.\n An other player needs to take the ball";
		}

		if (this.step === 5) {
			if (clock >= this.wakeUp) {
				this.step = 3;
			}
			return "We spawned a bot to do that. Try to touch GREEN buckets";
		}




		return "";
	}


	lockGame() {
		return [3].includes(this.step);
	}
}



function generateClientDom() {
	return {
		skin: 0,
		preferTeam: 0,

		produce() {
			const {StartData} = protocols.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		}
	};
}

function lighten(hex: string, factor: number): string {
	const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

	const lightened = rgb.map(c =>
		Math.round(c + (255 - c) / factor)
	);

	return `#${lightened
		.map(c => c.toString(16).padStart(2, "0"))
		.join("")}`;
}

/**
 * Checks for AABB rectangle collisions between all players.
 * If a collision is found, violently projects the players in opposite directions.
 */
function applyCollisions(players: Player[]) {
	for (let i = 0; i < players.length; i++) {
		for (let j = i + 1; j < players.length; j++) {
			const p1 = players[i];
			const p2 = players[j];

			// Only calculate collisions for alive players
			if (!p1.isAlive() || !p2.isAlive()) continue;

			// Calculate distances based on center points
			const dx = p1.x - p2.x;
			const dy = p1.y - p2.y;
			
			// AABB Collision check
			if (Math.abs(dx) < Player.WIDTH && Math.abs(dy) < Player.HEIGHT) {
				// Calculate distance to normalize the bounce vector
				const dist = Math.sqrt(dx * dx + dy * dy);
				
				let nx = 0;
				let ny = 0;

				if (dist === 0) {
					// Fallback in the extremely rare case they are exactly on the same pixel
					nx = 1;
					ny = 0;
				} else {
					// Normalize vector
					nx = dx / dist;
					ny = dy / dist;
				}

				// Apply projection forces in opposite directions
				p1.vx += nx * Player.BOUNCE_X;
				p1.vy += ny * Player.BOUNCE_Y;
				
				p2.vx -= nx * Player.BOUNCE_X;
				p2.vy -= ny * Player.BOUNCE_Y;
			}
		}
	}
}

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

		// Start 40 pixels away from the player
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

	// Time required to reach dst.x
	const T = X / vx;

	if (T <= 0) {
		return;
	}

	// Number of points on the curve
	const steps = 50;

	// Calculate the complete trajectory first
	const points: { x: number; y: number }[] = [];

	for (let i = 0; i <= steps; i++) {
		const t = T * i / steps;

		const x = srcX + vx * t;
		const y = srcY + vy * t + (g / 2) * t * t;

		points.push({ x, y });
	}

	// Find the point 40 pixels from the source
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

	// Black outline
	if (outline) {
		ctx.lineWidth = lineWidth + 4;
		ctx.strokeStyle = "black";
		drawCurve();
	}

	// Colored trajectory
	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color as string;
	drawCurve();
}




export class GMAirBasket extends GameMode {
	static readonly types = {Player, Bucket};

	static readonly DATA = {
		GRAVITY,
		WIDTH,
		HEIGHT,
		X_LIMIT,
		Y_LIMIT
	};

	readonly players: Player[];
	readonly ball = new Ball();
	readonly buckets: Bucket[];
	redScore = 0;
	blueScore = 0;
	leftBuckets = BUCKET_POSITIONS.length;

	timeStep = 0;
	time = TIMES[0];

	finished = false;
	internalFrameTick = 0;

	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0)
		);

		this.buckets = BUCKET_POSITIONS.map(([x, y]) => new Bucket(x*WIDTH, y*HEIGHT));
	}

	static createServ(players: PlayerInput[], total: number) {
		const {StartData, StartDataClient} = protocols.get();

		const game = new GMAirBasket(total);


		function decode(i: number) {
			if (i < players.length)
				return decodeFullMessage(StartData.decode(players[i].data));

			return generateClientDom();
		}

		// Pre-decode all player messages once for performance
		const playerInfos = game.players.map((p, i) => ({
			player: p,
			index: i,
			pref: decode(i).preferTeam ?? 0
		}));

		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);

		const assigned = new Array(totalPlayers);
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

			// Assign to the team that currently has fewer players
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
		for (const [i, p] of game.players.entries()) {
			const redTeam = assigned[i];
			p.initSpawn(
				redTeam ? -WIDTH * 2 : WIDTH * 2,
				0,
				redTeam ? 'red' : 'blue'
			);
		}



		const data = StartDataClient.encode({
			players: game.players.map(p => ({
				x: p.spawnX,
				y: p.spawnY,
				isRed: p.team === 'red'
			}))
		}).finish();

		return {
			game,
			data
		}
	}

	static createClient(data: Uint8Array | null, total: number) {
		const game = new GMAirBasket(total);
		const {StartDataClient} = protocols.get();

		if (data) {
			const {players} = decodeFullMessage(StartDataClient.decode(data));
	
			for (const [idx, p] of players.entries()) {
				game.players[idx].initSpawn(p.x, p.y, p.isRed ? 'red' : 'blue');
			}
		} else {
			game.players[0].initSpawn(-WIDTH * 2, 0, 'red');
			game.players[1].initSpawn(+WIDTH * 2, 0, 'blue');
		}


		const clientData = new ClientData();
		return {game, data: clientData, html: clientData.html};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly TEXTURES = {
		'ball': "/assets/games/airbasket/ball.png",
		'bucket-blue': "/assets/games/airbasket/bucket-blue.png",
		'bucket-mid': "/assets/games/airbasket/bucket-mid.png",
		'bucket-red': "/assets/games/airbasket/bucket-red.png",
		'sky': "/assets/games/airbasket/sky.png",
		'skin-default': "/assets/games/airbasket/skins/joe/grid.png"
	};


	override init(): void {
		
	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
	}

	private playerTouchBucket(player: Player) {
		const rect = {
			x: player.x,
			y: player.y,
			w: Player.WIDTH,
			h: Player.HEIGHT,
		};

		for (const bucket of this.buckets) {
			if (bucket.team !== null)
				continue;

			if (collisions.RectRect(rect, {
				x: bucket.x,
				y: bucket.y,
				w: Bucket.SIZE,
				h: Bucket.SIZE,
			})) {
				return bucket;
			}
		}

		return null;
	}

	private ballTouchBucket() {
		const circle = {
			x: this.ball.x,
			y: this.ball.y,
			r: Ball.RADIUS,
		};

		for (const bucket of this.buckets) {
			if (bucket.team !== null)
				continue;

			if (collisions.RectCircle({
				x: bucket.x,
				y: bucket.y,
				w: Bucket.SIZE,
				h: Bucket.SIZE,
			}, circle)) {
				return bucket;
			}
		}

		return null;
	}

	private winPoint(playerIdx: number, bucket: Bucket) {
		const player = this.players[playerIdx];
		player.score++;
		bucket.team = player.team;
		if (player.team === 'red') {
			this.redScore++;
		} else {
			this.blueScore++;
		}
		this.leftBuckets--;

		this.ball.reset();
	}

	private canRegrab() {
		return this.timeStep >= 1;
	}

	private isSuddenDeath() {
		return this.timeStep >= 2;
	}

	override run(dt: number, produceFinish: boolean): FinishGame | null {
		// Time
		this.time -= dt;
		if (this.time <= 0) {
			this.timeStep++;
			if (this.timeStep >= TIMES.length) {
				this.finished = true;
				this.time = Infinity;
			}
			this.time += TIMES[this.timeStep];
		}

		if (this.isSuddenDeath() && this.redScore !== this.blueScore) {
			this.finished = true;
		}


		// Move
		for (const [idx, p] of this.players.entries()) {
			p.move(dt, idx === this.ball.grabber);
		}

		applyCollisions(this.players);

		// Eject ball from dead player or throw ball
		if (this.ball.grabber >= 0) {
			const grabber = this.players[this.ball.grabber];
			if (!grabber.isAlive()) {
				this.ball.eject();
			} else if (grabber.target && grabber.target.type === 'fixed') {
				const dx = grabber.target.x - grabber.x;
				const dy = grabber.target.y - grabber.y;
				if (dx !== 0 || dy !== 0) {
					const {x, y} = getVectorToReachTarget(
						dx,
						dy,
						Player.THROW,
						Ball.GRAVITY
					);
					this.ball.vx = x;
					this.ball.vy = y;
					this.ball.removeGrabber();
				}
			}
		}

		this.ball.move(dt);
		if (this.ball.grabber >= 0) {
			const grabber = this.players[this.ball.grabber];
			this.ball.x = grabber.x;
			this.ball.y = grabber.y;

		}

		// Grab ball
		if (this.ball.grabber < 0) {
			const canRegrab = this.canRegrab();
			let grabber = -1;
			for (const [i, p] of this.players.entries()) {
				if (
					(canRegrab || i !== this.ball.prevGrabber) &&
					p.touchsBall(this.ball)
				) {
					if (grabber >= 0) {
						// Only one grabber is allowed
						grabber = -1; 
						break;
					}

					grabber = i;
				}
			}

			if (grabber >= 0) {
				this.ball.grabber = grabber;
			}
		}

		// Ball touch bucket
		if (this.ball.grabber >= 0) {
			const bucket = this.playerTouchBucket(this.players[this.ball.grabber]);
			if (bucket) {
				this.winPoint(this.ball.grabber, bucket);
			}

		} else if (this.ball.prevGrabber >= 0) {
			const bucket = this.ballTouchBucket();
			if (bucket) {
				this.winPoint(this.ball.prevGrabber, bucket);
			}
		}


		if (produceFinish && this.finished) {
			return this.produceFinish();
		}
		return null;
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
				// Jump if ball is not grabbed
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
					type: 'fixed',
					x: input.throwTarget.x,
					y: input.throwTarget.y,
				};
				break;

			case 'throwDir':
				player.target = {
					type: 'delta',
					dx: input.throwTarget.x,
					dy: input.throwTarget.y,
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
		_data: any
	) {
		const data = _data as ClientData;
		const throwTarget = mouse.getCoords();
		data.mouseX = throwTarget.x;
		data.mouseY = throwTarget.y;

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


		// Left / Right
		const inputs: Fields[] = [];
		const moveInput = getMoveInput();
		if (moveInput) {
			inputs.push(moveInput);
		}

		// Jump / Down
		if (keyboard.first('up') || keyboard.first('jump')) {
			inputs.push({jump: {}, action: 'jump'});
		}

		if (keyboard.first('down')) {
			inputs.push({downOn: {}, action: 'downOn'});
		}

		if (keyboard.killed('down')) {
			inputs.push({downOff: {}, action: 'downOff'});
		}


		// Target
		if (mouse.press(0)) {
			inputs.push({throwTarget, action: 'throwTarget'});
			
		} else if (mouse.killed(0)) {
			inputs.push({throwOff: {}, action: 'throwOff'});
		}

		return inputs;
	}


	getBallDrawCoords() {
		let x = this.ball.x - Ball.RADIUS/2;
		let y = this.ball.y - Ball.RADIUS/2;

		return {x, y};
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		imageLoader: ImageLoader
	) {
		const data = _data as ClientData;
		if (data.firstFrame) {
			data.firstFrame = false;

			let i = 0;
			for (const j of COLORS) {
				for (const color of j) {
					imageLoader.setColorRule('sky', i, [
						{
							prev: "#ff00ff",
							next: color
						},
	
						{
							prev: "#770077",
							next: lighten(color, 2)
						}
					]);

					i++;
				}
			}
		}


		data.update(this, playerIdx);

		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		// Center the camera on the current player
		const cameraCoords = data.camera.getCoords();
		ctx.save();
		ctx.translate(WIDTH / 2, HEIGHT / 2);
		ctx.scale(Camera.SCALE, Camera.SCALE);
		ctx.translate(-cameraCoords.x, -cameraCoords.y);

		// Background
		for (let y = 0; y < 3; y++) {
			for (let x = 0; x < 5; x++) {
				ctx.drawImage(
					imageLoader.get('sky', y*5+x),
					(x-2.5)*WIDTH,
					(y-1.5)*HEIGHT,
					WIDTH,
					HEIGHT
				);
			}
		}

		// Buckets
		for (const bucket of this.buckets) {
			const b = "bucket-" + (bucket.team ?? "mid");
			ctx.drawImage(
				imageLoader.get(b),
				bucket.x - Bucket.SIZE/2,
				bucket.y - Bucket.SIZE/2,
				Bucket.SIZE,
				Bucket.SIZE
			);
		}

		// Draw players
		const playerTexture = imageLoader.get('skin-default');
		const w = playerTexture.width / 6;
		const h = playerTexture.height / 4;
		const width = Player.WIDTH * 4 / 3;

		for (const [idx, p] of this.players.entries()) {
			if (idx === playerIdx) {
				ctx.fillStyle = "#0f0";
				const r = 1.3;
				ctx.fillRect(
					p.x - r*Player.WIDTH/2,
					p.y - r*Player.HEIGHT/2,
					r*Player.WIDTH,
					r*Player.HEIGHT
				);
			}

			ctx.fillStyle = p.team;

			let [tx, ty, dir] = data.getPlayerTextureCode(
				this.ball.grabber === idx,
				p,
				idx
			);

			if (p.team === 'red') {
				tx += 3;
			}

			ctx.save();

			if (dir) {
				// Look left
				ctx.translate(p.x + width / 2, p.y - Player.HEIGHT / 2);
				ctx.scale(-1, 1);

				ctx.drawImage(
					playerTexture,
					tx * w,
					ty * h,
					w,
					h,
					0,
					0,
					width,
					Player.HEIGHT,
				);
			} else {
				// Look right
				ctx.drawImage(
					playerTexture,
					tx * w,
					ty * h,
					w,
					h,
					p.x - width / 2,
					p.y - Player.HEIGHT / 2,
					width,
					Player.HEIGHT,
				);
			}


			ctx.restore();
		}

		// Draw ball
		if (this.ball.grabber < 0) {
			const drawBallCoords = this.getBallDrawCoords();
			ctx.drawImage(
				imageLoader.get('ball'),
				drawBallCoords.x,
				drawBallCoords.y,
				Ball.RADIUS,
				Ball.RADIUS
			)
		}

		// Draw player-to-target
		{
			const player = this.players[playerIdx];
			let color: string | boolean;

			if (this.ball.grabber === playerIdx) {
				color = player.team;
			} else {
				color = this.ball.prevGrabber !== playerIdx;
			} 

			drawPlayerToTarget(
				ctx,
				player.x,
				player.y,
				data.mouseX,
				data.mouseY,
				color
			);
		}

		ctx.restore();
	}


	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const {State} = protocols.get();
		const object: Fields = {
			players: this.players,
			prevBallGrabber: this.ball.prevGrabber,
			buckets: this.buckets.map(b => ({
				taken: b.team !== null,
				redTeam: b.team === 'red'
			})),
			time: this.time,
			timeStep: this.timeStep,
			redScore: this.redScore,
			blueScore: this.blueScore,
		};
		
		if (this.ball.grabber >= 0) {
			object.grabbedBall = {owner: this.ball.grabber};
		} else {
			object.freeBall = this.ball;
		}

		return State.encode(object).finish();
	}

	override load(data: Uint8Array): void {
		const {State} = protocols.get();
		const obj = State.decode(data);
		for (const [idx, player] of obj.players.entries()) {
			this.players[idx].load(player);
		}

		for (const [idx, bucket] of obj.buckets.entries()) {
			if (!bucket.taken) {
				this.buckets[idx].team = null;
			} else {
				this.buckets[idx].team = bucket.redTeam ? 'red' : 'blue';
			}
		}

		this.ball.load(obj);

		this.time = obj.time;
		this.timeStep = obj.timeStep;
		this.redScore = obj.redScore;
		this.blueScore = obj.blueScore;
	}

	override getSize() {
		return {width: WIDTH, height: HEIGHT};
	}

	override evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;
		const cameraCoords = clientData.camera.getCoords();

		const ret = {
			x: (x - WIDTH / 2) / Camera.SCALE + cameraCoords.x,
			y: (y - HEIGHT / 2) / Camera.SCALE + cameraCoords.y
		};

		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;

		return ret;

	}



	override createTutorial() {
		return new TutorialData(this);
	}

	private produceFinish(): FinishGame {
		const redTeam: number[] = [];
		const blueTeam: number[] = [];
		const playerEqualities: number[] = [];

		// Fill teams
		for (const [idx, player] of this.players.entries()) {
			if (player.team === 'red') {
				redTeam.push(idx);
			} else {
				blueTeam.push(idx);
			}
		}

		// Internal sort
		for (const team of [redTeam, blueTeam]) {
			// Sort
			team.sort((a, b) => this.players[b].score - this.players[a].score);

			// Detect equalities
			for (let i = 0; i < team.length - 2; i++) {
				const a = this.players[team[i]].score;
				const b = this.players[team[i+1]].score;
				if (a === b) {
					playerEqualities.push(team[i]);
				}
			}
		}


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


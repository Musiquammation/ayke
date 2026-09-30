import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader, ImageLoaderFolder } from "../util/ImageLoader";
import { GameRandomGenerator } from "../util/GameRandomGenerator";

const protocols = getProtocol('soapBubble', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

// Playground size. The origin (0, 0) is the CENTER of the screen.
// The red team owns the TOP edge (y = -HALF_HEIGHT), the blue team the BOTTOM edge.
const WIDTH = 2700;
const HEIGHT = 4800;
const HALF_WIDTH = WIDTH / 2;
const HALF_HEIGHT = HEIGHT / 2;

// Score
const WIN_SCORE = 30; // first team to reach this score wins

// Bubbles
const SPAWN_BUBBLE_COOLDOWN = 0.6;   // seconds between two bubble spawns
const BUBBLE_RADIUS = 95;          // radius of a bubble in game units
const GRAB_TOLERANCE = 25;         // extra pixels around a bubble where a click still grabs it
const NO_PLAYER = -1;              // "nobody" marker for holder / lastGrabber

// Grab physics
const GRAB_ACCEL = 5000;                // acceleration (units/s^2) toward the pointer
const GRAB_FULL_ACCEL_DISTANCE = 250;   // below this distance the acceleration fades (avoids jitter)
const GRAB_MAX_SPEED = 1500;            // norm limit of the speed GAINED through grabbing
const HELD_DRAG = 2.0;                  // exponential drag (1/s) applied to a held bubble
const FREE_DRAG = 0.35;                 // exponential drag (1/s) applied to a free bubble
const HARD_MAX_SPEED = 3500;            // absolute safety cap (bounces can add energy)
const BOUNCE_RESTITUTION = 0.9;         // 1 = perfectly elastic, 0 = no bounce

// Spikes
const SPIKE_SPAWN_COOLDOWN = 0.2;       // seconds between two waiting-spike spawns
const SPIKE_SPAWN_DECAY = 0.02;         // Exponential decay coefficient k (1/s)
const SPIKE_SPAWN_BASE = 0.1;           // Minimal spawn cooldown
const SPIKE_DY_DECAY = Math.log(0.15)/240;
const SPIKE_WAIT_TIME = 2;              // seconds a spike stays grayed out before activating
const SPIKE_FADE_TIME = 0.5;            // opacity rises during the last SPIKE_FADE_TIME seconds
const SPIKE_SPEED = 650;                // constant speed of an active spike (units/s)
const SPIKE_RADIUS = 55;                // collision radius of a spike
const WAITING_SPIKE_ALPHA = 0.25;       // opacity of a spike that is still waiting
const SPIKE_BURST_RADIUS = 400;         // radius around a triggered spike that destroys other spikes

// Rendering
const RED_COLOR = "#ff0044";
const BLUE_COLOR = "#0044ff";
const GOAL_BAND_HEIGHT = 50;
const HAND_SIZE = 90;
const BACKGROUND_COLOR = "#1b2a41";


// ---------------------------------------------------------------------------
// ENTITIES
// ---------------------------------------------------------------------------

type Team = 'red' | 'blue';

/**
 * A soap bubble. All of its state is shared through save/load.
 */
class Bubble {
	constructor(
		public x = 0,
		public y = 0,
		public vx = 0,
		public vy = 0,
		// Index of the player currently holding this bubble (NO_PLAYER if free)
		public holder = NO_PLAYER,
		// Index of the last player who grabbed this bubble (used for internal scores)
		public lastGrabber = NO_PLAYER
	) {}

	/** True if a player is currently holding this bubble. */
	isHeld() {
		return this.holder !== NO_PLAYER;
	}

	/** Current speed norm. */
	speed() {
		return Math.sqrt(norm2(this.vx, this.vy));
	}

	/** Returns the collision circle of this bubble. */
	circle() {
		return { x: this.x, y: this.y, r: BUBBLE_RADIUS };
	}

	save() {
		return {
			x: this.x,
			y: this.y,
			vx: this.vx,
			vy: this.vy,
			holder: this.holder,
			lastGrabber: this.lastGrabber
		};
	}

	static fromSaved(obj: Fields) {
		return new Bubble(obj.x, obj.y, obj.vx, obj.vy, obj.holder, obj.lastGrabber);
	}
}


/**
 * A spike travelling in a straight line from (x0, y0) to (x1, y1).
 * During its first SPIKE_WAIT_TIME seconds it is only a grayed "waiting" marker
 * on the edge of the screen; afterwards it moves at a constant speed.
 * `age` is the only mutable value, everything else is fixed at spawn.
 */
class Spike {
	age = 0;

	constructor(
		readonly x0: number,
		readonly y0: number,
		readonly x1: number,
		readonly y1: number
	) {}

	/** Total distance between start and end. */
	length() {
		return Math.sqrt(norm2(this.x1 - this.x0, this.y1 - this.y0));
	}

	/** True once the waiting phase is over (spike is dangerous and moving). */
	isActive() {
		return this.age >= SPIKE_WAIT_TIME;
	}

	/** Progress along the path, between 0 (start) and 1 (end). */
	progress() {
		if (!this.isActive())
			return 0;

		const travelled = (this.age - SPIKE_WAIT_TIME) * SPIKE_SPEED;
		return Math.min(1, travelled / this.length());
	}

	/** True once the spike has reached the opposite edge. */
	isFinished() {
		return this.isActive() && this.progress() >= 1;
	}

	getX() {
		return this.x0 + (this.x1 - this.x0) * this.progress();
	}

	getY() {
		return this.y0 + (this.y1 - this.y0) * this.progress();
	}

	/** Direction of travel in radians (used to orient the sprite). */
	getAngle() {
		return Math.atan2(this.y1 - this.y0, this.x1 - this.x0);
	}

	/**
	 * Opacity used for drawing:
	 * low while waiting, rising linearly during the last SPIKE_FADE_TIME seconds
	 * of the waiting phase, then fully opaque.
	 */
	getOpacity() {
		const fadeStart = SPIKE_WAIT_TIME - SPIKE_FADE_TIME;
		if (this.age < fadeStart)
			return WAITING_SPIKE_ALPHA;

		if (this.age < SPIKE_WAIT_TIME) {
			const t = (this.age - fadeStart) / SPIKE_FADE_TIME;
			return WAITING_SPIKE_ALPHA + (1 - WAITING_SPIKE_ALPHA) * t;
		}

		return 1;
	}

	/** Returns the collision circle of this spike (only meaningful when active). */
	circle() {
		return { x: this.getX(), y: this.getY(), r: SPIKE_RADIUS };
	}

	save() {
		return {
			x0: this.x0,
			y0: this.y0,
			x1: this.x1,
			y1: this.y1,
			age: this.age
		};
	}

	static fromSaved(obj: Fields) {
		const spike = new Spike(obj.x0, obj.y0, obj.x1, obj.y1);
		spike.age = obj.age;
		return spike;
	}
}


class Player {
	connected = true;
	team: Team = 'red';

	// Score used only for the intra-team ranking (own goals subtract a point)
	internalScore = 0;

	// Last known pointer position (game coordinates) of this player
	targetX = 0;
	targetY = 0;

	/** Team is init data (shared through StartDataClient), so it is not part of save(). */
	initTeam(team: Team) {
		this.team = team;
	}

	/** Stores the latest pointer position of the player. */
	setTarget(x: number, y: number) {
		this.targetX = x;
		this.targetY = y;
	}

	save() {
		return {
			connected: this.connected,
			internalScore: this.internalScore,
			targetX: this.targetX,
			targetY: this.targetY
		};
	}

	load(obj: Fields) {
		this.connected = obj.connected;
		this.internalScore = obj.internalScore;
		this.targetX = obj.targetX;
		this.targetY = obj.targetY;
	}
}

// ---------------------------------------------------------------------------
// CLIENT-ONLY DATA (never shared)
// ---------------------------------------------------------------------------

interface Fx {
	x: number;
	y: number;
	age: number;
	duration: number;
}

interface BubbleBurstFx extends Fx {
	radius: number;
}

interface BubbleExplosionFx extends Fx {
	radius: number;
}

interface BubbleGrabFx extends Fx {
	radius: number;
}

class ClientData {
	firstFrame = true;

	mouseX = 0;
	mouseY = 0;

	skins: string[] = [];

	// Pointer bookkeeping used by collectInputs to only send what changed.
	pointerHeld = false;
	lastSentX: number | null = null;
	lastSentY: number | null = null;

	// Client-only visual effects.
	readonly bubbleBurstFx: BubbleBurstFx[] = [];
	readonly bubbleExplosionFx: BubbleExplosionFx[] = [];
	readonly bubbleGrabFx: BubbleGrabFx[] = [];

	readonly html: HTMLDivElement;
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-soapBubble-root");

		const scores = document.createElement("div");
		scores.classList.add("game-soapBubble-scores");

		this.redScore = document.createElement("div");
		this.blueScore = document.createElement("div");

		this.redScore.classList.add("game-soapBubble-red-score");
		this.blueScore.classList.add("game-soapBubble-blue-score");

		const dash = document.createElement("div");
		dash.classList.add("game-soapBubble-dash");
		dash.textContent = "-";

		scores.appendChild(this.redScore);
		scores.appendChild(dash);
		scores.appendChild(this.blueScore);

		this.html.appendChild(scores);
	}

	/** Refreshes the HTML scoreboard. */
	update(game: GMSoapBubble) {
		this.redScore.innerText =
			String(game.redScore).padStart(2, "0");

		this.blueScore.innerText =
			String(game.blueScore).padStart(2, "0");
	}

	/**
	 * Converts simulation events into client-only visual effects.
	 *
	 * These events are consumed immediately and are not part of
	 * the persistent game state.
	 */
	updateGameEvents(game: GMSoapBubble) {
		for (const event of game.clientConsumer!.consumeBubbleBurstEvents()) {
			this.bubbleBurstFx.push({
				x: event.x,
				y: event.y,
				age: 0,
				duration: 0.25,
				radius: BUBBLE_RADIUS
			});
		}

		for (const event of game.clientConsumer!.consumeBubbleExplosionEvents()) {
			this.bubbleExplosionFx.push({
				x: event.x,
				y: event.y,
				age: 0,
				duration: 0.35,
				radius: SPIKE_BURST_RADIUS * 0.35
			});
		}
	}

	/**
	 * Advances all client-only visual effects.
	 */
	updateFx(dt: number) {
		for (const fx of this.bubbleBurstFx)
			fx.age += dt;

		for (const fx of this.bubbleExplosionFx)
			fx.age += dt;

		for (const fx of this.bubbleGrabFx)
			fx.age += dt;

		this.removeExpired(this.bubbleBurstFx);
		this.removeExpired(this.bubbleExplosionFx);
		this.removeExpired(this.bubbleGrabFx);
	}

	private removeExpired<T extends Fx>(fxs: T[]) {
		for (let i = fxs.length - 1; i >= 0; i--) {
			if (fxs[i].age >= fxs[i].duration)
				fxs.splice(i, 1);
		}
	}

	/**
	 * Creates a visual effect when a player grabs a bubble.
	 */
	addBubbleGrabFx(x: number, y: number) {
		this.bubbleGrabFx.push({
			x,
			y,
			age: 0,
			duration: 0.2,
			radius: BUBBLE_RADIUS
		});
	}

	/**
	 * Draws the visual effect of a bubble bursting.
	 */
	drawBubbleBurstFx(
		ctx: CanvasRenderingContext2D
	) {
		for (const fx of this.bubbleBurstFx) {
			const t = Math.min(fx.age / fx.duration, 1);

			ctx.save();

			ctx.globalAlpha = 1 - t;

			const radius =
				fx.radius * (1 + t * 0.8);

			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 8 * (1 - t);

			ctx.beginPath();
			ctx.arc(
				fx.x,
				fx.y,
				radius,
				0,
				Math.PI * 2
			);
			ctx.stroke();

			const fragmentCount = 8;

			for (let i = 0; i < fragmentCount; i++) {
				const angle =
					i * Math.PI * 2 / fragmentCount;

				const distance =
					fx.radius * (0.4 + t * 1.2);

				const x =
					fx.x + Math.cos(angle) * distance;

				const y =
					fx.y + Math.sin(angle) * distance;

				const fragmentSize =
					8 * (1 - t);

				if (fragmentSize <= 0)
					continue;

				ctx.beginPath();
				ctx.arc(
					x,
					y,
					fragmentSize,
					0,
					Math.PI * 2
				);

				ctx.fillStyle = "#ffffff";
				ctx.fill();
			}

			ctx.restore();
		}
	}

	/**
	 * Draws the explosion produced when a bubble hits a spike.
	 */
	drawBubbleExplosionFx(
		ctx: CanvasRenderingContext2D
	) {
		for (const fx of this.bubbleExplosionFx) {
			const t = Math.min(fx.age / fx.duration, 1);

			ctx.save();

			ctx.globalAlpha = 1 - t;

			const radius =
				fx.radius * (0.4 + t * 2.2);

			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth =
				12 * (1 - t) + 2;

			ctx.beginPath();
			ctx.arc(
				fx.x,
				fx.y,
				radius,
				0,
				Math.PI * 2
			);
			ctx.stroke();

			const fragmentCount = 14;

			for (let i = 0; i < fragmentCount; i++) {
				const angle =
					i * Math.PI * 2 / fragmentCount +
					fx.age * 4;

				const distance =
					fx.radius * (0.5 + t * 2.0);

				const x =
					fx.x + Math.cos(angle) * distance;

				const y =
					fx.y + Math.sin(angle) * distance;

				const fragmentSize =
					14 * (1 - t);

				if (fragmentSize <= 0)
					continue;

				ctx.beginPath();

				ctx.arc(
					x,
					y,
					fragmentSize,
					0,
					Math.PI * 2
				);

				ctx.fillStyle = "#ffffff";
				ctx.fill();
			}

			ctx.restore();
		}
	}

	/**
	 * Draws the visual effect produced when entering/grabbing a bubble.
	 */
	drawBubbleGrabFx(
		ctx: CanvasRenderingContext2D
	) {
		for (const fx of this.bubbleGrabFx) {
			const t = Math.min(fx.age / fx.duration, 1);

			ctx.save();

			ctx.globalAlpha = 1 - t;

			const radius =
				fx.radius * (0.35 + t * 0.9);

			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth =
				7 * (1 - t) + 1;

			ctx.beginPath();

			ctx.arc(
				fx.x,
				fx.y,
				radius,
				0,
				Math.PI * 2
			);

			ctx.stroke();

			ctx.restore();
		}
	}
}

class TutorialData {
	constructor(private readonly game: GMSoapBubble) {}

	/** Returns the hint text to display (empty string = no text). */
	frame(dt: number, clock: number) {
		const holding = this.game.bubbles.some(b => b.isHeld());
		if (!holding)
			return "Press on a bubble and drag it toward your edge!";

		return "Avoid the spikes, they burst bubbles!";
	}
}


// ---------------------------------------------------------------------------
// LOBBY DOM
// ---------------------------------------------------------------------------

function generateClientDom(unlockedSkins: string[]) {
	return {
		skin: Object.keys(GMSoapBubble.SKINS)[0],
		preferTeam: 0,

		produce() {
			const {StartData} = protocols.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		},

		getIconPath: getSkinIconPath
	};
}

function getSkinTexturePath(id: string) {
	return `/assets/skins/${id}/hand.png`;
}

function getSkinIconPath(id: string) {
	return window.IMG_ROOT_PATH + `/assets/skins/${id}/icon.png`;
}


class ClientDataConsumer {
	bubbleBurstEvents: { x: number; y: number }[] = [];
	bubbleExplosionEvents: { x: number; y: number }[] = [];

	consumeBubbleBurstEvents() {
		const events = this.bubbleBurstEvents;
		this.bubbleBurstEvents = [];

		return events;
	}

	consumeBubbleExplosionEvents() {
		const events = this.bubbleExplosionEvents;
		this.bubbleExplosionEvents = [];

		return events;
	}
}


// ---------------------------------------------------------------------------
// GAME MODE
// ---------------------------------------------------------------------------

export class GMSoapBubble extends GameMode {
	static readonly types = {Player};

	static readonly DATA = {
		WIDTH,
		HEIGHT,
		WIN_SCORE
	};

	readonly players: Player[];
	bubbles: Bubble[] = [];
	spikes: Spike[] = [];

	// Total elapsed simulation time, in seconds.
	gameTime = 0;

	// Team scores. Red owns the top edge, blue owns the bottom edge.
	redScore = 0;
	blueScore = 0;

	// Timers (seconds). The bubble timer starts full so that a bubble appears immediately.
	bubbleTimer = SPAWN_BUBBLE_COOLDOWN;
	spikeTimer = 0;

	// Alternates the side spikes come from
	spikeFromRight = false;

	// Pre-rolled random heights of the NEXT spike (shared so clients stay in sync)
	nextSpikeY0 = 0;
	nextSpikeY1 = 0;

	private constructor(
		total: number,
		public readonly clientConsumer: ClientDataConsumer | null
	) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player()
		);
	}

	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const rng = () => Math.random(); // allowed only in createServ

		const {StartData, StartDataClient} = protocols.get();
		const game = new GMSoapBubble(total, null);

		// Pre-roll the heights of the first spike
		game.rollNextSpikeHeights(rng);

		function decode(i: number) {
			if (i < players.length)
				return decodeFullMessage(StartData.decode(players[i].data));

			return generateClientDom([]);
		}

		// Pre-decode all player messages once
		const playerInfos = await Promise.all(
			game.players.map(async (p, i) => {
				const d = decode(i);
				let skin: string;
				const pseudo = i < players.length ? players[i].pseudo : null;
				if (pseudo !== null && GMSoapBubble.SKINS_IDS.includes(d.skin)) {
					if (await hasSkin('soapBubble', d.skin, pseudo)) {
						skin = d.skin as string;
					} else {
						skin = GMSoapBubble.SKINS_IDS[0];
					}
				} else {
					skin = GMSoapBubble.SKINS_IDS[0];
				}

				return {
					player: p,
					index: i,
					skin: skin,
					pref: d.preferTeam ?? 0
				};
			})
		);

		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);

		const assigned = new Array<boolean>(totalPlayers);
		let redCount = 0;
		let blueCount = 0;

		// Phase 1: honor explicit team preferences while capacity allows
		for (let i = 0; i < totalPlayers; i++) {
			const info = playerInfos[i];
			if (info.pref === 1 && redCount < maxPerTeam) {
				assigned[info.index] = true;
				redCount++;
			} else if (info.pref === -1 && blueCount < maxPerTeam) {
				assigned[info.index] = false;
				blueCount++;
			}
		}

		// Phase 2: fill remaining slots keeping teams balanced
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

		// Phase 3: apply final teams
		for (const [i, p] of game.players.entries()) {
			p.initTeam(assigned[i] ? 'red' : 'blue');
		}

		const data = StartDataClient.encode({
			players: game.players.map((p, idx) => ({
				skin: playerInfos[idx].skin,
				isRed: p.team === 'red'
			}))
		}).finish();

		return {
			game,
			data
		};
	}

	static createClient(
		{data, origin}: MultiplayerClientEntry,
		total: number,
		playerIdx: number
	) {
		const game = new GMSoapBubble(total, new ClientDataConsumer());
		const {StartData, StartDataClient} = protocols.get();
		const clientData = new ClientData();
		let skins: { [k: string]: string; };

		if (origin === 'server') {
			const {players} = decodeFullMessage(StartDataClient.decode(data));

			const skinSet = new Set<string>();
			for (const [idx, p] of players.entries()) {
				game.players[idx].initTeam(p.isRed ? 'red' : 'blue');
				clientData.skins.push(p.skin);
				skinSet.add(p.skin);
			}
			skins = Object.fromEntries(
				[...skinSet].map(key => ['skin-' + key, getSkinTexturePath(key)])
			);

		} else { // origin === 'client' (local / tutorial)
			const {skin} = decodeFullMessage(StartData.decode(data));

			// Alternate teams: even index = red, odd index = blue
			for (const [i, p] of game.players.entries()) {
				p.initTeam(i % 2 === 0 ? 'red' : 'blue');
			}

			clientData.skins = Array.from(
				{length: game.players.length},
				() => GMSoapBubble.SKINS_IDS[0]
			);
			clientData.skins[0] = skin;

			skins = {};
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
		'default': "Default",
	};
	static readonly SKINS_IDS = Object.keys(GMSoapBubble.SKINS);

	static readonly TEXTURES = {
		'bubble': "/assets/games/soapBubble/bubble.svg",
		'spike': "/assets/games/soapBubble/spike.svg",
		'goal-red': "/assets/games/soapBubble/goal-red.svg",
		'goal-blue': "/assets/games/soapBubble/goal-blue.svg",
		'target': "/assets/games/soapBubble/target.png"
	};


	override init(): void {

	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
	}


	// -----------------------------------------------------------------------
	// SIMULATION
	// -----------------------------------------------------------------------

	override run(
		dt: number,
		produceFinish: boolean,
		rng: GameRandomGenerator | null
	): FinishGame | null {
		this.gameTime += dt;

		this.updateBubbleSpawner(dt);
		this.updateSpikeSpawner(dt, rng);
		this.updateSpikes(dt);

		this.updateBubbles(dt);
		this.bounceBubblesOnWalls();
		this.bounceBubblesOnEachOther();
		this.burstBubblesTouchingSpikes();
		this.scoreBubblesInGoals();

		const finished = this.redScore >= WIN_SCORE || this.blueScore >= WIN_SCORE;
		if (produceFinish && finished) {
			return this.produceFinish();
		}

		return null;
	}

	/** Spawns a motionless bubble at the center of the screen every SPAWN_BUBBLE_COOLDOWN seconds. */
	private updateBubbleSpawner(dt: number) {
		this.bubbleTimer += dt;
		while (this.bubbleTimer >= SPAWN_BUBBLE_COOLDOWN) {
			this.bubbleTimer -= SPAWN_BUBBLE_COOLDOWN;
			this.bubbles.push(new Bubble(0, 0, 0, 0));
		}
	}

	/**
	* Returns the current spike spawn cooldown using an exponential decay.
	*/
	private getSpikeSpawnCooldown() {
		return SPIKE_SPAWN_BASE + (
			SPIKE_SPAWN_COOLDOWN - SPIKE_SPAWN_BASE
		) * Math.exp(
			-SPIKE_SPAWN_DECAY * this.gameTime
		);
	}

	/**
	 * Spawns waiting spikes according to an exponentially decreasing cooldown.
	 *
	 * The current cooldown is:
	 *     f(t) = SPIKE_SPAWN_COOLDOWN * exp(-k * t)
	 *
	 * where t is the elapsed game time.
	 */
	private updateSpikeSpawner(dt: number, rng: GameRandomGenerator | null) {
		this.spikeTimer += dt;

		let cooldown = this.getSpikeSpawnCooldown();

		while (this.spikeTimer >= cooldown) {
			this.spikeTimer -= cooldown;
			this.spawnWaitingSpike();

			if (rng) {
				this.rollNextSpikeHeights(rng);
			}

			// Recompute the cooldown because gameTime may have advanced
			// significantly during a large simulation step.
			cooldown = this.getSpikeSpawnCooldown();
		}
	}

	private evalSpikeDyRange() {
		return Math.exp(SPIKE_DY_DECAY * this.gameTime);
	}

	/** Rolls the start/end heights of the next spike (values are shared through State). */
	private rollNextSpikeHeights(rng: GameRandomGenerator) {
		const span = HEIGHT - 2 * SPIKE_RADIUS;
		this.nextSpikeY0 = -HALF_HEIGHT + SPIKE_RADIUS + rng() * span;
		const sign = this.nextSpikeY0 >= 0 ? 1 : -1;
		this.nextSpikeY1 = span/4 * (sign + this.evalSpikeDyRange() * (rng() - .5));
	}

	/**
	 * Creates a spike going from one lateral edge to the opposite one.
	 * The starting side alternates at every spawn.
	 */
	private spawnWaitingSpike() {
		const x0 = this.spikeFromRight ? HALF_WIDTH : -HALF_WIDTH;
		const x1 = -x0; // WIDTH - x0 in top-left coordinates
		this.spikes.push(new Spike(x0, this.nextSpikeY0, x1, this.nextSpikeY1));
		this.spikeFromRight = !this.spikeFromRight;
	}

	/** Ages every spike and removes those that left the screen. */
	private updateSpikes(dt: number) {
		for (const spike of this.spikes) {
			spike.age += dt;
		}
		this.spikes = this.spikes.filter(s => !s.isFinished());
	}

	/** Applies grab acceleration, drag and movement to every bubble. */
	private updateBubbles(dt: number) {
		for (const bubble of this.bubbles) {
			if (bubble.isHeld()) {
				const owner = this.players[bubble.holder];
				this.applyGrabAcceleration(bubble, owner.targetX, owner.targetY, dt);
			}

			this.applyDrag(bubble, bubble.isHeld() ? HELD_DRAG : FREE_DRAG, dt);
			this.clampHardSpeed(bubble);

			bubble.x += bubble.vx * dt;
			bubble.y += bubble.vy * dt;
		}
	}

	/**
	 * Accelerates a bubble toward the pointer.
	 * The speed GAINED from grabbing is limited to GRAB_MAX_SPEED, but a bubble
	 * that is already faster (because of a bounce) is never slowed down abruptly:
	 * the limit is max(GRAB_MAX_SPEED, previous speed).
	 */
	private applyGrabAcceleration(bubble: Bubble, tx: number, ty: number, dt: number) {
		const dx = tx - bubble.x;
		const dy = ty - bubble.y;
		const dist = Math.sqrt(norm2(dx, dy));
		if (dist < 1e-6)
			return;

		// Acceleration fades close to the pointer so the bubble does not jitter
		const strength = GRAB_ACCEL * Math.min(1, dist / GRAB_FULL_ACCEL_DISTANCE);

		const oldSpeed = bubble.speed();
		let nvx = bubble.vx + (dx / dist) * strength * dt;
		let nvy = bubble.vy + (dy / dist) * strength * dt;

		const newSpeed = Math.sqrt(norm2(nvx, nvy));
		const allowed = Math.max(GRAB_MAX_SPEED, oldSpeed);
		if (newSpeed > allowed) {
			const k = allowed / newSpeed;
			nvx *= k;
			nvy *= k;
		}

		bubble.vx = nvx;
		bubble.vy = nvy;
	}

	/** Exponential drag (frame-rate independent). */
	private applyDrag(bubble: Bubble, drag: number, dt: number) {
		const k = Math.exp(-drag * dt);
		bubble.vx *= k;
		bubble.vy *= k;
	}

	/** Safety cap so that chained bounces can never explode. */
	private clampHardSpeed(bubble: Bubble) {
		const speed = bubble.speed();
		if (speed > HARD_MAX_SPEED) {
			const k = HARD_MAX_SPEED / speed;
			bubble.vx *= k;
			bubble.vy *= k;
		}
	}

	/** Bounces bubbles on the left and right walls. */
	private bounceBubblesOnWalls() {
		for (const b of this.bubbles) {
			if (b.x - BUBBLE_RADIUS < -HALF_WIDTH) {
				b.x = -HALF_WIDTH + BUBBLE_RADIUS;
				b.vx = Math.abs(b.vx) * BOUNCE_RESTITUTION;
			} else if (b.x + BUBBLE_RADIUS > HALF_WIDTH) {
				b.x = HALF_WIDTH - BUBBLE_RADIUS;
				b.vx = -Math.abs(b.vx) * BOUNCE_RESTITUTION;
			}
		}
	}

	/** Detects every bubble/bubble contact and resolves it. */
	private bounceBubblesOnEachOther() {
		for (let i = 0; i < this.bubbles.length; i++) {
			for (let j = i + 1; j < this.bubbles.length; j++) {
				const a = this.bubbles[i];
				const b = this.bubbles[j];
				if (collisions.CircleCircle(a.circle(), b.circle())) {
					this.resolveBubbleCollision(a, b);
				}
			}
		}
	}

	/**
	 * Separates two overlapping bubbles and exchanges momentum along the contact
	 * normal (equal masses). The result is applied directly to vx, vy.
	 */
	private resolveBubbleCollision(a: Bubble, b: Bubble) {
		let nx = b.x - a.x;
		let ny = b.y - a.y;
		let dist = Math.sqrt(norm2(nx, ny));

		// Perfectly overlapping bubbles: pick a deterministic axis
		if (dist < 1e-6) {
			nx = 1;
			ny = 0;
			dist = 0;
		} else {
			nx /= dist;
			ny /= dist;
		}

		// Positional correction: push each bubble half of the overlap apart
		const overlap = 2 * BUBBLE_RADIUS - dist;
		if (overlap > 0) {
			a.x -= nx * overlap / 2;
			a.y -= ny * overlap / 2;
			b.x += nx * overlap / 2;
			b.y += ny * overlap / 2;
		}

		// Velocity correction: only if the bubbles are approaching each other
		const relativeNormalSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
		if (relativeNormalSpeed < 0) {
			const impulse = -(1 + BOUNCE_RESTITUTION) * relativeNormalSpeed / 2;
			a.vx -= impulse * nx;
			a.vy -= impulse * ny;
			b.vx += impulse * nx;
			b.vy += impulse * ny;
		}
	}

	private burstBubblesTouchingSpikes() {
		const activeSpikes = this.spikes.filter(s => s.isActive());

		if (activeSpikes.length === 0)
			return;

		const triggeredSpikes = new Set<Spike>();
		const bubblesToBurst = new Set<Bubble>();

		for (const bubble of this.bubbles) {
			const bubbleCircle = bubble.circle();

			for (const spike of activeSpikes) {
				if (collisions.CircleCircle(bubbleCircle, spike.circle())) {
					triggeredSpikes.add(spike);
					bubblesToBurst.add(bubble);

					// The bubble itself bursts here.
					if (this.clientConsumer) {
						this.clientConsumer.bubbleBurstEvents.push({
							x: bubble.x,
							y: bubble.y
						});
	
						// The spike causes an explosion at the collision point.
						this.clientConsumer.bubbleExplosionEvents.push({
							x: spike.getX(),
							y: spike.getY()
						});
					}
				}
			}
		}

		if (triggeredSpikes.size === 0)
			return;

		// Destroy all spikes in the explosion radius.
		this.spikes = this.spikes.filter(spike => {
			for (const triggered of triggeredSpikes) {
				const dx = spike.getX() - triggered.getX();
				const dy = spike.getY() - triggered.getY();

				if (
					dx * dx + dy * dy <=
					SPIKE_BURST_RADIUS * SPIKE_BURST_RADIUS
				) {
					return false;
				}
			}

			return true;
		});

		// Destroy all bubbles touching a triggered spike.
		this.bubbles = this.bubbles.filter(
			bubble => !bubblesToBurst.has(bubble)
		);
	}

	/**
	 * Checks whether bubbles reached the top or bottom edge.
	 * The team owning that edge scores; the bubble is consumed.
	 */
	private scoreBubblesInGoals() {
		const remaining: Bubble[] = [];
		for (const bubble of this.bubbles) {
			if (bubble.y <= -HALF_HEIGHT) {
				this.scoreGoal(bubble, 'red');
			} else if (bubble.y >= HALF_HEIGHT) {
				this.scoreGoal(bubble, 'blue');
			} else {
				remaining.push(bubble);
			}
		}
		this.bubbles = remaining;
	}

	/**
	 * Awards a point to `team`. The last grabber gains an internal point if he is
	 * on that team, and loses one (own goal) otherwise.
	 */
	private scoreGoal(bubble: Bubble, team: Team) {
		if (team === 'red') this.redScore++;
		else this.blueScore++;

		if (bubble.lastGrabber === NO_PLAYER)
			return;

		const grabber = this.players[bubble.lastGrabber];
		grabber.internalScore += (grabber.team === team) ? 1 : -1;
	}


	// -----------------------------------------------------------------------
	// INPUTS
	// -----------------------------------------------------------------------

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		switch (input.action) {
			case 'pointerDown':
				player.setTarget(input.pointerDown.x, input.pointerDown.y);
				this.tryGrab(playerIdx, input.pointerDown.x, input.pointerDown.y);
				break;

			case 'pointerMove':
				player.setTarget(input.pointerMove.x, input.pointerMove.y);
				break;

			case 'pointerUp':
				this.releaseBubble(playerIdx);
				break;
		}
	}

	/** True if the player already holds a bubble (only one at a time). */
	private isHolding(playerIdx: number) {
		return this.bubbles.some(b => b.holder === playerIdx);
	}

	/**
	 * Grabs the closest FREE bubble under (x, y), if any.
	 * A bubble can only be held by one player at a time.
	 */
	private tryGrab(playerIdx: number, x: number, y: number) {
		if (this.isHolding(playerIdx))
			return;

		const reach = BUBBLE_RADIUS + GRAB_TOLERANCE;
		let best: Bubble | null = null;
		let bestDist = reach * reach;

		for (const bubble of this.bubbles) {
			if (bubble.isHeld())
				continue;

			const d = norm2(x - bubble.x, y - bubble.y);
			if (d <= bestDist) {
				bestDist = d;
				best = bubble;
			}
		}

		if (best !== null) {
			best.holder = playerIdx;
			best.lastGrabber = playerIdx;
		}
	}

	/** Lets go of every bubble held by this player (keeps its velocity). */
	private releaseBubble(playerIdx: number) {
		for (const bubble of this.bubbles) {
			if (bubble.holder === playerIdx) {
				bubble.holder = NO_PLAYER;
			}
		}
	}

	/**
	 * Reads the pointer (first touch on mobile, left mouse button otherwise)
	 * and returns null when nothing is pressed.
	 */
	private readPointer(mouse: IMouseController, mobile: IMobileController | null) {
		if (mobile) {
			const digits = mobile.getDigits();
			if (digits.length > 0)
				return { x: digits[0].x, y: digits[0].y };
		}

		if (mouse.press(0)) {
			const c = mouse.getCoords();
			return { x: c.x, y: c.y };
		}

		return null;
	}

	override collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		const inputs: Fields[] = [];

		const pointer = this.readPointer(mouse, mobile);

		// Pointer released
		if (pointer === null) {
			if (data.pointerHeld) {
				inputs.push({ action: 'pointerUp', pointerUp: {} });
				data.pointerHeld = false;
				data.lastSentX = null;
				data.lastSentY = null;
			}
			return inputs;
		}

		// Integer coordinates keep server and clients perfectly deterministic
		const x = Math.round(pointer.x);
		const y = Math.round(pointer.y);
		data.mouseX = x;
		data.mouseY = y;

		if (!data.pointerHeld) {
			// Press just started: try to grab
			inputs.push({ action: 'pointerDown', pointerDown: { x, y } });
			data.pointerHeld = true;
			data.lastSentX = x;
			data.lastSentY = y;
		} else if (x !== data.lastSentX || y !== data.lastSentY) {
			// Only send the position when it changed
			inputs.push({ action: 'pointerMove', pointerMove: { x, y } });
			data.lastSentX = x;
			data.lastSentY = y;
		}

		return inputs;
	}


	// -----------------------------------------------------------------------
	// RENDERING
	// -----------------------------------------------------------------------

	/** Colored bands showing each team's goal edge. */
	private drawGoals(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		// Red goal (top)
		ctx.drawImage(
			imageLoader.get('goal-red'),
			-HALF_WIDTH, -HALF_HEIGHT, WIDTH, GOAL_BAND_HEIGHT
		);

		// Blue goal (bottom), flipped vertically
		ctx.save();
		ctx.scale(1, -1);
		ctx.drawImage(
			imageLoader.get('goal-blue'),
			-HALF_WIDTH, -HALF_HEIGHT, WIDTH, GOAL_BAND_HEIGHT
		);
		ctx.restore();
	}

	/**
	 * Draws spikes and their remaining trajectories.
	 *
	 * Waiting spikes display their complete trajectory.
	 * Active spikes display only the part of the trajectory that remains.
	 */
	private drawSpikes(
		ctx: CanvasRenderingContext2D,
		imageLoader: ImageLoaderFolder
	) {
		for (const spike of this.spikes) {
			const alpha = spike.getOpacity();

			// Determine the beginning of the dashed trajectory.
			// While waiting, the spike has not started moving yet, so the
			// trajectory starts at its original spawn position.
			// Once active, only the remaining part is displayed.
			const startX = spike.isActive() ? spike.getX() : spike.x0;
			const startY = spike.isActive() ? spike.getY() : spike.y0;

			// Draw the remaining trajectory.
			ctx.save();
			ctx.globalAlpha = alpha * 0.4;
			ctx.strokeStyle = "#aaaaaa";
			ctx.lineWidth = 4;
			ctx.setLineDash([20, 20]);

			ctx.beginPath();
			ctx.moveTo(startX, startY);
			ctx.lineTo(spike.x1, spike.y1);
			ctx.stroke();

			ctx.restore();

			// Draw the spike itself.
			ctx.save();
			ctx.globalAlpha = alpha;

			// Waiting spikes are displayed in grayscale.
			if (!spike.isActive()) {
				ctx.filter = 'grayscale(1)';
			}

			ctx.translate(spike.getX(), spike.getY());
			ctx.rotate(spike.getAngle());

			ctx.drawImage(
				imageLoader.get('spike'),
				-SPIKE_RADIUS,
				-SPIKE_RADIUS,
				SPIKE_RADIUS * 2,
				SPIKE_RADIUS * 2
			);

			ctx.restore();
		}
	}

	/** Draws bubbles, with a team-colored ring when they are held. */
	private drawBubbles(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		for (const bubble of this.bubbles) {
			ctx.drawImage(
				imageLoader.get('bubble'),
				bubble.x - BUBBLE_RADIUS, bubble.y - BUBBLE_RADIUS,
				BUBBLE_RADIUS * 2, BUBBLE_RADIUS * 2
			);

			if (bubble.isHeld()) {
				const team = this.players[bubble.holder].team;
				ctx.strokeStyle = team === 'red' ? RED_COLOR : BLUE_COLOR;
				ctx.lineWidth = 8;
				ctx.beginPath();
				ctx.arc(bubble.x, bubble.y, BUBBLE_RADIUS, 0, Math.PI * 2);
				ctx.stroke();
			}
		}
	}

	/** Draws a line + hand icon from each held bubble to its holder's pointer. */
	private drawHands(
		ctx: CanvasRenderingContext2D,
		imageLoader: ImageLoaderFolder,
		data: ClientData
	) {
		for (const bubble of this.bubbles) {
			if (!bubble.isHeld())
				continue;

			const player = this.players[bubble.holder];
			ctx.save();
			ctx.globalAlpha = 0.6;
			ctx.strokeStyle = player.team === 'red' ? RED_COLOR : BLUE_COLOR;
			ctx.lineWidth = 6;
			ctx.beginPath();
			ctx.moveTo(bubble.x, bubble.y);
			ctx.lineTo(player.targetX, player.targetY);
			ctx.stroke();
			ctx.restore();

			ctx.drawImage(
				imageLoader.get('target', player.team === 'red' ? 0 : 1),
				player.targetX - HAND_SIZE / 2, player.targetY - HAND_SIZE / 2,
				HAND_SIZE, HAND_SIZE
			);
		}
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader,
		addCamZ: number,
		dt: number
	) {
		ctx.imageSmoothingEnabled = false;

		const imageLoader = _imageLoader.getFolder('soapBubble');
		const data = _data as ClientData;

		if (data.firstFrame) {
			data.firstFrame = false;

			imageLoader.setColorRule('target', 0, [
				{prev: "#ff00ff", next: "#ff0044"}
			]);

			imageLoader.setColorRule('target', 1, [
				{prev: "#ff00ff", next: "#4444ff"}
			]);
		}

		// Detect client-side events before replacing the previous snapshot.
		data.updateGameEvents(this);

		// Advance and remove expired visual effects.
		data.updateFx(dt);

		data.update(this);

		ctx.fillStyle = BACKGROUND_COLOR;
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		// Origin is the center of the screen.
		ctx.save();
		ctx.translate(HALF_WIDTH, HALF_HEIGHT);

		// The red team sees the game vertically mirrored.
		if (this.players[playerIdx].team === 'red') {
			ctx.scale(1, -1);
		}

		this.drawGoals(ctx, imageLoader);
		this.drawSpikes(ctx, imageLoader);
		this.drawBubbles(ctx, imageLoader);
		this.drawHands(ctx, imageLoader, data);

		// Client-only visual effects.
		// data.drawBubbleBurstFx(ctx);
		data.drawBubbleExplosionFx(ctx);
		data.drawBubbleGrabFx(ctx);

		ctx.restore();
	}


	// -----------------------------------------------------------------------
	// CONNECTION / SAVE / LOAD
	// -----------------------------------------------------------------------

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
		// A disconnected player must not keep holding a bubble
		this.releaseBubble(id);
	}

	override save(): Uint8Array {
		const {State} = protocols.get();

		const object: Fields = {
			players: this.players.map(p => p.save()),
			bubbles: this.bubbles.map(b => b.save()),
			spikes: this.spikes.map(s => s.save()),
			redScore: this.redScore,
			blueScore: this.blueScore,
			gameTime: this.gameTime,
			bubbleTimer: this.bubbleTimer,
			spikeTimer: this.spikeTimer,
			spikeFromRight: this.spikeFromRight,
			nextSpikeY0: this.nextSpikeY0,
			nextSpikeY1: this.nextSpikeY1,
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const {State} = protocols.get();
		const obj = State.decode(data);

		for (let i = 0; i < obj.players.length; i++) {
			this.players[i].load(obj.players[i]);
		}

		this.bubbles = obj.bubbles.map((b: Fields) => Bubble.fromSaved(b));
		this.spikes = obj.spikes.map((s: Fields) => Spike.fromSaved(s));

		this.redScore = obj.redScore;
		this.blueScore = obj.blueScore;
		this.gameTime = obj.gameTime;
		this.bubbleTimer = obj.bubbleTimer;
		this.spikeTimer = obj.spikeTimer;
		this.spikeFromRight = obj.spikeFromRight;
		this.nextSpikeY0 = obj.nextSpikeY0;
		this.nextSpikeY1 = obj.nextSpikeY1;
	}

	override getSize() {
		return {width: WIDTH, height: HEIGHT};
	}

	/** Converts canvas coordinates to game coordinates (origin at screen center, no camera). */
	override evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;

		const ret = {
			x: x - HALF_WIDTH,
			y: y - HALF_HEIGHT
		};

		if (this.players[playerIdx].team === 'red') {
			ret.y = -ret.y;
		}

		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;

		return ret;
	}

	/** Pure drag gameplay: no joystick and no button needed. */
	override getMobileDesc(): MobileDescriptor {
		return {
			joysticks: {},
			buttons: {}
		};
	}

	override createTutorial() {
		return new TutorialData(this);
	}


	// -----------------------------------------------------------------------
	// FINISH
	// -----------------------------------------------------------------------

	/** Player indexes of a team, best internal score first (ties keep index order). */
	private rankTeam(team: Team): number[] {
		return this.players
			.map((p, i) => ({ p, i }))
			.filter(e => e.p.team === team)
			.sort((a, b) => (b.p.internalScore - a.p.internalScore) || (a.i - b.i))
			.map(e => e.i);
	}

	private produceFinish(): FinishGame {
		const red = this.rankTeam('red');
		const blue = this.rankTeam('blue');

		// Best team first
		const redWins = this.redScore >= this.blueScore;
		const results = redWins ? [red, blue] : [blue, red];

		// Both teams tied (e.g. reached the score on the same frame)
		const teamEqualities = this.redScore === this.blueScore ? [0] : [];

		// Player i and player i+1 are tied if in the same team with the same internal score
		const playerEqualities: number[] = [];
		for (let i = 0; i + 1 < this.players.length; i++) {
			const a = this.players[i];
			const b = this.players[i + 1];
			if (a.team === b.team && a.internalScore === b.internalScore) {
				playerEqualities.push(i);
			}
		}

		return { results, teamEqualities, playerEqualities };
	}
}

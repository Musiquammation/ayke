import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { GameRandomGenerator } from "../util/GameRandomGenerator";
import { ImageLoader } from "../util/ImageLoader";
import { ClientData } from "./trustIssues/client";
import {
	HEIGHT,
	MATCH_DURATION,
	PLAYER_COLOR_NAMES,
	PLAYER_COLORS,
	WIDTH,
	YAW_SEND_THRESHOLD,
	ZONE_COUNT,
} from "./trustIssues/constants";
import { generateLevel, Level } from "./trustIssues/level";
import { ensureRapier, isRapierReady, TrustPhysics } from "./trustIssues/physics";
import { TrustRenderer } from "./trustIssues/render";
import {
	compareStanding,
	explode,
	initialSpawn,
	Player,
	queueJump,
	releaseJump,
	ranking,
	Splat,
	stepWorld,
	TrustState,
} from "./trustIssues/simulation";
import { TutorialData } from "./trustIssues/tutorial";

/* -------------------------------------------------------------------------- */
/* Trust Issues                                                               */
/*                                                                            */
/* Everybody starts on a floating spawn. Five zones float around it, linked   */
/* to it by invisible platforms (winding paths and dead ends). Pressing E     */
/* makes the player explode: the platforms around get painted with its color  */
/* (for everybody); one second later the player is back on the spawn.       */
/* The first three players reaching a zone get 10, 5 and 2 points.            */
/* The game lasts 7 minutes (less when nobody can score anymore).             */
/* -------------------------------------------------------------------------- */

const protocols = getProtocol('trustIssues', 'multiplayer');

/** The world always advances by this step (seconds), whatever the frame rate. */
const FIXED_STEP = 1 / 120;
/** Floating point tolerance on the accumulator (seconds). */
const STEP_TOLERANCE = 1e-7;
/** At most this many steps per run (10 s): beyond, the late time is dropped. */
const MAX_STEPS_PER_RUN = 1200;
/** Corrections larger than this (meters) are not smoothed: the player jumps there. */
const MAX_SMOOTHED_CORRECTION = 3;
/** A move longer than this in one step (meters) is a teleport: it is drawn without interpolation. */
const MAX_INTERPOLATED_MOVE = 2;
/** How fast a drawn correction fades (1/s). */
const CORRECTION_FADE = 12;

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}


/* -------------------------------------------------------------------------- */
/* Lobby panel (trustIssues.html): the player picks a color                   */
/* -------------------------------------------------------------------------- */

function generateClientDom(unlockedSkins: string[]) {
	return {
		color: 0,
		COLORS: PLAYER_COLORS,
		COLOR_NAMES: PLAYER_COLOR_NAMES,
		unlockedSkins,

		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({
				color: normalizeColor(this.color),
			}).finish();
		},

		hasSkin(skin: string) {
			return this.unlockedSkins.includes(skin);
		},
	};
}

/** Clamp any value to a valid color index. */
function normalizeColor(value: unknown) {
	const n = Number(value);
	return Number.isInteger(n) && n >= 0 && n < PLAYER_COLORS.length ? n : 0;
}

/**
 * Give each player its preferred color when nobody took it before, then give
 * the others (and the bots) the colors nobody uses yet. Colors repeat when
 * there are more than 4 players.
 */
function assignColors(preferred: (number | null)[]) {
	const used = new Set<number>();
	const result: number[] = preferred.map(c => {
		if (c === null || used.has(c))
			return -1;
		used.add(c);
		return c;
	});

	let next = 0;
	for (let i = 0; i < result.length; i++) {
		if (result[i] >= 0)
			continue;
		while (used.has(next % PLAYER_COLORS.length) && used.size < PLAYER_COLORS.length)
			next++;
		result[i] = next % PLAYER_COLORS.length;
		used.add(result[i]);
		next++;
	}

	return result;
}

/** A random 32 bits seed for the level. */
function randomSeed() {
	return Math.floor(Math.random() * 0xffffffff) >>> 0;
}


/* -------------------------------------------------------------------------- */
/* Game mode                                                                  */
/* -------------------------------------------------------------------------- */

export class GMTrustIssues extends GameMode implements TrustState {
	static readonly types = { Player, Splat };

	static readonly DATA = { WIDTH, HEIGHT, MATCH_DURATION };

	/* ---------- Shared state (saved / loaded) ---------- */
	readonly players: Player[];
	splats: Splat[] = [];
	zoneArrivals: number[][] = Array.from({ length: ZONE_COUNT }, () => []);
	nextSplatId = 0;
	time = MATCH_DURATION;
	finished = false;
	/**
	 * Simulated time not turned into a fixed step yet. The world always advances
	 * by FIXED_STEP, whatever the dt given to run(): the result then does not
	 * depend on how the time was split (frames, replays after a server state,
	 * server steps), so the client prediction matches the server exactly.
	 */
	accumulator = 0;

	/** Built from the seed (start data): never sent again. */
	readonly level: Level;

	/* ---------- Local mirror (rebuilt from the shared state at every move) ---------- */
	private physics: TrustPhysics | null = null;

	/**
	 * Client-only, never sent. Positions predicted just before the last load()
	 * and the game clock they belong to: once the replay reaches that clock
	 * again, the difference is the correction brought by the server.
	 */
	private beforeLoad: { clock: number, pos: { x: number, y: number, z: number }[] } | null = null;
	/** Client-only: drawn position minus simulated position of each player (fades out). */
	readonly visualOffsets: { x: number, y: number, z: number }[];
	/**
	 * Client-only: positions at the previous fixed step. The world advances by
	 * fixed steps, while frames come at any rate: drawing the last step as is
	 * makes the motion stutter (0, 1 or 2 steps per frame). Drawn positions are
	 * interpolated between the previous and the last step instead.
	 */
	private readonly prevPos: { x: number, y: number, z: number }[];

	/** Resolved once Rapier is loaded (awaited by the local game handler before starting). */
	readonly engineReady: Promise<void>;

	private constructor(total: number, seed: number) {
		super();
		this.level = generateLevel(seed);
		this.players = Array.from({ length: total }, (_, i) => new Player(i));
		this.visualOffsets = this.players.map(() => ({ x: 0, y: 0, z: 0 }));
		this.prevPos = this.players.map(() => ({ x: 0, y: 0, z: 0 }));
		initialSpawn(this);

		// Rapier's WASM may still be loading on the client: create the world as soon as possible
		const createPhysics = () => {
			this.physics = new TrustPhysics(this.level, total);
		};
		if (isRapierReady()) {
			createPhysics();
			this.engineReady = Promise.resolve();
		} else {
			this.engineReady = ensureRapier().then(createPhysics);
		}
	}

	/* ---------------------------- Creation ---------------------------- */

	static async createServ(
		players: PlayerInput[],
		total: number,
		_hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();
		await ensureRapier();
		const seed = randomSeed();
		const game = new GMTrustIssues(total, seed);

		const preferred = Array.from({ length: total }, (_, i) => {
			if (i >= players.length)
				return null;
			try {
				return normalizeColor(decodeFullMessage(StartData.decode(players[i].data)).color);
			} catch {
				return null;
			}
		});
		const colors = assignColors(preferred);

		const data = StartDataClient.encode({
			seed,
			players: game.players.map((_, i) => ({
				name: (i < players.length ? players[i].pseudo : null) ?? `Bot ${i + 1}`,
				color: colors[i],
			})),
		}).finish();

		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		playerIdx: number
	) {
		const { StartData, StartDataClient } = protocols.get();
		const clientData = new ClientData(playerIdx);
		let game: GMTrustIssues;

		if (origin === 'server') {
			const { seed, players } = decodeFullMessage(StartDataClient.decode(data));
			game = new GMTrustIssues(total, Number(seed) >>> 0);
			for (const [i, p] of (players ?? []).entries()) {
				clientData.names[i] = p.name;
				clientData.colors[i] = PLAYER_COLORS[normalizeColor(p.color)];
			}
		} else {
			// Local game (tutorial / training): player 0 is the human, the others are bots
			game = new GMTrustIssues(total, randomSeed());
			const { color } = decodeFullMessage(StartData.decode(data));
			const colors = assignColors(game.players.map((_, i) => i === 0 ? normalizeColor(color) : null));
			for (let i = 0; i < total; i++) {
				clientData.names[i] = i === 0 ? "You" : `Bot ${i}`;
				clientData.colors[i] = PLAYER_COLORS[colors[i]];
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

	/** Everything is drawn by three.js; the icon is listed because the loader waits for at least one image. */
	static readonly TEXTURES = {
		'icon': "/assets/games/trustIssues/icon.svg",
	};


	/* ---------------------------- Simulation ---------------------------- */

	override init(): void {}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	override run(
		dt: number,
		produceFinish: boolean,
		_rng: GameRandomGenerator | null
	): FinishGame | null {
		// No randomness is needed after the level generation: every rule is deterministic
		if (this.physics)
			this.advance(dt);

		if (produceFinish && this.finished)
			return this.produceFinish();

		return null;
	}

	/** Advance by dt seconds, as a whole number of fixed steps (the rest waits in the accumulator). */
	private advance(dt: number) {
		const physics = this.physics!;
		this.accumulator += Math.max(0, dt);
		let steps = 0;
		// The tolerance makes a step falling exactly on an input's timestamp always
		// happen before it, whatever the rounding of the summed times
		while (this.accumulator >= FIXED_STEP - STEP_TOLERANCE && steps < MAX_STEPS_PER_RUN) {
			this.rememberPositions();
			stepWorld(this, physics, FIXED_STEP);
			this.accumulator -= FIXED_STEP;
			steps++;
			this.measureCorrection();
		}
		if (steps >= MAX_STEPS_PER_RUN)
			this.accumulator = 0; // way behind (frozen tab...): drop the rest instead of freezing
	}

	/**
	 * Game clock of the last fixed step (seconds since the start): the time the
	 * positions belong to (the accumulator is not simulated yet).
	 */
	private stepClock() {
		return MATCH_DURATION - this.time;
	}

	/**
	 * When the replay after a load reaches the clock of the positions predicted
	 * before it, the gap between both is the server's correction. It is added to
	 * the drawn offsets, which fade out: the player glides instead of jumping.
	 */
	private measureCorrection() {
		const before = this.beforeLoad;
		if (!before || this.stepClock() < before.clock - STEP_TOLERANCE)
			return;
		this.beforeLoad = null;

		for (const [i, p] of this.players.entries()) {
			const old = before.pos[i];
			const o = this.visualOffsets[i];
			const dx = old.x - p.x, dy = old.y - p.y, dz = old.z - p.z;
			if (Math.hypot(o.x + dx, o.y + dy, o.z + dz) > MAX_SMOOTHED_CORRECTION) {
				o.x = o.y = o.z = 0; // too far (respawn...): just jump
			} else {
				o.x += dx;
				o.y += dy;
				o.z += dz;
			}
		}
	}

	/** Keep the current positions as the previous step's (for the drawing interpolation). */
	private rememberPositions() {
		for (const [i, p] of this.players.entries()) {
			const q = this.prevPos[i];
			q.x = p.x;
			q.y = p.y;
			q.z = p.z;
		}
	}

	/**
	 * Client: where to draw each player. Interpolated between the previous and
	 * the last fixed step (by the share of a step waiting in the accumulator),
	 * plus the fading network correction. A teleport (respawn) is not
	 * interpolated.
	 */
	private drawnPositions() {
		const alpha = Math.max(0, Math.min(1, this.accumulator / FIXED_STEP));
		return this.players.map((p, i) => {
			const q = this.prevPos[i];
			const o = this.visualOffsets[i];
			const teleported = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > MAX_INTERPOLATED_MOVE;
			const k = teleported ? 1 : alpha;
			return {
				x: q.x + (p.x - q.x) * k + o.x,
				y: q.y + (p.y - q.y) * k + o.y,
				z: q.z + (p.z - q.z) * k + o.z,
			};
		});
	}

	/** Client: the drawn offsets fade out. */
	private fadeOffsets(dt: number) {
		const k = Math.exp(-dt * CORRECTION_FADE);
		for (const o of this.visualOffsets) {
			o.x *= k;
			o.y *= k;
			o.z *= k;
		}
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		if (!player || this.finished)
			return;

		switch (input.action) {
			case 'move':
				player.moveX = clampDir(input.move?.x);
				player.moveZ = clampDir(input.move?.z);
				break;

			case 'yaw': {
				const yaw = Number(input.yaw);
				if (Number.isFinite(yaw))
					player.yaw = yaw;
				break;
			}

			case 'jump':
				queueJump(player);
				break;

			case 'jumpRelease':
				releaseJump(player);
				break;

			case 'explode':
				explode(this, player);
				break;
		}
	}


	/* ---------------------------- Inputs ---------------------------- */

	override collectInputs(
		keyboard: IKeyboardController,
		_mouse: IMouseController,
		_mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		const inputs: Fields[] = [];
		if (!this.players[data.playerIdx] || this.finished)
			return inputs;

		data.updateLook();
		this.collectMove(keyboard, data, inputs);
		this.collectYaw(data, inputs);

		if (keyboard.first('jump'))
			inputs.push({ action: 'jump', jump: {} });
		if (keyboard.killed('jump'))
			inputs.push({ action: 'jumpRelease', jumpRelease: {} });
		if (keyboard.first('explode'))
			inputs.push({ action: 'explode', explode: {} });

		return inputs;
	}

	/** ZQSD (the keyboard controller maps physical keys, so it works on AZERTY and QWERTY). */
	private collectMove(keyboard: IKeyboardController, data: ClientData, inputs: Fields[]) {
		const x = (keyboard.press('right') ? 1 : 0) - (keyboard.press('left') ? 1 : 0);
		const z = (keyboard.press('up') ? 1 : 0) - (keyboard.press('down') ? 1 : 0);
		if (x === data.lastMoveX && z === data.lastMoveZ)
			return;

		data.lastMoveX = x;
		data.lastMoveZ = z;
		inputs.push({ action: 'move', move: { x, z } });
	}

	/** Send the view direction when it changed enough (the movement is relative to it). */
	private collectYaw(data: ClientData, inputs: Fields[]) {
		const delta = Math.atan2(Math.sin(data.yaw - data.lastSentYaw), Math.cos(data.yaw - data.lastSentYaw));
		if (Math.abs(delta) < YAW_SEND_THRESHOLD)
			return;

		data.lastSentYaw = data.yaw;
		inputs.push({ action: 'yaw', yaw: data.yaw });
	}


	/* ---------------------------- Drawing ---------------------------- */

	override draw(
		ctx: CanvasRenderingContext2D,
		_playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader,
		_addCamZ: number,
		dt: number
	) {
		const data = _data as ClientData;
		if (data.firstFrame)
			data.firstFrame = false;
		this.fadeOffsets(dt);

		if (!data.renderer)
			data.renderer = new TrustRenderer(data, this.level, this.players.length);

		data.frame(this);
		data.renderer.render(ctx, this, this.drawnPositions());
	}


	/* ---------------------------- Network ---------------------------- */

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const { State } = protocols.get();
		const object: Fields = {
			players: this.players.map(p => p.save()),
			splats: this.splats.map(s => s.save()),
			zoneArrivals: this.zoneArrivals.map(players => ({ players })),
			nextSplatId: this.nextSplatId,
			time: this.time,
			finished: this.finished,
			accumulator: this.accumulator,
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = decodeFullMessage(State.decode(data));

		// Remember the predicted positions, to measure the correction (see measureCorrection)
		this.beforeLoad = {
			clock: this.stepClock(),
			pos: this.players.map(p => ({ x: p.x, y: p.y, z: p.z })),
		};

		for (const [i, p] of (obj.players ?? []).entries())
			this.players[i]?.load(p);

		this.splats = (obj.splats ?? []).map((s: Fields) => Splat.load(s));
		this.zoneArrivals = Array.from({ length: ZONE_COUNT }, (_, z) =>
			[...(obj.zoneArrivals?.[z]?.players ?? [])]
		);
		this.nextSplatId = obj.nextSplatId ?? 0;
		this.time = obj.time ?? MATCH_DURATION;
		this.finished = obj.finished ?? false;
		this.accumulator = obj.accumulator ?? 0;
		this.rememberPositions(); // no interpolation across a load
		this.measureCorrection(); // the server state may already be at the predicted step
	}

	override getSize() {
		return { width: WIDTH, height: HEIGHT };
	}

	/** The mouse only turns the view (pointer lock): screen coordinates are not used. */
	override evalMouseCoords(
		x: number,
		y: number,
		_playerIdx: number,
		_clientData: any
	) {
		return { x, y };
	}

	override getMobileDesc(): MobileDescriptor | null {
		return null; // keyboard + mouse only (computerOnly)
	}

	override createTutorial() {
		return new TutorialData(this);
	}


	/* ---------------------------- Results ---------------------------- */

	/** Everybody is in one "team": sorted by score, then by zones reached. */
	private produceFinish(): FinishGame {
		const order = ranking(this.players);
		const playerEqualities: number[] = [];
		for (let i = 0; i + 1 < order.length; i++) {
			if (compareStanding(this.players[order[i]], this.players[order[i + 1]]) === 0)
				playerEqualities.push(i);
		}

		return {
			results: [order],
			teamEqualities: [],
			playerEqualities,
		};
	}
}


/* ---------------------------- Input helpers ---------------------------- */

/** Clamp a movement axis to -1, 0 or 1. */
function clampDir(v: unknown) {
	const n = Number(v);
	return n > 0 ? 1 : n < 0 ? -1 : 0;
}

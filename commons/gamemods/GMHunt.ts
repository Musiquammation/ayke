import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { GameRandomGenerator } from "../util/GameRandomGenerator";
import { ImageLoader } from "../util/ImageLoader";
import { ClientData } from "./hunt/client";
import {
	CAMERA_SCALE,
	HEIGHT,
	ITEM_NONE,
	ITEM_SLOTS,
	MATCH_DURATION,
	PLAYER_COLORS,
	TEXTURES,
	WEAPONS,
	WIDTH,
	PLAYER_COLOR_NAMES,
} from "./hunt/constants";
import {
	Block,
	Bomb,
	Boomerang,
	Box,
	Explosion,
	KillEvent,
	loadEntities,
	Pickup,
	Player,
	Projectile,
} from "./hunt/entities";
import { LEVEL } from "./hunt/level";
import { ensureRapier, HuntPhysics, isRapierReady } from "./hunt/physics";
import { drawFrame } from "./hunt/render";
import {
	canShoot,
	compareStanding,
	HuntState,
	initialSpawn,
	ranking,
	shoot,
	stepWorld,
	useItem,
} from "./hunt/simulation";
import { TutorialData } from "./hunt/tutorial";

const protocols = getProtocol('hunt', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}


/* -------------------------------------------------------------------------- */
/* Lobby panel (hunt.html): the player picks a color                          */
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
 * Give each player its preferred color, then give the others (and bots)
 * the first colors nobody uses yet (colors repeat when there are more than 8 players).
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


/* -------------------------------------------------------------------------- */
/* Game mode                                                                  */
/* -------------------------------------------------------------------------- */

export class GMHunt extends GameMode implements HuntState {
	static readonly types = { Player };

	static readonly DATA = { WIDTH, HEIGHT, LEVEL, WEAPONS };

	/* ---------- Shared state (saved / loaded) ---------- */
	readonly players: Player[];
	readonly boxes: Box[];
	projectiles: Projectile[] = [];
	bombs: Bomb[] = [];
	boomerangs: Boomerang[] = [];
	explosions: Explosion[] = [];
	pickups: Pickup[] = [];
	killFeed: KillEvent[] = [];
	time = MATCH_DURATION;
	finished = false;

	/** Static pieces of the map: never sent (they come from the level definition). */
	private readonly blocks: Block[];

	/* ---------- Local mirror (rebuilt from the shared state every tick) ---------- */
	private physics: HuntPhysics | null = null;

	/** Resolved once Rapier is loaded (awaited by the local game handler before starting). */
	readonly engineReady: Promise<void>;

	private constructor(total: number) {
		super();
		this.players = Array.from({ length: total }, (_, i) => new Player(i));
		this.boxes = LEVEL.boxes.map(slot => new Box(slot));
		this.blocks = LEVEL.obstacles.map(o => new Block(o));
		initialSpawn(this);

		// Rapier's WASM may still be loading on the client: create the world as soon as possible
		const createPhysics = () => {
			this.physics = new HuntPhysics([...this.blocks, ...this.boxes, ...this.players]);
		};
		if (isRapierReady()) {
			createPhysics();
			this.engineReady = Promise.resolve();
		} else {
			this.engineReady = ensureRapier().then(createPhysics);
		}
	}

	/** Physics world (null while Rapier is loading). Used by bots. */
	getPhysics() {
		return this.physics;
	}

	/* ---------------------------- Creation ---------------------------- */

	static async createServ(
		players: PlayerInput[],
		total: number,
		_hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();
		await ensureRapier();
		const game = new GMHunt(total);

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
		const game = new GMHunt(total);
		const clientData = new ClientData(playerIdx);

		if (origin === 'server') {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
			for (const [i, p] of (players ?? []).entries()) {
				clientData.names[i] = p.name;
				clientData.colors[i] = PLAYER_COLORS[normalizeColor(p.color)];
			}
		} else {
			// Local game (tutorial / training): player 0 is the human, the others are bots
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

	static readonly TEXTURES = TEXTURES;


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
		// No randomness is needed: every rule is deterministic
		if (this.physics)
			stepWorld(this, this.physics, dt);

		if (produceFinish && this.finished)
			return this.produceFinish();

		return null;
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		if (!player || this.finished)
			return;

		switch (input.action) {
			case 'move':
				player.moveX = clampDir(input.move?.x);
				player.moveY = clampDir(input.move?.y);
				break;

			case 'jump':
				player.jumpQueued = true;
				break;

			case 'shoot':
				shoot(this, playerIdx, readAim(input.shoot));
				break;

			case 'weapon': {
				const w = Number(input.weapon);
				if (Number.isInteger(w) && w >= 0 && w < WEAPONS.length)
					player.weapon = w;
				break;
			}

			case 'useItem':
				if (this.physics)
					useItem(this, this.physics, playerIdx, readAim(input.useItem));
				break;

			case 'selectItem': {
				const s = Number(input.selectItem);
				if (Number.isInteger(s) && s >= 0 && s < ITEM_SLOTS)
					player.selectedItem = s;
				break;
			}
		}
	}


	/* ---------------------------- Inputs ---------------------------- */

	override collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		_mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		mouse.getCoords(); // refreshes data.mouseX / mouseY through evalMouseCoords
		const inputs: Fields[] = [];
		const self = this.players[data.playerIdx];
		if (!self)
			return inputs;

		this.collectMove(keyboard, data, inputs);
		if (keyboard.first('jump'))
			inputs.push({ action: 'jump', jump: {} });

		this.collectLock(keyboard, data);
		this.collectSelection(keyboard, mouse, data, self, inputs);

		// Left click: shoot (holding it keeps shooting, with the weapon cooldown)
		if (mouse.press(0) && canShoot(self))
			inputs.push({ action: 'shoot', shoot: data.aimPoint(this) });

		// Right click: use the selected item
		if (mouse.first(2) && self.canAttack() && self.items[self.selectedItem] !== ITEM_NONE)
			inputs.push({ action: 'useItem', useItem: data.aimPoint(this) });

		return inputs;
	}

	/** ZQSD (the keyboard controller maps physical keys, so it works on AZERTY and QWERTY). */
	private collectMove(keyboard: IKeyboardController, data: ClientData, inputs: Fields[]) {
		const x = (keyboard.press('right') ? 1 : 0) - (keyboard.press('left') ? 1 : 0);
		const y = (keyboard.press('down') ? 1 : 0) - (keyboard.press('up') ? 1 : 0);
		if (x === data.lastMoveX && y === data.lastMoveY)
			return;

		data.lastMoveX = x;
		data.lastMoveY = y;
		inputs.push({ action: 'move', move: { x, y } });
	}

	/** Shift held = lock mode. The lock starts on the entity under the indicator. */
	private collectLock(keyboard: IKeyboardController, data: ClientData) {
		if (!keyboard.press('lock')) {
			data.lock = null;
			return;
		}

		if (!data.lock)
			data.tryLock();
	}

	/**
	 * Weapons: 1, 2, 3 or the wheel.
	 * Items: I opens the selection mode, then 1-4 or the wheel select the item.
	 */
	private collectSelection(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		data: ClientData,
		self: Player,
		inputs: Fields[]
	) {
		if (keyboard.first('item'))
			data.toggleItemMode();

		const wheel = Math.sign(mouse.wheel());

		if (data.itemMode) {
			for (let i = 0; i < ITEM_SLOTS; i++) {
				if (keyboard.first(String(i + 1))) {
					inputs.push({ action: 'selectItem', selectItem: i });
					data.itemMode = false;
					return;
				}
			}

			if (wheel !== 0) {
				const next = (self.selectedItem + wheel + ITEM_SLOTS) % ITEM_SLOTS;
				inputs.push({ action: 'selectItem', selectItem: next });
				data.extendItemMode();
			}
			return;
		}

		for (let i = 0; i < WEAPONS.length; i++) {
			if (keyboard.first(String(i + 1)) && self.weapon !== i) {
				inputs.push({ action: 'weapon', weapon: i });
				return;
			}
		}

		if (wheel !== 0) {
			const next = (self.weapon + wheel + WEAPONS.length) % WEAPONS.length;
			inputs.push({ action: 'weapon', weapon: next });
		}
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
		ctx.imageSmoothingEnabled = false;
		const loader = _imageLoader.getFolder('hunt');
		const data = _data as ClientData;
		if (data.firstFrame)
			data.firstFrame = false;

		data.frame(this, dt);
		drawFrame(ctx, this, this.blocks, data, loader, this.physics, MATCH_DURATION - this.time);
	}


	/* ---------------------------- Network ---------------------------- */

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const { State } = protocols.get();
		const object: Fields = {
			players: this.players.map(p => p.save()),
			boxes: this.boxes.map(b => b.save()),
			projectiles: this.projectiles.map(b => b.save()),
			bombs: this.bombs.map(b => b.save()),
			boomerangs: this.boomerangs.map(b => b.save()),
			explosions: this.explosions.map(e => e.save()),
			pickups: this.pickups.map(p => p.save()),
			killFeed: this.killFeed.map(k => k.save()),
			time: this.time,
			finished: this.finished,
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = decodeFullMessage(State.decode(data));

		for (const [i, p] of (obj.players ?? []).entries()) {
			this.players[i]?.load(p);
		}
		for (const [i, b] of (obj.boxes ?? []).entries()) {
			this.boxes[i]?.load(b);
		}

		// Lists are loaded in place, so the entities keep their three.js model
		loadEntities(this.projectiles, obj.projectiles, () => new Projectile());
		loadEntities(this.bombs, obj.bombs, () => new Bomb());
		loadEntities(this.boomerangs, obj.boomerangs, () => new Boomerang());
		loadEntities(this.explosions, obj.explosions, () => new Explosion());
		loadEntities(this.pickups, obj.pickups, () => new Pickup());
		loadEntities(this.killFeed, obj.killFeed, () => new KillEvent());
		this.time = obj.time ?? MATCH_DURATION;
		this.finished = obj.finished ?? false;
	}

	override getSize() {
		return { width: WIDTH, height: HEIGHT };
	}

	/** Screen -> ground plane (altitude 0) coordinates, with the current camera. */
	override evalMouseCoords(
		x: number,
		y: number,
		_playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;
		const cam = clientData.camera;

		const ret = {
			x: (x - WIDTH / 2) / CAMERA_SCALE + cam.x,
			y: (y - HEIGHT / 2) / CAMERA_SCALE + cam.y,
		};

		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;
		return ret;
	}

	override getMobileDesc(): MobileDescriptor | null {
		return null; // keyboard + mouse only (computerOnly)
	}

	override createTutorial() {
		return new TutorialData(this);
	}


	/* ---------------------------- Results ---------------------------- */

	/** Everybody is in one "team": sorted by kills (then deaths, then speed, then damage). */
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

/** Read an aim point from an input, replacing invalid numbers by 0. */
function readAim(aim: Fields | undefined) {
	const num = (v: unknown) => {
		const n = Number(v);
		return Number.isFinite(n) ? n : 0;
	};
	return { x: num(aim?.x), y: num(aim?.y), z: num(aim?.z) };
}

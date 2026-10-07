import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { GameRandomGenerator } from "../util/GameRandomGenerator";
import { ImageLoader } from "../util/ImageLoader";
import { platformEngine } from "../util/platformEngine";

const protocols = getProtocol("rally", "multiplayer");


interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}


interface RallyEngineData extends platformEngine.EngineData {
	Game: GMRally;
	Storage: unknown;
}


const GRAVITY = 1100;

const WIDTH = 2400;
const HEIGHT = 1350;

const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 70;

const RUN_SPEED = 430;
const JUMP_SPEED = 620;

const RESPAWN_DELAY = 1.5;

const ITEM_COOLDOWN = 0.25;
const ITEM_BOOST = 300;
const ITEM_BOOST_DURATION = 0.7;

const X_LIMIT = WIDTH * 3;
const Y_LIMIT = HEIGHT * 1.5;

const RACE_FINISH_X = WIDTH * 2.5;

const MAX_PLAYERS = 4;

const TEAM_SIZE = 2;


/**
 * A player controlled by the rally game.
 *
 * All fields in this class are authoritative game state.
 * No rendering state, DOM state, camera state or other client-only
 * information is stored here.
 */
class Player extends platformEngine.Block<null, RallyEngineData> {
	private px: number;
	private py: number;

	private readonly velocity: platformEngine.Velocity = {
		x: 0,
		y: 0
	};

	private readonly direction: platformEngine.Direction = {
		dir: 1,
		acc: 0,
		softDec: 0,
		hardDec: 0
	};

	private readonly walker = new platformEngine.Walker();

	/**
	 * Shared spawn coordinates.
	 *
	 * These are initialization data and therefore do not need to be
	 * serialized in every save.
	 */
	spawnX: number | null = null;
	spawnY: number | null = null;

	/**
	 * Whether the player is still connected to the match.
	 *
	 * This deliberately belongs to shared Player state because a save/load
	 * operation must preserve the connection state.
	 */
	connected = true;

	/**
	 * Remaining respawn delay.
	 *
	 * A negative value means that the player is alive.
	 */
	alive = -1;

	team: "red" | "blue" = "red";

	skin = "default";

	/**
	 * Number of currently held items.
	 *
	 * The actual item definition is static and therefore does not need
	 * to be serialized.
	 */
	itemCount = 0;

	itemCooldown = 0;

	boostTimer = 0;

	finished = false;

	finishTime = -1;

	constructor(x: number, y: number) {
		super();

		this.px = x;
		this.py = y;
	}

	get x() {
		return this.px;
	}

	set x(value: number) {
		this.px = value;
	}

	get y() {
		return this.py;
	}

	set y(value: number) {
		this.py = value;
	}

	getSize() {
		return {
			width: PLAYER_WIDTH,
			height: PLAYER_HEIGHT
		};
	}

	getWalker() {
		return this.walker;
	}

	getDirection() {
		return this.direction;
	}

	getVelocity() {
		return this.velocity;
	}

	/**
	 * Initializes all state which is supplied by StartData.
	 *
	 * Spawn positions are intentionally not part of save/load because they
	 * are immutable match initialization data.
	 */
	initSpawn(
		x: number,
		y: number,
		team: "red" | "blue",
		skin: string
	) {
		this.spawnX = x;
		this.spawnY = y;

		this.px = x;
		this.py = y;

		this.team = team;
		this.skin = skin;

		this.direction.dir = team === "red" ? 1 : 1;

		this.velocity.x = RUN_SPEED;
		this.velocity.y = 0;
	}

	isAlive() {
		return this.alive < 0;
	}

	/**
	 * Applies the player's continuous movement before the physics engine
	 * performs its collision and integration step.
	 */
	override processBeforeEngine(
		_id: number,
		dt: number,
		_engine: platformEngine.IBlockEngine<RallyEngineData>,
		_clientData: null
	) {
		if (!this.isAlive()) {
			this.velocity.x = 0;
			this.velocity.y = 0;
			return;
		}

		this.itemCooldown = Math.max(
			0,
			this.itemCooldown - dt
		);

		this.boostTimer = Math.max(
			0,
			this.boostTimer - dt
		);

		const speed =
			RUN_SPEED +
			(this.boostTimer > 0 ? ITEM_BOOST : 0);

		/*
		 * Horizontal movement is derived from dir.
		 *
		 * This is important for wall collisions: collision handling changes
		 * dir, never velocity.x directly.
		 */
		this.velocity.x = this.direction.dir * speed;
	}

	/**
	 * Updates shared state after the physics engine has moved the player.
	 */
	override processAfterEngine(
		_id: number,
		dt: number,
		_engine: platformEngine.IBlockEngine<RallyEngineData>,
		_clientData: null
	) {
		if (!this.isAlive()) {
			this.alive -= dt;

			if (this.alive < 0) {
				this.respawn();
			}

			return;
		}

		if (this.isOOB()) {
			this.die();
			return;
		}
	}

	/**
	 * Handles physical contacts with another block.
	 *
	 * A wall reverses the player's direction only when the player is moving
	 * towards the wall. The velocity itself is deliberately untouched.
	 */
	override detectCollision(
		_id: number,
		other: platformEngine.BlockEntry<RallyEngineData>,
		entrySide: platformEngine.Side,
		_engine: platformEngine.IBlockEngine<RallyEngineData>,
		_clientData: null
	) {
		if (!this.isAlive()) {
			return;
		}

		if (other.category !== "rally-wall") {
			return;
		}

		if (
			entrySide === "left" ||
			entrySide === "right"
		) {
			/*
			 * The platform engine reports the side on which the player
			 * contacted the wall. Only reverse direction when the player is
			 * travelling horizontally towards it.
			 *
			 * vy > 0 means falling/downward movement, in which case the
			 * requested wall rule says to do nothing.
			 */
			if (this.velocity.y > 0) {
				return;
			}

			this.direction.dir *= -1;
		}
	}

	/**
	 * Serializes all mutable gameplay state.
	 *
	 * Immutable initialization information such as spawn coordinates and
	 * skin is intentionally excluded.
	 */
	save() {
		return {
			x: this.x,
			y: this.y,

			vx: this.velocity.x,
			vy: this.velocity.y,

			dir: this.direction.dir,

			alive: this.alive,
			connected: this.connected,

			isRed: this.team === "red",

			itemCount: this.itemCount,
			itemCooldown: this.itemCooldown,
			boostTimer: this.boostTimer,

			finished: this.finished,
			finishTime: this.finishTime
		};
	}

	/**
	 * Restores mutable gameplay state from a protobuf-decoded object.
	 */
	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;

		this.velocity.x = obj.vx;
		this.velocity.y = obj.vy;

		this.direction.dir = obj.dir;

		this.alive = obj.alive;
		this.connected = obj.connected;

		this.team = obj.isRed ? "red" : "blue";

		this.itemCount = obj.itemCount;
		this.itemCooldown = obj.itemCooldown;
		this.boostTimer = obj.boostTimer;

		this.finished = obj.finished;
		this.finishTime = obj.finishTime;
	}

	/**
	 * Performs a jump if the player currently has a floor contact.
	 */
	jump() {
		if (!this.isAlive()) {
			return;
		}

		if (!this.walker.onFloor()) {
			return;
		}

		this.velocity.y = -JUMP_SPEED;
	}

	/**
	 * Uses one carried item.
	 *
	 * Items are deliberately represented by a small shared inventory count.
	 * The actual item behavior is deterministic and therefore does not need
	 * an item object to be serialized.
	 */
	useItem() {
		if (!this.isAlive()) {
			return;
		}

		if (this.itemCount <= 0) {
			return;
		}

		if (this.itemCooldown > 0) {
			return;
		}

		this.itemCount--;
		this.itemCooldown = ITEM_COOLDOWN;
		this.boostTimer = ITEM_BOOST_DURATION;
	}

	/**
	 * Gives the player one item.
	 */
	giveItem() {
		this.itemCount++;
	}

	/**
	 * Kills the player and starts the respawn timer.
	 */
	die() {
		if (!this.isAlive()) {
			return;
		}

		this.alive = RESPAWN_DELAY;
		this.velocity.x = 0;
		this.velocity.y = 0;
	}

	/**
	 * Restores the player at the immutable spawn point.
	 */
	respawn() {
		if (this.spawnX !== null) {
			this.x = this.spawnX;
		}

		if (this.spawnY !== null) {
			this.y = this.spawnY;
		}

		this.velocity.x = this.direction.dir * RUN_SPEED;
		this.velocity.y = 0;

		this.finished = false;
		this.finishTime = -1;
	}

	isOOB() {
		return (
			this.x < -X_LIMIT ||
			this.x > X_LIMIT ||
			this.y < -Y_LIMIT ||
			this.y > Y_LIMIT
		);
	}
}


/**
 * A static collision wall.
 *
 * Level geometry is predefined by the game code and is never serialized.
 */
class RallyWall extends platformEngine.Block<null, RallyEngineData> {
	constructor(
		private px: number,
		private py: number,
		private readonly width: number,
		private readonly height: number
	) {
		super();
	}

	get x() {
		return this.px;
	}

	set x(value: number) {
		this.px = value;
	}

	get y() {
		return this.py;
	}

	set y(value: number) {
		this.py = value;
	}

	getSize() {
		return {
			width: this.width,
			height: this.height
		};
	}
}


/**
 * A moving platform.
 *
 * Only t is mutable gameplay state. Its trajectory parameters are static
 * level data and therefore do not have to be serialized.
 */
class RallyMovingPlatform extends platformEngine.Block<null, RallyEngineData> {
	t = 0;

	private px: number;
	private py: number;

	constructor(
		private readonly startX: number,
		private readonly startY: number,
		private readonly amplitude: number,
		private readonly period: number,
		private readonly width: number,
		private readonly height: number
	) {
		super();

		this.px = startX;
		this.py = startY;
	}

	get x() {
		return this.px;
	}

	set x(value: number) {
		this.px = value;
	}

	get y() {
		return this.py;
	}

	set y(value: number) {
		this.py = value;
	}

	getSize() {
		return {
			width: this.width,
			height: this.height
		};
	}

	/**
	 * Advances the platform's deterministic trajectory.
	 *
	 * The trajectory itself is static level data; t is the only part that
	 * must survive a save/load operation.
	 */
	override processBeforeEngine(
		_id: number,
		dt: number,
		_engine: platformEngine.IBlockEngine<RallyEngineData>,
		_clientData: null
	) {
		this.t += dt;

		const phase =
			(this.t % this.period) / this.period;

		this.px =
			this.startX +
			Math.sin(phase * Math.PI * 2) * this.amplitude;
	}
}


/**
 * Client-only rendering state.
 *
 * Nothing from this class is included in GameMode.save().
 */
class ClientData {
	firstFrame = true;

	readonly camera = new Camera();

	private clientWasDead = true;

	readonly html: HTMLDivElement;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-rally-root");
	}

	update(game: GMRally, playerIdx: number) {
		const player = game.players[playerIdx];

		if (this.clientWasDead && player.alive < 0) {
			this.camera.teleport(player.x, player.y);
		}

		this.clientWasDead = player.alive >= 0;

		this.camera.update(
			player.x,
			player.y,
			1 / 60
		);
	}
}


/**
 * Simple camera following the local player.
 */
class Camera {
	x = 0;
	y = 0;

	static readonly SCALE = 0.8;

	update(
		px: number,
		py: number,
		_dt: number
	) {
		this.x = px;
		this.y = py;
	}

	teleport(px: number, py: number) {
		this.x = px;
		this.y = py;
	}

	getCoords() {
		return {
			x: this.x,
			y: this.y
		};
	}
}


/**
 * Client-side setup data.
 */
function generateClientDom(
	unlockedSkins: string[]
) {
	return {
		skin: Object.keys(GMRally.SKINS)[0],
		preferTeam: 0,

		SKINS: GMRally.SKINS,
		unlockedSkins,

		produce() {
			const { StartData } = protocols.get();

			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		},

		hasSkin(skin: string) {
			return this.unlockedSkins.includes(skin);
		},

		getSkinIconPath
	};
}


function getSkinTexturePath(id: string) {
	return `/assets/games/rally/skins/${id}/grid.png`;
}


function getSkinIconPath(id: string) {
	return window.IMG_ROOT_PATH +
		`/assets/games/rally/skins/${id}/icon.png`;
}


/**
 * Static level descriptions.
 *
 * These are deliberately not sent through protobuf.
 *
 * Only the mutable state of objects created from these descriptions,
 * such as a moving platform's t, is synchronized.
 */
interface RallyLevel {
	create(
		engine: platformEngine.PlatformerEngine<RallyEngineData>
	): void;
}


const LEVELS: RallyLevel[] = [
	{
		create(engine) {
			engine.addBlock(
				new RallyWall(
					0,
					650,
					2400,
					100
				),
				"rally-wall"
			);

			engine.addBlock(
				new RallyWall(
					-1100,
					300,
					100,
					700
				),
				"rally-wall"
			);

			engine.addBlock(
				new RallyWall(
					1100,
					300,
					100,
					700
				),
				"rally-wall"
			);

			engine.addBlock(
				new RallyMovingPlatform(
					0,
					350,
					250,
					4,
					250,
					30
				),
				"rally-platform"
			);
		}
	}
];

class TutorialData {
	constructor(private readonly game: GMRally) {}

	frame(_dt: number, clock: number) {
		return "";
	}
}


export class GMRally extends GameMode {
	static readonly types = {
		Player
	};

	static readonly DATA = {
		GRAVITY,
		WIDTH,
		HEIGHT,
		PLAYER_WIDTH,
		PLAYER_HEIGHT,
		RUN_SPEED,
		JUMP_SPEED,
		RESPAWN_DELAY,
		RACE_FINISH_X
	};

	static readonly SKINS = {
		"default": "Default"
	};

	static readonly SKINS_IDS =
		Object.keys(GMRally.SKINS);

	static readonly TEXTURES = {
		"rally": "/assets/games/rally/rally.png",
		"skin-default":
			getSkinTexturePath("default")
	};

	readonly players: Player[];

	time = 180;

	levelIndex = 0;

	internalFrameTick = 0;

	private engine:
		platformEngine.PlatformerEngine<RallyEngineData> | null = null;

	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0)
		);
	}

	/**
	 * Creates the authoritative server game and initializes all players.
	 */
	static async createServ(
		players: PlayerInput[],
		total: number,
		hasSkin: (
			gamemode: string,
			skinId: string,
			user: string
		) => Promise<boolean>
	) {
		const { StartData, StartDataClient } =
			protocols.get();

		const game = new GMRally(
			Math.min(total, MAX_PLAYERS)
		);

		function decode(i: number) {
			if (i < players.length) {
				return decodeFullMessage(
					StartData.decode(players[i].data)
				);
			}

			return generateClientDom([]);
		}

		const infos = await Promise.all(
			game.players.map(async (_player, i) => {
				const data = decode(i);

				let skin =
					GMRally.SKINS_IDS[0];

				const pseudo =
					i < players.length
						? players[i].pseudo
						: null;

				if (
					pseudo !== null &&
					GMRally.SKINS_IDS.includes(
						data.skin
					) &&
					await hasSkin(
						"rally",
						data.skin,
						pseudo
					)
				) {
					skin = data.skin;
				}

				return {
					index: i,
					skin,
					preferTeam:
						data.preferTeam ?? 0
				};
			})
		);

		const red = infos
			.filter(i => i.preferTeam === 1)
			.map(i => i.index);

		const blue = infos
			.filter(i => i.preferTeam === -1)
			.map(i => i.index);

		const assigned =
			new Array<"red" | "blue">(
				game.players.length
			);

		/*
		 * First honor explicit preferences where possible.
		 */
		for (const i of red.slice(0, TEAM_SIZE)) {
			assigned[i] = "red";
		}

		for (const i of blue.slice(0, TEAM_SIZE)) {
			assigned[i] = "blue";
		}

		/*
		 * Then balance the remaining players.
		 */
		let redCount =
			assigned.filter(
				t => t === "red"
			).length;

		let blueCount =
			assigned.filter(
				t => t === "blue"
			).length;

		for (let i = 0; i < assigned.length; i++) {
			if (assigned[i] !== undefined) {
				continue;
			}

			if (
				redCount < TEAM_SIZE &&
				(
					redCount < blueCount ||
					redCount === blueCount
				)
			) {
				assigned[i] = "red";
				redCount++;
			} else {
				assigned[i] = "blue";
				blueCount++;
			}
		}

		/*
		 * Initialize immutable spawn information.
		 */
		for (
			const [i, player] of
			game.players.entries()
		) {
			const team = assigned[i];

			player.initSpawn(
				team === "red"
					? -WIDTH / 2
					: -WIDTH / 2,
				team === "red"
					? 500 - i * 90
					: 500 - i * 90,
				team,
				infos[i].skin
			);
		}

		const data =
			StartDataClient.encode({
				players: game.players.map(
					(player) => ({
						x: player.spawnX!,
						y: player.spawnY!,
						skin: player.skin,
						isRed:
							player.team === "red"
					})
				),
				levelIndex: game.levelIndex
			})
			.finish();

		return {
			game,
			data
		};
	}

	/**
	 * Creates a client-side prediction game.
	 *
	 * The client reconstructs the static level locally. Only mutable
	 * gameplay state is synchronized afterwards.
	 */
	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		_playerIdx: number
	) {
		const game = new GMRally(total);
		const clientData = new ClientData();

		const {
			StartData,
			StartDataClient
		} = protocols.get();

		if (origin === "server") {
			const start =
				decodeFullMessage(
					StartDataClient.decode(data)
				);

			game.levelIndex =
				start.levelIndex;

			for (
				const [idx, p] of
				start.players.entries()
			) {
				game.players[idx].initSpawn(
					p.x,
					p.y,
					p.isRed
						? "red"
						: "blue",
					p.skin
				);
			}
		} else {
			const start =
				decodeFullMessage(
					StartData.decode(data)
				);

			/*
			 * These are only temporary client-side initialization values.
			 * They are replaced by StartDataClient as soon as the server
			 * sends the authoritative initialization.
			 */
			for (
				const [i, player] of
				game.players.entries()
			) {
				player.initSpawn(
					-WIDTH / 2,
					500 - i * 90,
					i % 2 === 0
						? "red"
						: "blue",
					GMRally.SKINS_IDS[0]
				);
			}

			game.players[0].skin =
				start.skin;
		}

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: Object.fromEntries(
				game.players.map(
					player => [
						"skin-" + player.skin,
						getSkinTexturePath(
							player.skin
						)
					]
				)
			)
		};
	}

	static readonly generateClientDom =
		generateClientDom;

	/**
	 * Initializes the platform engine and static level geometry.
	 */
	override async init() {
		this.engine =
			await platformEngine
				.createPlatformerEngine<RallyEngineData>(
					false,
					null,
					this,
					{
						x: 0,
						y: GRAVITY
					}
				);

		this.createLevel();
		this.registerPlayers();
	}

	/**
	 * Creates all static level blocks from the predefined level.
	 */
	private createLevel() {
		if (!this.engine) {
			return;
		}

		const level =
			LEVELS[this.levelIndex];

		level.create(this.engine);
	}

	/**
	 * Registers all players in the physics engine.
	 */
	private registerPlayers() {
		if (!this.engine) {
			return;
		}

		for (const player of this.players) {
			this.engine.addBlock(
				player,
				"rally-player"
			);
		}
	}

	override getBotIds(count: number) {
		return Array.from(
			{ length: count },
			() => 0
		);
	}

	/**
	 * Advances the authoritative game simulation.
	 */
	override run(
		dt: number,
		produceFinish: boolean,
		_rng: GameRandomGenerator | null
	): FinishGame | null {
		this.internalFrameTick++;

		this.time -= dt;

		for (const player of this.players) {
			player.finished =
				player.finished ||
				player.x >= RACE_FINISH_X;

			if (
				player.finished &&
				player.finishTime < 0
			) {
				player.finishTime =
					180 - this.time;
			}
		}

		if (this.engine) {
			this.engine.update(dt);
		}

		if (
			produceFinish &&
			this.players.every(
				player =>
					player.finished ||
					!player.connected
			)
		) {
			return this.produceFinish();
		}

		if (
			produceFinish &&
			this.time <= 0
		) {
			this.time = 0;
			return this.produceFinish();
		}

		return null;
	}

	/**
	 * Applies an input to the shared player state.
	 *
	 * collectInputs() never mutates gameplay state; all state-changing input
	 * handling happens here.
	 */
	override runInput(
		playerIdx: number,
		input: Fields
	) {
		const player =
			this.players[playerIdx];

		if (!player) {
			return;
		}

		switch (input.action) {
			case "jump":
				player.jump();
				break;

			case "item":
				player.useItem();
				break;
		}
	}

	/**
	 * Collects local inputs without modifying game state.
	 */
	override collectInputs(
		keyboard: IKeyboardController,
		_mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const inputs: Fields[] = [];

		if (
			keyboard.first("space") ||
			keyboard.first("up") ||
			mobile?.first("jump")
		) {
			inputs.push({
				action: "jump"
			});
		}

		if (
			keyboard.first("e") ||
			keyboard.first("x") ||
			mobile?.first("item")
		) {
			inputs.push({
				action: "item"
			});
		}

		return inputs;
	}

	/**
	 * Draws the rally game.
	 */
	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = false;

		const clientData =
			_data as ClientData;

		if (clientData.firstFrame) {
			clientData.firstFrame = false;
		}

		clientData.update(
			this,
			playerIdx
		);

		ctx.fillStyle = "#333";
		ctx.fillRect(
			0,
			0,
			WIDTH,
			HEIGHT
		);

		const camera =
			clientData.camera.getCoords();

		ctx.save();

		ctx.translate(
			WIDTH / 2,
			HEIGHT / 2
		);

		ctx.scale(
			Camera.SCALE,
			Camera.SCALE
		);

		ctx.translate(
			-camera.x,
			-camera.y
		);

		this.drawLevel(
			ctx
		);

		for (
			const [i, player] of
			this.players.entries()
		) {
			this.drawPlayer(
				ctx,
				player,
				imageLoader,
				i === playerIdx
			);
		}

		ctx.restore();
	}

	/**
	 * Draws static level geometry.
	 *
	 * Rendering geometry is reconstructed from LEVELS instead of being
	 * serialized.
	 */
	private drawLevel(
		ctx: CanvasRenderingContext2D
	) {
		ctx.fillStyle = "#777";

		ctx.fillRect(
			-1200,
			600,
			2400,
			100
		);

		ctx.fillRect(
			-1150,
			-50,
			100,
			700
		);

		ctx.fillRect(
			1050,
			-50,
			100,
			700
		);

		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 5;

		ctx.beginPath();
		ctx.moveTo(
			RACE_FINISH_X,
			-500
		);
		ctx.lineTo(
			RACE_FINISH_X,
			500
		);
		ctx.stroke();
	}

	/**
	 * Draws one player using the skin texture loaded by the client.
	 */
	private drawPlayer(
		ctx: CanvasRenderingContext2D,
		player: Player,
		imageLoader: ImageLoader,
		local: boolean
	) {
		if (!player.isAlive()) {
			return;
		}

		const folder =
			imageLoader.getFolder("rally");

		const image =
			folder.get(
				"skin-" + player.skin
			);

		ctx.drawImage(
			image,
			player.x - PLAYER_WIDTH / 2,
			player.y - PLAYER_HEIGHT / 2,
			PLAYER_WIDTH,
			PLAYER_HEIGHT
		);

		if (local) {
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 3;

			ctx.strokeRect(
				player.x -
					PLAYER_WIDTH / 2,
				player.y -
					PLAYER_HEIGHT / 2,
				PLAYER_WIDTH,
				PLAYER_HEIGHT
			);
		}
	}

	override onDisconnection(id: number) {
		if (this.players[id]) {
			this.players[id].connected = false;
		}
	}

	/**
	 * Serializes every mutable gameplay value.
	 *
	 * Static level geometry and immutable initialization information are not
	 * repeated here.
	 */
	override save(): Uint8Array {
		const { State } =
			protocols.get();

		const movingPlatforms =
			this.getMovingPlatformState();

		const object: Fields = {
			players:
				this.players.map(
					player => player.save()
				),

			time: this.time,

			internalFrameTick:
				this.internalFrameTick,

			movingPlatforms
		};

		return State.encode(object)
			.finish();
	}

	/**
	 * Restores the complete mutable simulation state.
	 */
	override load(data: Uint8Array) {
		const { State } =
			protocols.get();

		const obj =
			decodeFullMessage(
				State.decode(data)
			);

		for (
			let i = 0;
			i < obj.players.length;
			i++
		) {
			if (this.players[i]) {
				this.players[i].load(
					obj.players[i]
				);
			}
		}

		this.time = obj.time;

		this.internalFrameTick =
			obj.internalFrameTick;

		this.loadMovingPlatformState(
			obj.movingPlatforms
		);
	}

	/**
	 * Extracts the mutable t value from every moving platform in the level.
	 */
	private getMovingPlatformState() {
		const result: number[] = [];

		if (!this.engine) {
			return result;
		}

		for (
			const entry of
			this.engine.getBlocks()
		) {
			if (
				entry.block instanceof
				RallyMovingPlatform
			) {
				result.push(
					entry.block.t
				);
			}
		}

		return result;
	}

	/**
	 * Restores moving platform times in deterministic level order.
	 */
	private loadMovingPlatformState(
		values: number[]
	) {
		if (!this.engine) {
			return;
		}

		let index = 0;

		for (
			const entry of
			this.engine.getBlocks()
		) {
			if (
				entry.block instanceof
				RallyMovingPlatform
			) {
				entry.block.t =
					values[index++] ?? 0;
			}
		}
	}

	override getSize() {
		return {
			width: WIDTH,
			height: HEIGHT
		};
	}

	override evalMouseCoords(
		x: number,
		y: number,
		_playerIdx: number,
		_clientData: any
	) {
		const data =
			_clientData as ClientData;

		const camera =
			data.camera.getCoords();

		return {
			x:
				(x - WIDTH / 2) /
					Camera.SCALE +
				camera.x,

			y:
				(y - HEIGHT / 2) /
					Camera.SCALE +
				camera.y
		};
	}

	override getMobileDesc(): MobileDescriptor {
		return {
			joysticks: {},

			buttons: {
				jump: {
					x: 8,
					xp: "right",
					y: 12,
					yp: "bottom",
					size: 90,
					color: "#ffffff"
				},

				item: {
					x: 110,
					xp: "right",
					y: 12,
					yp: "bottom",
					size: 90,
					color: "#ffaa44"
				}
			}
		};
	}

	/**
	 * Returns the ranking at the end of the race.
	 *
	 * Teams are ordered by the best member of each team, while members of
	 * each team are ordered by their individual finish time.
	 */
	private produceFinish(): FinishGame {
		const teamPlayers = {
			red: [] as number[],
			blue: [] as number[]
		};

		for (
			const [i, player] of
			this.players.entries()
		) {
			teamPlayers[player.team].push(i);
		}

		const score = (id: number) => {
			const player =
				this.players[id];

			if (player.finishTime >= 0) {
				return player.finishTime;
			}

			/*
			 * Players that never finish are ordered by their final x
			 * coordinate, with the furthest player being better.
			 */
			return (
				100000 +
				(RACE_FINISH_X -
					player.x)
			);
		};

		const red =
			teamPlayers.red.sort(
				(a, b) =>
					score(a) - score(b)
			);

		const blue =
			teamPlayers.blue.sort(
				(a, b) =>
					score(a) - score(b)
			);

		const teams = [red, blue];

		teams.sort(
			(a, b) =>
				score(a[0]) -
				score(b[0])
		);

		const teamEqualities: number[] = [];

		for (
			let i = 0;
			i + 1 < teams.length;
			i++
		) {
			if (
				score(teams[i][0]) ===
				score(teams[i + 1][0])
			) {
				teamEqualities.push(i);
			}
		}

		const results =
			teams.map(
				team => [...team]
			);

		const playerEqualities: number[] = [];

		let flatIndex = 0;

		for (const team of results) {
			for (
				let i = 0;
				i + 1 < team.length;
				i++
			) {
				if (
					score(team[i]) ===
					score(team[i + 1])
				) {
					playerEqualities.push(
						flatIndex + i
					);
				}
			}

			flatIndex += team.length;
		}

		return {
			results,
			teamEqualities,
			playerEqualities
		};
	}

	override createTutorial() {
		return new TutorialData(this);
	}
}

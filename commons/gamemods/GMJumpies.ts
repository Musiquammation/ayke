import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { GameRandomGenerator } from "../util/GameRandomGenerator";
import { ImageLoader } from "../util/ImageLoader";
import { Block } from "./jumpies/Block";
import { ClientData } from "./jumpies/client/ClientData";
import { drawAdjacenceRects } from "./jumpies/client/roomBars";
import { DEATH_TIME, FINISH_COOLDOWN, HEIGHT, LEVEL_TIME_LIMIT, PLAYER_SIZE, RESPAWN_TIME, WIDTH } from "./jumpies/constants";
import { LevelDef } from "./jumpies/defs";
import { LEVELS } from "./jumpies/levels";
import { Player } from "./jumpies/Player";
import { resolvePlayerCollisions } from "./jumpies/playerCollisions";
import { Room } from "./jumpies/Room";
import { Stage } from "./jumpies/Stage";
import { TutorialData } from "./jumpies/TutorialData";

const protocols = getProtocol('jumpies', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

const PLAYER_COLORS = [
	"#ffffff", "#ff5577", "#55aaff", "#66dd77",
	"#ffcc44", "#cc77ff", "#ff9944", "#44dddd"
];

const CURRENT_ROOM_COLOR = "#111";
const ADJACENT_ROOM_COLOR = "#1a1a1a";
const FINISHED_ALPHA = 0.35;


/** Returns the data of the panel where a player chooses a level. */
function generateClientDom(unlockedSkins: string[]) {
	return {
		mapChoice: -1,
		maps: LEVELS.map(level => level.name),
		unlockedSkins,

		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({ choice: this.mapChoice }).finish();
		}
	};
}

/** Reads a level choice, or picks a random level when there is no valid choice. */
function readLevelChoice(data: Uint8Array) {
	const { StartData } = protocols.get();
	const { choice } = decodeFullMessage(StartData.decode(data));
	const valid = Number.isInteger(choice) && choice >= 0 && choice < LEVELS.length;
	return valid ? choice as number : Math.floor(Math.random() * LEVELS.length);
}


/**
 * Jumpies: a platformer without platforms.
 * Players cross the rooms of the level with their jumps and the blocks, and the
 * goal is to reach the finish block. The first arrival starts a countdown:
 * when it ends, everybody who has not arrived is last. There are no teams.
 */
export class GMJumpies extends GameMode {
	static readonly types = { Player };

	static readonly DATA = { WIDTH, HEIGHT, PLAYER_SIZE };

	readonly level: LevelDef;
	readonly players: Player[];
	readonly stage: Stage;
	readonly blocks: Record<number, Block>;
	private readonly blockList: Block[];

	time = LEVEL_TIME_LIMIT;
	finishCooldown = -1; // negative until the first arrival
	finishCount = 0;

	/** Creates the real game objects from the description of the level. */
	private constructor(total: number, levelIndex: number) {
		super();

		this.level = LEVELS[levelIndex];
		this.stage = new Stage(this.level);
		this.blocks = this.stage.blocks;
		this.blockList = Object.values(this.blocks);

		this.players = Array.from(
			{ length: total },
			(_, id) => new Player(id, () => this.onPlayerDeath())
		);

		for (const [id, player] of this.players.entries()) {
			const spawn = this.level.spawns[id % this.level.spawns.length];
			player.initSpawn(spawn.x, spawn.y, this.stage.spawnRoom);
		}
	}

	static async createServ(
		players: PlayerInput[],
		total: number,
		_hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartDataClient } = protocols.get();

		// The choice of a random player decides the level.
		const levelIndex = players.length > 0
			? readLevelChoice(players[Math.floor(Math.random() * players.length)].data)
			: Math.floor(Math.random() * LEVELS.length);

		const game = new GMJumpies(total, levelIndex);
		const data = StartDataClient.encode({ level: levelIndex }).finish();

		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		_playerIdx: number
	) {
		const { StartDataClient } = protocols.get();

		const levelIndex = origin === 'server'
			? decodeFullMessage(StartDataClient.decode(data)).level as number
			: readLevelChoice(data);

		const game = new GMJumpies(total, levelIndex);
		const clientData = new ClientData();
		clientData.initBlocks(game.blockList);

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: {}
		};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly TEXTURES = {};


	override init(): void {

	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
	}

	/** Gives back units to the blocks. */
	private onPlayerDeath() {
		for (const block of this.blockList) {
			block.onPlayerDeath();
		}
	}

	/** Registers the arrival of a player. The first one starts the countdown. */
	finishPlayer(player: Player) {
		if (player.isFinished())
			return;

		player.finishRank = this.finishCount++;
		if (this.finishCooldown < 0) {
			this.finishCooldown = FINISH_COOLDOWN;
		}
	}

	/** Makes the time of the level and the countdown of the arrivals progress. */
	private runTimers(dt: number) {
		this.time = Math.max(0, this.time - dt);
		if (this.finishCooldown >= 0) {
			this.finishCooldown = Math.max(0, this.finishCooldown - dt);
		}
	}

	/** The game ends with the countdown, or when nobody is left to wait for. */
	private isOver() {
		return (
			this.time <= 0 ||
			this.finishCooldown === 0 ||
			this.players.every(p => p.isFinished() || !p.connected)
		);
	}

	/** Moves the players, and updates their rooms. */
	private movePlayers(dt: number) {
		for (const player of this.players) {
			player.frame(dt);
			if (player.isInGame()) {
				player.handleRoom(this.stage);
			}
		}
	}

	override run(
		dt: number,
		produceFinish: boolean,
		_rng: GameRandomGenerator | null
	): FinishGame | null {
		this.runTimers(dt);

		this.movePlayers(dt);
		resolvePlayerCollisions(this.players);

		for (const room of this.stage.rooms) {
			room.frame(this, dt);
		}

		if (produceFinish && this.isOver()) {
			return this.produceFinish();
		}

		return null;
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		switch (input.action) {
			case 'move':
				player.dirX = Math.sign(input.move);
				break;

			case 'fall':
				player.fastFall = input.fall;
				break;

			case 'jump':
				player.jumpRequested = player.isAlive();
				break;
		}
	}

	override collectInputs(
		keyboard: IKeyboardController,
		_mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		const data = _data as ClientData;
		const inputs: Fields[] = [];

		const left = keyboard.press('left') || (mobile !== null && mobile.press('left'));
		const right = keyboard.press('right') || (mobile !== null && mobile.press('right'));
		const move = (right ? 1 : 0) - (left ? 1 : 0);
		if (move !== data.lastMove) {
			data.lastMove = move;
			inputs.push({ action: 'move', move });
		}

		const fall = keyboard.press('down') || (mobile !== null && mobile.press('down'));
		if (fall !== data.lastFall) {
			data.lastFall = fall;
			inputs.push({ action: 'fall', fall });
		}

		const jump = keyboard.first('jump') || keyboard.first('up') ||
			(mobile !== null && mobile.first('jump'));
		if (jump) {
			inputs.push({ action: 'jump', jump: {} });
		}

		return inputs;
	}

	/** Draws the background of the current room and of its neighbors. */
	private drawRoomBackgrounds(ctx: CanvasRenderingContext2D, room: Room) {
		ctx.fillStyle = CURRENT_ROOM_COLOR;
		ctx.fillRect(room.x, room.y, room.w, room.h);

		ctx.fillStyle = ADJACENT_ROOM_COLOR;
		for (const adjacent of room.adjacentRooms) {
			ctx.fillRect(adjacent.x, adjacent.y, adjacent.w, adjacent.h);
		}
	}

	/** Draws the blocks of a room. */
	private drawRoomBlocks(
		ctx: CanvasRenderingContext2D,
		room: Room,
		data: ClientData,
		playerIdx: number,
		dt: number
	) {
		for (const block of room.blocks) {
			data.blocks[block.id].draw(ctx, block, playerIdx, dt);
		}
	}

	/** Draws a player as a square. The current player has a golden border. */
	private drawPlayer(ctx: CanvasRenderingContext2D, player: Player, isCurrent: boolean) {
		// A dead player fades out until they respawn.
		const fading = (player.deathCooldown - RESPAWN_TIME) / (DEATH_TIME - RESPAWN_TIME);
		const opacity = player.isAlive() ? 1 : fading;

		const x = player.x - PLAYER_SIZE / 2;
		const y = player.y - PLAYER_SIZE / 2;

		ctx.save();
		ctx.globalAlpha = player.isFinished() ? FINISHED_ALPHA : opacity;
		ctx.fillStyle = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
		ctx.fillRect(x, y, PLAYER_SIZE, PLAYER_SIZE);
		ctx.strokeStyle = isCurrent ? "#ffd000" : "black";
		ctx.lineWidth = 5;
		ctx.strokeRect(x, y, PLAYER_SIZE, PLAYER_SIZE);
		ctx.restore();
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader,
		_addCamZ: number,
		dt: number
	) {
		const data = _data as ClientData;
		if (data.firstFrame) {
			data.firstFrame = false;
		}

		data.update(this, playerIdx, dt);

		ctx.fillStyle = "black";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		// Center the camera on the current player
		ctx.save();
		ctx.translate(WIDTH / 2 - data.camera.x, HEIGHT / 2 - data.camera.y);

		const current = this.players[playerIdx];
		const room = this.stage.rooms[current.room];

		this.drawRoomBackgrounds(ctx, room);
		this.drawRoomBlocks(ctx, room, data, playerIdx, dt);
		for (const adjacent of room.adjacentRooms) {
			this.drawRoomBlocks(ctx, adjacent, data, playerIdx, dt);
		}

		drawAdjacenceRects(ctx, room, current);

		for (const player of this.players) {
			if (player.connected) {
				this.drawPlayer(ctx, player, player.id === playerIdx);
			}
		}

		ctx.restore();

		data.drawBars(ctx);
		data.drawDeathTransition(ctx, this.players[playerIdx].deathCooldown);
	}


	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	/** Shares the players, and the blocks which have data able to change. */
	override save(): Uint8Array {
		const { State } = protocols.get();
		const object: Fields = {
			players: this.players.map(p => p.save()),
			blocks: this.blockList.filter(b => b.hasSharedData()).map(b => b.save()),
			time: this.time,
			finishCooldown: this.finishCooldown,
			finishCount: this.finishCount
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = State.decode(data) as Fields;

		for (const [i, player] of obj.players.entries()) {
			this.players[i].load(player);
		}

		for (const block of obj.blocks) {
			this.blocks[block.id].load(block);
		}

		this.time = obj.time;
		this.finishCooldown = obj.finishCooldown;
		this.finishCount = obj.finishCount;
	}

	override getSize() {
		return { width: WIDTH, height: HEIGHT };
	}

	override evalMouseCoords(
		x: number,
		y: number,
		_playerIdx: number,
		_clientData: any
	) {
		const { camera } = _clientData as ClientData;
		return {
			x: x - WIDTH / 2 + camera.x,
			y: y - HEIGHT / 2 + camera.y
		};
	}

	override getMobileDesc(): MobileDescriptor {
		return {
			joysticks: {},
			buttons: {
				left: { x: 70, xp: 'left', y: 70, yp: 'bottom', size: 70, color: "#44aaff" },
				right: { x: 180, xp: 'left', y: 70, yp: 'bottom', size: 70, color: "#44aaff" },
				jump: { x: 70, xp: 'right', y: 70, yp: 'bottom', size: 70, color: "#ffaa00" },
				down: { x: 180, xp: 'right', y: 70, yp: 'bottom', size: 70, color: "#ff4466" }
			}
		};
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	/**
	 * Ranks the arrived players by arrival order. Everybody else is last,
	 * tied together. There are no teams: everybody is in the same result list.
	 */
	private produceFinish(): FinishGame {
		const arrived = this.players
			.filter(p => p.isFinished())
			.sort((a, b) => a.finishRank - b.finishRank);
		const others = this.players.filter(p => !p.isFinished());

		const playerEqualities: number[] = [];
		for (let i = 0; i + 1 < others.length; i++) {
			playerEqualities.push(arrived.length + i);
		}

		return {
			results: [[...arrived, ...others].map(p => p.id)],
			teamEqualities: [],
			playerEqualities
		};
	}
}

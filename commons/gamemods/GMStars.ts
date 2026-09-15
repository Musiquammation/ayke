import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader, ImageLoaderFolder } from "../util/ImageLoader";

const protocols = getProtocol('stars', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

// =====================================================================================
// CONSTANTS
// =====================================================================================

const TILE = 80; // size of a single map tile, in pixels

const GRAVITY = 2200;
const JUMP_HOLD_GRAVITY = 900; // reduced gravity while the jump button is held during ascent

// Player physics
const ACCEL = 2400; // horizontal acceleration while a direction key is held
const RUN_ACCEL = 3600; // horizontal acceleration while running (dash held)
const FRICTION = 2600; // horizontal deceleration when no direction key is held
const MAX_VX = 420; // normal max horizontal speed
const MAX_RUN_VX = 720; // max horizontal speed while running
const JUMP_VELOCITY = -820; // vertical velocity applied on jump
const SHELL_SPEED = 900; // horizontal speed while moving as a blue shell

// Player hitbox (small vs big form)
const SMALL_W = 60, SMALL_H = 70;
const BIG_W = 60, BIG_H = 110;

// Blue shell power-up: time spent running before automatically curling into a shell
const RUN_TO_SHELL_TIME = 1;

// Ice ball freeze duration
const FREEZE_TIME = 1;

// Star respawn interval (how often a new star pops onto the map)
const STAR_SPAWN_INTERVAL = 5;

// Item box: time an item box stays inactive/depleted after being hit
const ITEM_BOX_COOLDOWN = 6;

// Time before a player respawns after falling into the void
const VOID_RESPAWN_TIME = 2;

// Number of stars created on the ground where a player fell into the void
const VOID_DROP_STAR_COUNT = 3;

// Ground-pound (down-slam) tuning
const GROUND_POUND_DELAY = 0.2; // small hang time in the air before slamming down
const GROUND_POUND_SPEED = 1900; // fall speed while slamming, uncontrollable
const GROUND_POUND_HEAD_DAMAGE = 3; // stars lost by a player hit on the head by a ground pound

// Regular "stomp" (landing on top of another player normally)
const STOMP_DAMAGE = 1;
const STOMP_BOUNCE_VELOCITY = -700; // vertical boost given to the stomping player

// Damage dealt by hazards
const FIREBALL_DAMAGE = 1;
const SHELL_TOUCH_DAMAGE = 1;
const ICEBALL_DAMAGE = 0; // iceballs don't remove stars, they just freeze

// Projectiles
const FIREBALL_SPEED = 620;
const ICEBALL_SPEED = 560;
const PROJECTILE_SIZE = 24;
const FIREBALL_GRAVITY = 1400; // fireballs arc/bounce a little, like in Mario
const FIREBALL_BOUNCE_VY = -420;

// Items dropped from boxes
const ITEM_SIZE = 50;
const MUSHROOM_SPEED = 220; // only the mushroom actively walks

// Stars (the collectible, scored objective — not to confuse with "Star power")
const STAR_SIZE = 40;
const STAR_POP_VELOCITY = -650; // stars pop up like a jump when they spawn
const STAR_POP_HORIZONTAL_VELOCITY = 300; // initial horizontal speed, away from the nearest player
const STAR_JUMP = 550;

// Victory condition
const STARS_TO_WIN = 10;

// Tile types used in the static map layout
const enum TileType {
	EMPTY = 0,
	GROUND = 1,
	BRICK = 2,
	ITEM_BOX = 3
}

// Power-up state a player currently holds
const enum PowerState {
	NONE = 0,
	FIRE = 1,
	ICE = 2,
	BLUE_SHELL = 3
}

// Types of items that can pop out of an item box
const enum ItemType {
	MUSHROOM = 0,
	FIRE_FLOWER = 1,
	ICE_FLOWER = 2,
	BLUE_SHELL = 3
}

const X_LIMIT_MARGIN = TILE * 2; // how far below the map a player must fall to be considered "in the void"

// =====================================================================================
// DETERMINISTIC RNG
//
// The rules for this game mode forbid Math.random(): every random decision (star
// spawn location, next item box content, ...) must go through this seeded generator
// so that its internal state can be saved/loaded along with the rest of the game
// state. This guarantees that a server reload never desyncs "hidden" future outcomes.
// =====================================================================================
class RNG {
	constructor(public seed: number) { }

	/** Returns a float in [0, 1). Mulberry32 algorithm — small, fast, deterministic. */
	next(): number {
		let t = (this.seed += 0x6D2B79F5) | 0;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/** Returns an integer in [0, max). */
	nextInt(max: number): number {
		return Math.floor(this.next() * max);
	}

	/** Returns a float in [min, max). */
	range(min: number, max: number): number {
		return min + this.next() * (max - min);
	}
}

// =====================================================================================
// MAP DEFINITIONS
//
// Each map is a plain grid of characters, read top to bottom / left to right:
//   ' ' -> empty air (nothing, players fall through)
//   'G' -> ground (solid)
//   'B' -> brick (solid, breakable-look but here just solid scenery)
//   'I' -> item box (solid from below/side, dispenses an item when hit)
// The bottom-most row(s) of '.' represent the void: if a player's y goes past the
// grid height, they are considered fallen into the void.
// =====================================================================================

const MAP_ROWS: string[][] = [
	// ----- Map 0: "Classic Plains" -----
	[
		"                                                            ",
		"                                                            ",
		"           I                        I    I                 ",
		"                                                             ",
		"        BBB          I  BBB                     BBB         ",
		"                                                             ",
		"                  GGGG                    GGGG              ",
		"GGGGGGGG      GGGGGGGG        GGGGGG    GGGGGGGG   GGGGGGGGG",
	],
	// ----- Map 1: "Sky Gaps" (lots of pits, floating brick platforms) -----
	[
		"                                                            ",
		"     I                    I                       I         ",
		"   BBBBB       I       BBBBB          I        BBBBB        ",
		"                                                             ",
		"GGGGG      GGGGG      GGGGG      GGGGG      GGGGG      GGGGG",
	],
	// ----- Map 2: "Castle Run" (tighter corridors, more item boxes) -----
	[
		"                                                            ",
		"    I  I       BBB       I  I       BBB       I  I          ",
		"   BBBBBBB   BBBBBBBBB  BBBBBBB   BBBBBBBBB  BBBBBBB        ",
		"                                                             ",
		"GGGG  GGGGGGGG    GGGGGGGGGG    GGGGGGGGGG  GGGG   GGGGGGGGG",
	]
];

/** A parsed static map: dimensions + solid tile lookup + list of item box tile coords. */
class GameMap {
	readonly cols: number;
	readonly rows: number;
	readonly tiles: TileType[][];
	readonly itemBoxCoords: { col: number; row: number }[] = [];

	constructor(layout: string[]) {
		this.rows = layout.length;
		this.cols = Math.max(...layout.map(r => r.length));
		this.tiles = [];

		for (let r = 0; r < this.rows; r++) {
			const row: TileType[] = [];
			const line = layout[r];
			for (let c = 0; c < this.cols; c++) {
				const ch = line[c] ?? ' ';
				let t = TileType.EMPTY;
				if (ch === 'G') t = TileType.GROUND;
				else if (ch === 'B') t = TileType.BRICK;
				else if (ch === 'I') {
					t = TileType.ITEM_BOX;
					this.itemBoxCoords.push({ col: c, row: r });
				}
				row.push(t);
			}
			this.tiles.push(row);
		}
	}

	get pixelWidth() { return this.cols * TILE; }
	get pixelHeight() { return this.rows * TILE; }

	/** Whether the tile at (col, row) is solid (blocks movement). */
	isSolid(col: number, row: number): boolean {
		if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
		const t = this.tiles[row][col];
		return t === TileType.GROUND || t === TileType.BRICK || t === TileType.ITEM_BOX;
	}

	tileRect(col: number, row: number) {
		return {
			x: col * TILE + TILE / 2,
			y: row * TILE + TILE / 2,
			w: TILE,
			h: TILE
		};
	}
}

const MAPS = MAP_ROWS.map(layout => new GameMap(layout));

// =====================================================================================
// ITEM BOX (dynamic state of a static 'I' tile)
// =====================================================================================
class ItemBox {
	used = false;
	cooldown = 0; // seconds remaining before it becomes active again
	pendingItem: ItemType = ItemType.MUSHROOM;

	constructor(public col: number, public row: number) { }

	/** Picks (in advance) the item this box will dispense next, using the shared RNG. */
	rollNextItem(rng: RNG) {
		const roll = rng.next();
		if (roll < 0.4) {
			this.pendingItem = ItemType.MUSHROOM;
		} else if (roll < 0.65) {
			this.pendingItem = ItemType.FIRE_FLOWER;
		} else if (roll < 0.9) {
			this.pendingItem = ItemType.ICE_FLOWER;
		} else {
			this.pendingItem = ItemType.BLUE_SHELL;
		}
	}

	/** Advances the depletion cooldown; reactivates the box once it reaches zero. */
	tick(dt: number) {
		if (this.used) {
			this.cooldown -= dt;
			if (this.cooldown <= 0) {
				this.used = false;
				this.cooldown = 0;
			}
		}
	}

	load(obj: Fields) {
		this.used = obj.used;
		this.cooldown = obj.cooldown;
		this.pendingItem = obj.pendingItem;
	}
}

// =====================================================================================
// DROPPED ITEM (mushroom / fire flower / ice flower / blue shell lying on the map)
// =====================================================================================
class ItemDrop {
	vx: number;
	vy = 0;
	grounded = false;

	constructor(
		public x: number,
		public y: number,
		public type: ItemType,
		public direction: number // -1 or 1, only relevant for the mushroom
	) {
		this.vx = type === ItemType.MUSHROOM ? MUSHROOM_SPEED * direction : 0;
	}

	/** Applies gravity + (for the mushroom only) horizontal walking, with tile collision. */
	move(dt: number, map: GameMap) {
		this.vy += GRAVITY * dt;

		// Only the mushroom actively moves horizontally; other items just sit still.
		if (this.type === ItemType.MUSHROOM) {
			const nextX = this.x + this.vx * dt;
			if (collidesMapHorizontal(nextX, this.y, ITEM_SIZE, ITEM_SIZE, map)) {
				this.direction *= -1;
				this.vx = MUSHROOM_SPEED * this.direction;
			} else {
				this.x = nextX;
			}

			this.x = wrapHorizontal(this.x, ITEM_SIZE, map);
		}

		const nextY = this.y + this.vy * dt;
		const vRes = resolveMapVertical(this.x, this.y, nextY, ITEM_SIZE, ITEM_SIZE, this.vy, map);
		this.y = vRes.y;
		this.vy = vRes.vy;
		this.grounded = vRes.grounded;
	}

	isInVoid(map: GameMap) {
		return this.y > map.pixelHeight + X_LIMIT_MARGIN;
	}

	load(obj: Fields) {
		this.x = obj.x; this.y = obj.y; this.vx = obj.vx; this.vy = obj.vy;
		this.type = obj.type; this.direction = obj.direction;
	}
}

// =====================================================================================
// STAR (the scoring collectible)
// =====================================================================================
class StarPickup {
	constructor(
		public x: number,
		public y: number,
		public vx: number,
		public vy: number
	) { }

	/** Stars fall under gravity and bounce off the ground/walls until they lose energy. */
	move(dt: number, map: GameMap) {
		this.vy += GRAVITY * dt;

		const nextX = this.x + this.vx * dt;
		if (collidesMapHorizontal(nextX, this.y, STAR_SIZE, STAR_SIZE, map)) {
			this.vx = -this.vx;
		} else {
			this.x = nextX;
		}

		this.x = wrapHorizontal(this.x, STAR_SIZE, map);

		const nextY = this.y + this.vy * dt;
		const vRes = resolveMapVertical(this.x, this.y, nextY, STAR_SIZE, STAR_SIZE, this.vy, map);
		this.y = vRes.y;
		if (vRes.grounded && this.vy > 0) {
			// Bounce off the ground, losing a bit of energy each time.
			this.vy = -STAR_JUMP;
		} else {
			this.vy = vRes.vy;
		}
	}

	isInVoid(map: GameMap) {
		return this.y > map.pixelHeight + X_LIMIT_MARGIN;
	}

	load(obj: Fields) {
		this.x = obj.x; this.y = obj.y; this.vx = obj.vx; this.vy = obj.vy;
	}
}

// =====================================================================================
// PROJECTILE (fireball / iceball)
// =====================================================================================
class Projectile {
	constructor(
		public x: number,
		public y: number,
		public vx: number,
		public vy: number,
		public kind: 'fire' | 'ice',
		public owner: number
	) { }

	move(dt: number, map: GameMap) {
		if (this.kind === 'fire') {
			// Fireballs arc and bounce like in classic Mario games.
			this.vy += FIREBALL_GRAVITY * dt;
			const nextY = this.y + this.vy * dt;
			const vRes = resolveMapVertical(this.x, this.y, nextY, PROJECTILE_SIZE, PROJECTILE_SIZE, this.vy, map);
			this.y = vRes.y;
			this.vy = vRes.grounded ? FIREBALL_BOUNCE_VY : vRes.vy;
		} else {
			// Iceballs fly straight, ignoring gravity.
			this.y += this.vy * dt;
		}

		const nextX = this.x + this.vx * dt;
		if (!collidesMapHorizontal(nextX, this.y, PROJECTILE_SIZE, PROJECTILE_SIZE, map)) {
			this.x = nextX;
		}

		this.x = wrapHorizontal(this.x, PROJECTILE_SIZE, map);
	}

	isDead(map: GameMap) {
		return this.y > map.pixelHeight + X_LIMIT_MARGIN;
	}

	load(obj: Fields) {
		this.x = obj.x; this.y = obj.y; this.vx = obj.vx; this.vy = obj.vy;
		this.kind = obj.kind === 1 ? 'ice' : 'fire';
		this.owner = obj.owner;
	}
}

// =====================================================================================
// TILE COLLISION HELPERS
//
// Simple axis-separated AABB resolution against the static map grid. Horizontal and
// vertical motion are resolved independently, which is standard practice for
// platformers and keeps corner cases (running into a wall while falling, etc.) simple.
// =====================================================================================

/** Returns true if a box at (x, y) with size (w, h) would overlap a solid tile. */
function collidesMapHorizontal(x: number, y: number, w: number, h: number, map: GameMap): boolean {
	const left = Math.floor((x - w / 2) / TILE);
	const right = Math.floor((x + w / 2 - 1) / TILE);
	const top = Math.floor((y - h / 2) / TILE);
	const bottom = Math.floor((y + h / 2 - 1) / TILE);

	for (let r = top; r <= bottom; r++)
		for (let c = left; c <= right; c++)
			if (map.isSolid(c, r)) return true;

	return false;
}

/**
 * Teleports an object to the opposite side when it completely leaves the map horizontally.
 */
function wrapHorizontal(x: number, width: number, map: GameMap): number {
	const halfWidth = width / 2;

	if (x + halfWidth < 0)
		return map.pixelWidth + halfWidth;

	if (x - halfWidth > map.pixelWidth)
		return -halfWidth;

	return x;
}

/**
 * Resolves vertical movement against solid tiles: stops the box exactly on top of the
 * ground when falling, or below a ceiling when jumping, and reports whether it is now
 * resting on the ground ("grounded").
 */
function resolveMapVertical(
	x: number, y: number, nextY: number,
	w: number, h: number, vy: number,
	map: GameMap
) {
	const left = Math.floor((x - w / 2) / TILE);
	const right = Math.floor((x + w / 2 - 1) / TILE);

	if (vy >= 0) {
		// Falling: find the highest solid tile row below us and clamp onto it.
		const bottom = Math.floor((nextY + h / 2 - 1) / TILE);
		for (let r = Math.floor((y + h / 2 - 1) / TILE); r <= bottom; r++) {
			for (let c = left; c <= right; c++) {
				if (map.isSolid(c, r)) {
					return { y: r * TILE - h / 2, vy: 0, grounded: true };
				}
			}
		}
		return { y: nextY, vy, grounded: false };
	} else {
		// Rising: find the lowest solid tile row above us and clamp under it.
		const top = Math.floor((nextY - h / 2) / TILE);
		for (let r = Math.floor((y - h / 2) / TILE); r >= top; r--) {
			for (let c = left; c <= right; c++) {
				if (map.isSolid(c, r)) {
					return { y: (r + 1) * TILE + h / 2, vy: 0, grounded: false };
				}
			}
		}
		return { y: nextY, vy, grounded: false };
	}
}

// =====================================================================================
// PLAYER
// =====================================================================================
class Player {
	vx = 0;
	vy = 0;
	direction = 1; // -1 left, 1 right
	big = false;
	power: PowerState = PowerState.NONE;
	connected = true;
	stars = 0;

	// Respawn: <0 means alive, >=0 is the remaining respawn countdown
	aliveTimer = -1;

	spawnX = 0;
	spawnY = 0;

	// Input state (persisted so behaviour survives a save/load mid-action)
	holdingLeft = false;
	holdingRight = false;
	holdingRun = false;
	holdingDown = false;
	wantsJump = false;
	grounded = false;

	// Blue shell power-up
	isShellForm = false;
	shellRunTimer = 0;

	// Ground pound (down-slam)
	isGroundPounding = false;
	groundPoundDelay = 0; // countdown of the little hang-time before slamming

	// Ice ball freeze
	freezeTimer = 0;

	constructor(public x: number, public y: number) { }

	initSpawn(x: number, y: number) {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
	}

	get width() { return this.big ? BIG_W : SMALL_W; }
	get height() { return this.big ? BIG_H : SMALL_H; }

	isAlive() { return this.aliveTimer < 0; }
	isFrozen() { return this.freezeTimer > 0; }

	/** Resets the player back to their spawn point with no power-ups, as after a void fall. */
	respawn() {
		this.x = this.spawnX;
		this.y = this.spawnY;
		this.vx = 0;
		this.vy = 0;
		this.big = false;
		this.power = PowerState.NONE;
		this.isShellForm = false;
		this.shellRunTimer = 0;
		this.isGroundPounding = false;
		this.groundPoundDelay = 0;
		this.freezeTimer = 0;
	}

	/** Applies a hit that costs the player some stars, never going below zero. */
	loseStars(amount: number) {
		this.stars = Math.max(0, this.stars - amount);
	}

	rect() {
		return {
			x: this.x,
			y: this.y,
			w: this.width,
			h: this.height
		};
	}

	load(obj: Fields) {
		this.x = obj.x; this.y = obj.y;
		this.vx = obj.vx; this.vy = obj.vy;
		this.direction = obj.direction;
		this.power = obj.power;
		this.big = obj.big;
		this.connected = obj.connected;
		this.stars = obj.stars;
		this.aliveTimer = obj.aliveTimer;
		this.spawnX = obj.spawnX;
		this.spawnY = obj.spawnY;
		this.isShellForm = obj.isShellForm;
		this.shellRunTimer = obj.shellRunTimer;
		this.isGroundPounding = obj.isGroundPounding;
		this.groundPoundDelay = obj.groundPoundDelay;
		this.freezeTimer = obj.freezeTimer;
		
		this.holdingLeft = obj.holdingLeft;
		this.holdingRight = obj.holdingRight;
		this.holdingRun = obj.holdingRun;
		this.holdingDown = obj.holdingDown;
		this.wantsJump = obj.wantsJump;
		this.grounded = obj.grounded;
	}
}

// =====================================================================================
// CAMERA
//
// The camera represents the visible game area rather than the size of the map.
// The viewport is fixed at 1600x900 and follows the player while remaining inside
// the map boundaries.
// =====================================================================================
class Camera {
	static readonly WIDTH = 1600;
	static readonly HEIGHT = 900;

	x = 0;
	y = 0;

	update(px: number, py: number, mapWidth: number, mapHeight: number) {
		// Center the camera on the player.
		this.x = px;
		this.y = py;

		// Keep the camera inside the map boundaries.
		const halfWidth = Camera.WIDTH / 2;

		this.x = Math.max(halfWidth, Math.min(mapWidth - halfWidth, this.x));
		this.y = mapHeight - Camera.HEIGHT/2;
	}

	teleport(px: number, py: number, mapWidth: number, mapHeight: number) {
		this.update(px, py, mapWidth, mapHeight);
	}

	getCoords() {
		return { x: this.x, y: this.y };
	}
}

// =====================================================================================
// CLIENT DATA (everything that is purely local display state, never saved/loaded)
// =====================================================================================
class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;

	readonly html: HTMLDivElement;
	readonly starBoard: HTMLDivElement;
	readonly rankingRows: HTMLDivElement[] = [];

	readonly camera = new Camera();
	private clientWasDead = true;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-stars-root");

		this.starBoard = document.createElement("div");
		this.starBoard.classList.add("game-stars-starboard");
		this.html.appendChild(this.starBoard);
	}

	/** Rebuilds the star-count HUD rows if the player count changed. */
	private ensureRows(count: number) {
		while (this.rankingRows.length < count) {
			const row = document.createElement("div");
			row.classList.add("game-stars-star-row");
			this.starBoard.appendChild(row);
			this.rankingRows.push(row);
		}
	}

	update(game: GMStars, playerIdx: number) {
		this.ensureRows(game.players.length);

		// Sort players by star count for the ranking display, but keep track of
		// which original index each row corresponds to.
		const order = game.players
			.map((p, idx) => ({ p, idx }))
			.sort((a, b) => b.p.stars - a.p.stars);

		order.forEach((entry, rank) => {
			const row = this.rankingRows[rank];
			row.textContent = `#${rank + 1} P${entry.idx + 1}: ${entry.p.stars}★`;
			row.classList.toggle('game-stars-star-row-self', entry.idx === playerIdx);
		});

		const player = game.players[playerIdx];
		if (this.clientWasDead && player.isAlive()) {
			this.camera.teleport(
				player.x,
				player.y,
				game.map.pixelWidth,
				game.map.pixelHeight
			);
		}

		this.clientWasDead = !player.isAlive();

		this.camera.update(
			player.x,
			player.y,
			game.map.pixelWidth,
			game.map.pixelHeight
		);
	}
}

class TutorialData {
	private step = 0;
	constructor(private readonly game: GMStars) { }

	frame(dt: number, clock: number) {
		const player = this.game.players[0];
		if (!player.isAlive()) this.step = 0;
		if (this.step === 0) return "Grab the star and reach 10 to win!";
		return "";
	}
}

function generateClientDom(unlockedSkins: string[]) {
	return {
		mapId: 0,
		unlockedSkins: unlockedSkins,

		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({
				mapId: this.mapId
			}).finish();
		}
	};
}

// =====================================================================================
// GAME MODE
// =====================================================================================
export class GMStars extends GameMode {
	static readonly types = { Player };

	static readonly DATA = {
		GRAVITY, TILE, STARS_TO_WIN
	};

	readonly players: Player[];

	map: GameMap = MAPS[0];
	mapId = 0;

	rng = new RNG(1);

	itemBoxes: ItemBox[] = [];
	items: ItemDrop[] = [];
	stars: StarPickup[] = [];
	projectiles: Projectile[] = [];

	// Next star spawn: pre-rolled in advance and shared through save/load, so the
	// outcome is deterministic across server reloads. Clients never display this.
	nextStarX = 0;
	nextStarY = 0;
	starSpawnTimer = STAR_SPAWN_INTERVAL;

	private constructor(total: number) {
		super();
		this.players = Array.from({ length: total }, () => new Player(0, 0));
	}

	// -------------------------------------------------------------------------------
	// Map / item box setup
	// -------------------------------------------------------------------------------

	private setupMap(mapId: number) {
		this.mapId = mapId;
		this.map = MAPS[mapId];
		this.itemBoxes = this.map.itemBoxCoords.map(({ col, row }) => {
			const box = new ItemBox(col, row);
			box.rollNextItem(this.rng); // pre-roll first item, in advance
			return box;
		});
		this.rollNextStarSpawn();
	}

	/** Picks (in advance) where the next star will pop up, using the shared RNG. */
	private rollNextStarSpawn() {
		// Pick a random column that isn't solid ground itself, and drop the star
		// from just above the ground level so its upward pop looks natural.
		const col = this.rng.nextInt(this.map.cols);
		let row = this.map.rows - 2;
		while (row > 0 && !this.map.isSolid(col, row + 1)) row--;

		this.nextStarX = col * TILE + TILE / 2;
		this.nextStarY = row * TILE + TILE / 2;
	}

	// -------------------------------------------------------------------------------
	// Setup: server / client creation
	// -------------------------------------------------------------------------------

	static async createServ(
		players: PlayerInput[],
		total: number,
		_hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();
		const game = new GMStars(total);

		function decode(i: number) {
			if (i < players.length) return decodeFullMessage(StartData.decode(players[i].data));
			return generateClientDom([]);
		}

		const playerInfos = await Promise.all(
			game.players.map(async (p, i) => {
				const d = decode(i);
				return {
					player: p,
					index: i,
					mapId: d.mapId ?? 0
				};
			})
		);

		// The map is chosen once, at game creation (first player's pick wins, falls
		// back to map 0 if nobody voted / it's a bot game).
		const mapId = Math.min(Math.max(playerInfos[0]?.mapId ?? 0, 0), MAPS.length - 1);
		game.setupMap(mapId);

		// Spread spawn points evenly along the ground of the chosen map.
		const spacing = game.map.pixelWidth / (total + 1);
		for (const [i, p] of game.players.entries()) {
			const spawnX = spacing * (i + 1);

			// Find the ground row under this column to sit the player on top of it.
			const col = Math.floor(spawnX / TILE);
			let row = game.map.rows - 1;
			while (row > 0 && !game.map.isSolid(col, row)) row--;

			p.initSpawn(spawnX, row * TILE - SMALL_H);
		}

		const data = StartDataClient.encode({
			players: game.players.map(p => ({
				x: p.spawnX,
				y: p.spawnY
			})),
			mapId
		}).finish();

		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		playerIdx: number
	) {
		const game = new GMStars(total);
		const { StartData, StartDataClient } = protocols.get();
		const clientData = new ClientData();
		const textures: { [k: string]: string } = {};

		if (origin === 'server') {
			const { players, mapId } = decodeFullMessage(StartDataClient.decode(data));
			game.setupMap(mapId ?? 0);

			for (const [idx, p] of players.entries()) {
				game.players[idx].initSpawn(p.x, p.y);
			}
		} else {
			const { mapId } = decodeFullMessage(StartData.decode(data));
			game.setupMap(mapId ?? 0);

			const spacing = game.map.pixelWidth / (total + 1);
			for (const [i, p] of game.players.entries()) {
				p.initSpawn(spacing * (i + 1), 0);
			}
		}

		return { game, data: clientData, html: clientData.html, skins: textures };
	}

	static readonly generateClientDom = generateClientDom;

	static readonly TEXTURES = {
		'ground': "/assets/games/stars/ground.svg",
		'brick': "/assets/games/stars/brick.svg",
		'item-box': "/assets/games/stars/item-box.svg",
		'item-box-used': "/assets/games/stars/item-box-used.svg",
		'mushroom': "/assets/games/stars/mushroom.svg",
		'fire-flower': "/assets/games/stars/fire-flower.svg",
		'ice-flower': "/assets/games/stars/ice-flower.svg",
		'blue-shell-item': "/assets/games/stars/blue-shell-item.svg",

		'player-small-idle': "/assets/games/stars/player-small-idle.svg",
		'player-small-walking': "/assets/games/stars/player-small-walking.svg",
		'player-big-idle': "/assets/games/stars/player-big-idle.svg",
		'player-big-walking': "/assets/games/stars/player-big-walking.svg",
		'player-shell-form': "/assets/games/stars/player-shell-form.svg",

		'star': "/assets/games/stars/star.svg",
		'fireball': "/assets/games/stars/fireball.svg",
		'iceball': "/assets/games/stars/iceball.svg"
	};

	override init(): void { }

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	// -------------------------------------------------------------------------------
	// Main simulation loop
	// -------------------------------------------------------------------------------

	override run(dt: number, produceFinish: boolean): FinishGame | null {
		this.updateItemBoxes(dt);
		this.updateStarSpawning(dt);
		this.updateItems(dt);
		this.updateStars(dt);
		this.updateProjectiles(dt);

		for (const player of this.players) {
			this.updatePlayer(player, dt);
		}

		this.handlePlayerVsPlayer();
		this.handlePlayerVsPickups();
		this.handlePlayerVsProjectiles();

		// Victory check: first player to reach the star threshold ends the game.
		const winner = this.players.find(p => p.stars >= STARS_TO_WIN);
		if (produceFinish && winner) {
			return this.produceFinish();
		}

		return null;
	}

	// --- Item boxes ------------------------------------------------------------

	private updateItemBoxes(dt: number) {
		for (const box of this.itemBoxes) box.tick(dt);
	}

	/**
	 * Called when a player hits an item box (from below normally, or from above via
	 * a ground pound). Spawns the pre-rolled item and starts the depletion cooldown.
	 */
	private triggerItemBox(box: ItemBox, fromAbove: boolean) {
		if (box.used) return;

		box.used = true;
		box.cooldown = ITEM_BOX_COOLDOWN;

		const x = box.col * TILE + TILE / 2;

		// Normally the item pops out above the box; a ground-pound charge that
		// smashes through from above instead drops the item out the bottom.
		const y = fromAbove
			? (box.row + 1) * TILE + ITEM_SIZE / 2
			: box.row * TILE - ITEM_SIZE / 2;

		this.items.push(new ItemDrop(x, y, box.pendingItem, 1));

		// Pre-roll the next item now, in advance, sharing it via save/load but
		// never exposing it to the client until it is actually dispensed.
		box.rollNextItem(this.rng);
	}

	// --- Star spawning -----------------------------------------------------------

	private updateStarSpawning(dt: number) {
		this.starSpawnTimer -= dt;
		if (this.starSpawnTimer > 0) return;

		this.starSpawnTimer = STAR_SPAWN_INTERVAL;

		// Spawn at the pre-rolled position. The horizontal velocity points away
		// from the nearest living player, while the vertical velocity makes the
		// star pop upward.
		const vx = this.getStarEscapeVelocity(this.nextStarX);

		this.stars.push(new StarPickup(
			this.nextStarX,
			this.nextStarY,
			vx,
			STAR_POP_VELOCITY
		));

		// Immediately roll the following spawn point so it can be shared with clients.
		this.rollNextStarSpawn();
	}

	/**
	 * Returns the initial horizontal star velocity directed away from the nearest
	 * living player.
	 */
	private getStarEscapeVelocity(starX: number) {
		let nearestPlayer: Player | null = null;
		let nearestDistance = Infinity;

		for (const player of this.players) {
			if (!player.isAlive()) continue;

			// Account for horizontal wrapping when measuring the distance.
			const directDistance = Math.abs(player.x - starX);
			const wrappedDistance = this.map.pixelWidth - directDistance;
			const distance = Math.min(directDistance, wrappedDistance);

			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestPlayer = player;
			}
		}

		if (!nearestPlayer) return 0;

		const dx = starX - nearestPlayer.x;

		// The star moves away from the player. If both positions coincide,
		// there is no meaningful direction, so choose a deterministic direction.
		if (dx > 0) return STAR_POP_HORIZONTAL_VELOCITY;
		if (dx < 0) return -STAR_POP_HORIZONTAL_VELOCITY;

		return STAR_POP_HORIZONTAL_VELOCITY;
	}

	// --- Items / stars / projectiles physics --------------------------------------

	private updateItems(dt: number) {
		for (const item of this.items) item.move(dt, this.map);
		this.items = this.items.filter(i => !i.isInVoid(this.map));
	}

	private updateStars(dt: number) {
		for (const star of this.stars) star.move(dt, this.map);
		this.stars = this.stars.filter(s => !s.isInVoid(this.map));
	}

	private updateProjectiles(dt: number) {
		for (const p of this.projectiles) p.move(dt, this.map);
		this.projectiles = this.projectiles.filter(p => !p.isDead(this.map));
	}

	// --- Player physics ------------------------------------------------------------

	private updatePlayer(player: Player, dt: number) {
		// Respawn handling
		if (!player.isAlive()) {
			player.aliveTimer -= dt;
			if (player.aliveTimer <= 0) player.respawn();
			return;
		}

		if (player.isFrozen()) {
			player.freezeTimer -= dt;

			// Frozen players don't move at all, but still obey gravity so they don't float.
			this.applyGravityAndVertical(player, dt);
			return;
		}

		if (player.isGroundPounding) {
			this.updateGroundPound(player, dt);
			return;
		}

		if (player.isShellForm) {
			this.updateShellForm(player, dt);
			return;
		}

		this.updateNormalMovement(player, dt);
	}

	/** Standard walk/run/jump/duck movement with progressive acceleration. */
	private updateNormalMovement(player: Player, dt: number) {
		const accel = player.holdingRun ? RUN_ACCEL : ACCEL;
		const maxSpeed = player.holdingRun ? MAX_RUN_VX : MAX_VX;

		if (player.holdingLeft && !player.holdingRight) {
			player.vx = Math.max(-maxSpeed, player.vx - accel * dt);
			player.direction = -1;
		} else if (player.holdingRight && !player.holdingLeft) {
			player.vx = Math.min(maxSpeed, player.vx + accel * dt);
			player.direction = 1;
		} else {
			// No direction held: decelerate smoothly back to a stop (friction).
			if (player.vx > 0) player.vx = Math.max(0, player.vx - FRICTION * dt);
			else if (player.vx < 0) player.vx = Math.min(0, player.vx + FRICTION * dt);
		}

		// Blue shell power-up: after RUN_TO_SHELL_TIME seconds of sustained running,
		// the player automatically curls into a shell.
		if (player.power === PowerState.BLUE_SHELL && player.holdingRun && (player.holdingLeft || player.holdingRight)) {
			player.shellRunTimer += dt;
			if (player.shellRunTimer >= RUN_TO_SHELL_TIME) {
				player.isShellForm = true;
				player.vx = SHELL_SPEED * player.direction;
				player.shellRunTimer = 0;
			}
		} else {
			player.shellRunTimer = 0;
		}

		// Ground pound: pressing down starts the charge (a short hang-time, then a
		// fast, uncontrollable fall).
		if (player.holdingDown && !player.grounded) {
			player.isGroundPounding = true;
			player.groundPoundDelay = GROUND_POUND_DELAY;
			player.vx = 0;
			player.vy = 0;
			return;
		}

		if (player.wantsJump && player.grounded) {
			player.vy = JUMP_VELOCITY;
			player.grounded = false;
		}

		this.moveHorizontal(player, dt);
		this.applyGravityAndVertical(player, dt);
	}

	/** Blue shell form: rolls forward, can't be steered, wraps horizontally, can jump. */
	private updateShellForm(player: Player, dt: number) {
		if (player.wantsJump && player.grounded) {
			player.vy = JUMP_VELOCITY;
			player.grounded = false;
		}

		const nextX = player.x + player.vx * dt;
		if (!collidesMapHorizontal(nextX, player.y, player.width, player.height, this.map)) {
			player.x = nextX;
		}

		player.x = wrapHorizontal(player.x, player.width, this.map);

		this.applyGravityAndVertical(player, dt);
	}

	/** Ground pound state machine: brief hang, then a fast uncontrollable slam down. */
	private updateGroundPound(player: Player, dt: number) {
		if (player.groundPoundDelay > 0) {
			player.groundPoundDelay -= dt;
			return; // suspended in the air, no gravity during the tiny wind-up
		}

		player.vy = GROUND_POUND_SPEED;

		const previousY = player.y;
		const nextY = player.y + player.vy * dt;

		// Check the crossing before the vertical collision resolution clamps the player.
		this.checkItemBoxHit(player, previousY, nextY, true);

		const vRes = resolveMapVertical(
			player.x,
			player.y,
			nextY,
			player.width,
			player.height,
			player.vy,
			this.map
		);

		player.y = vRes.y;
		player.grounded = vRes.grounded;

		if (vRes.grounded) {
			player.isGroundPounding = false;
			player.vy = 0;
		}
	}

	private moveHorizontal(player: Player, dt: number) {
		const nextX = player.x + player.vx * dt;

		if (!collidesMapHorizontal(nextX, player.y, player.width, player.height, this.map)) {
			player.x = nextX;
		}

		player.x = wrapHorizontal(player.x, player.width, this.map);
	}

	private applyGravityAndVertical(player: Player, dt: number) {
		// Reduce gravity while the jump button is held during upward movement.
		const gravity = player.wantsJump && player.vy < 0
			? JUMP_HOLD_GRAVITY
			: GRAVITY;

		player.vy += gravity * dt;

		const previousY = player.y;
		const nextY = player.y + player.vy * dt;

		this.checkItemBoxHit(player, previousY, nextY, false);

		const vRes = resolveMapVertical(
			player.x,
			player.y,
			nextY,
			player.width,
			player.height,
			player.vy,
			this.map
		);

		player.y = vRes.y;
		player.vy = vRes.vy;
		player.grounded = vRes.grounded;
		
		// Falling into the void: respawn after a delay, dropping 3 stars on the spot.
		if (player.y > this.map.pixelHeight + X_LIMIT_MARGIN) {
			this.spawnVoidStars(player.x, this.map.pixelHeight - TILE);
			player.aliveTimer = VOID_RESPAWN_TIME;
		}
	}

	/** Checks whether the player's head (jumping) or feet (ground pound) hit an item box. */
	private checkItemBoxHit(
		player: Player,
		previousY: number,
		nextY: number,
		fromGroundPound: boolean
	) {
		const playerHalfW = player.width / 2;
		const playerHalfH = player.height / 2;

		for (const box of this.itemBoxes) {
			if (box.used) continue;

			const boxLeft = box.col * TILE;
			const boxRight = boxLeft + TILE;
			const boxTop = box.row * TILE;
			const boxBottom = boxTop + TILE;

			// Horizontal overlap between the player's hitbox and the box.
			const playerLeft = player.x - playerHalfW;
			const playerRight = player.x + playerHalfW;

			if (playerRight <= boxLeft || playerLeft >= boxRight)
				continue;

			if (fromGroundPound) {
				// The player is moving downward.
				// Detect whether their feet crossed the top of the box.
				const previousBottom = previousY + playerHalfH;
				const nextBottom = nextY + playerHalfH;

				if (
					previousBottom <= boxTop &&
					nextBottom >= boxTop
				) {
					this.triggerItemBox(box, true);
					continue;
				}
			} else {
				// The player is moving upward.
				// Detect whether their head crossed the bottom of the box.
				const previousTop = previousY - playerHalfH;
				const nextTop = nextY - playerHalfH;

				if (
					previousTop >= boxBottom &&
					nextTop <= boxBottom
				) {
					this.triggerItemBox(box, false);
					player.vy = 0;
				}
			}
		}
	}

	private spawnVoidStars(x: number, groundY: number) {
		for (let i = 0; i < VOID_DROP_STAR_COUNT; i++) {
			const spreadX = x + this.rng.range(-TILE, TILE);
			this.stars.push(new StarPickup(spreadX, groundY, this.rng.range(-100, 100), STAR_POP_VELOCITY));
		}
	}

	// --- Player vs player interactions --------------------------------------------

	private handlePlayerVsPlayer() {
		for (let i = 0; i < this.players.length; i++) {
			const a = this.players[i];
			if (!a.isAlive()) continue;

			for (let j = 0; j < this.players.length; j++) {
				if (i === j) continue;

				const b = this.players[j];
				if (!b.isAlive()) continue;
				if (!collisions.RectRect(a.rect(), b.rect())) continue;

				const aBottom = a.y + a.height / 2;
				const bTop = b.y - b.height / 2;
				const landingOnTop = a.vy > 0 && aBottom - a.vy * (1 / 60) <= bTop + 10;

				if (a.isGroundPounding) {
					// Ground pound headshot: heavy star loss for the victim.
					b.loseStars(GROUND_POUND_HEAD_DAMAGE);
					a.isGroundPounding = false;
					a.vy = JUMP_VELOCITY / 2;
				} else if (landingOnTop) {
					// Regular stomp: the jumper bounces and gains a fresh jump, the
					// player underneath loses a single star.
					a.vy = STOMP_BOUNCE_VELOCITY;
					b.loseStars(STOMP_DAMAGE);
				} else if (a.isShellForm) {
					// Moving as a shell into another player costs them a star.
					b.loseStars(SHELL_TOUCH_DAMAGE);
				}
			}
		}
	}

	// --- Player vs items / stars ----------------------------------------------------

	private handlePlayerVsPickups() {
		for (const player of this.players) {
			if (!player.isAlive()) continue;

			this.items = this.items.filter(item => {
				if (!collisions.RectRect(
					player.rect(),
					{ x: item.x, y: item.y, w: ITEM_SIZE, h: ITEM_SIZE }
				)) {
					return true;
				}

				this.applyItem(player, item.type);
				return false; // consumed
			});

			this.stars = this.stars.filter(star => {
				if (!collisions.RectRect(
					player.rect(),
					{ x: star.x, y: star.y, w: STAR_SIZE, h: STAR_SIZE }
				)) {
					return true;
				}

				player.stars += 1;
				return false; // collected
			});
		}
	}

	/** Applies the effect of picking up a mushroom / fire flower / ice flower / blue shell. */
	private applyItem(player: Player, type: ItemType) {
		// Every item grows the player (bigger hitbox), in addition to its own effect.
		player.big = true;

		switch (type) {
			case ItemType.MUSHROOM:
				// Plain growth mushroom: no special power, just the size increase above.
				break;

			case ItemType.FIRE_FLOWER:
				player.power = PowerState.FIRE;
				break;

			case ItemType.ICE_FLOWER:
				player.power = PowerState.ICE;
				break;

			case ItemType.BLUE_SHELL:
				player.power = PowerState.BLUE_SHELL;
				break;
		}
	}

	// --- Player vs projectiles -------------------------------------------------------

	private handlePlayerVsProjectiles() {
		this.projectiles = this.projectiles.filter(proj => {
			for (const player of this.players) {
				if (!player.isAlive() || proj.owner === this.players.indexOf(player)) continue;

				if (!collisions.RectRect(
					player.rect(),
					{ x: proj.x, y: proj.y, w: PROJECTILE_SIZE, h: PROJECTILE_SIZE }
				)) {
					continue;
				}

				if (proj.kind === 'fire') {
					player.loseStars(FIREBALL_DAMAGE);
				} else {
					// Iceballs deal no star damage, they only freeze the victim.
					player.freezeTimer = FREEZE_TIME;
				}

				return false; // projectile consumed on hit
			}

			return true;
		});
	}

	// -------------------------------------------------------------------------------
	// Inputs
	// -------------------------------------------------------------------------------

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		if (!player.isAlive() || player.isFrozen()) return;

		switch (input.action) {
			case 'right':
				player.holdingRight = true;
				if (!player.isShellForm) player.direction = 1;
				break;

			case 'stopRight':
				player.holdingRight = false;
				break;

			case 'left':
				player.holdingLeft = true;
				if (!player.isShellForm) player.direction = -1;
				break;

			case 'stopLeft':
				player.holdingLeft = false;
				break;

			case 'run':
				player.holdingRun = true;
				break;

			case 'stopRun':
				player.holdingRun = false;
				break;

			case 'down':
				player.holdingDown = true;
				break;

			case 'stopDown':
				player.holdingDown = false;
				break;

			case 'jump':
				// Jumping stays available even while curled up as a shell.
				player.wantsJump = true;
				break;

			case 'stopJump':
				player.wantsJump = false;
				break;

			case 'throwItem':
				this.throwProjectile(playerIdx);
				break;
		}
	}

	/** Fires a fireball or iceball in front of the player, depending on their power-up. */
	private throwProjectile(playerIdx: number) {
		const player = this.players[playerIdx];
		if (!player.isAlive() || player.isFrozen()) return;

		if (player.power !== PowerState.FIRE && player.power !== PowerState.ICE) return;

		const kind: 'fire' | 'ice' =
			player.power === PowerState.FIRE ? 'fire' : 'ice';

		const speed = kind === 'fire'
			? FIREBALL_SPEED
			: ICEBALL_SPEED;

		const spawnX =
			player.x + player.direction * (player.width / 2 + PROJECTILE_SIZE);

		this.projectiles.push(new Projectile(
			spawnX,
			player.y,
			speed * player.direction,
			-200,
			kind,
			playerIdx
		));
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

		const inputs: Fields[] = [];

		function action(key: string) {
			inputs.push({ action: key, [key]: {} });
		}

		if (keyboard.first('right') || mobile?.first('right')) action('right');
		if (keyboard.killed('right') || mobile?.killed('right')) action('stopRight');

		if (keyboard.first('left') || mobile?.first('left')) action('left');
		if (keyboard.killed('left') || mobile?.killed('left')) action('stopLeft');

		if (keyboard.first('shift') || mobile?.first('run')) action('run');
		if (keyboard.killed('shift') || mobile?.killed('run')) action('stopRun');

		if (keyboard.first('down') || mobile?.first('down')) action('down');
		if (keyboard.killed('down') || mobile?.killed('down')) action('stopDown');

		if (keyboard.first('jump') || keyboard.first('up') || mobile?.first('jump')) action('jump');
		if (keyboard.killed('jump') || keyboard.killed('up') || mobile?.killed('jump')) action('stopJump');

		if (keyboard.first('e') || mobile?.first('throw')) action('throwItem');

		return inputs;
	}

	// -------------------------------------------------------------------------------
	// Rendering
	// -------------------------------------------------------------------------------

	private drawMap(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		for (let r = 0; r < this.map.rows; r++) {
			for (let c = 0; c < this.map.cols; c++) {
				const t = this.map.tiles[r][c];
				if (t === TileType.EMPTY) continue;

				let tex: any;

				if (t === TileType.GROUND) {
					tex = imageLoader.get('ground');
				} else if (t === TileType.BRICK) {
					tex = imageLoader.get('brick');
				} else if (t === TileType.ITEM_BOX) {
					const box = this.itemBoxes.find(b => b.col === c && b.row === r);
					tex = imageLoader.get(box?.used ? 'item-box-used' : 'item-box');
				}

				if (tex) {
					ctx.drawImage(tex, c * TILE, r * TILE, TILE, TILE);
				}
			}
		}
	}

	private drawEntities(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		for (const item of this.items) {
			const key = [
				'mushroom',
				'fire-flower',
				'ice-flower',
				'blue-shell-item'
			][item.type];

			const tex = imageLoader.get(key);

			ctx.drawImage(
				tex,
				item.x - ITEM_SIZE / 2,
				item.y - ITEM_SIZE / 2,
				ITEM_SIZE,
				ITEM_SIZE
			);
		}

		for (const star of this.stars) {
			const tex = imageLoader.get('star');

			ctx.drawImage(
				tex,
				star.x - STAR_SIZE / 2,
				star.y - STAR_SIZE / 2,
				STAR_SIZE,
				STAR_SIZE
			);
		}

		for (const proj of this.projectiles) {
			const tex = imageLoader.get(
				proj.kind === 'fire' ? 'fireball' : 'iceball'
			);

			ctx.drawImage(
				tex,
				proj.x - PROJECTILE_SIZE / 2,
				proj.y - PROJECTILE_SIZE / 2,
				PROJECTILE_SIZE,
				PROJECTILE_SIZE
			);
		}
	}

	private drawPlayers(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		for (const player of this.players) {
			if (!player.isAlive()) continue;

			const w = player.width;
			const h = player.height;

			ctx.save();
			ctx.translate(player.x, player.y);

			if (player.direction < 0) {
				ctx.scale(-1, 1);
			}

			let textureKey: string;

			if (player.isShellForm) {
				textureKey = 'player-shell-form';
			} else {
				const size = player.big ? 'big' : 'small';
				const walking = Math.abs(player.vx) > 1;
				const animation = walking ? 'walking' : 'idle';

				textureKey = `player-${size}-${animation}`;
			}

			const tex = imageLoader.get(textureKey);

			if (player.isFrozen()) {
				ctx.globalAlpha = 0.6;
			}

			ctx.drawImage(
				tex,
				-w / 2,
				-h / 2,
				w,
				h
			);

			ctx.restore();
			ctx.globalAlpha = 1;
		}
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = false;

		const imageLoader = _imageLoader.getFolder('stars');
		const data = _data as ClientData;

		if (data.firstFrame) {
			data.firstFrame = false;
		}

		data.update(this, playerIdx);

		ctx.fillStyle = "#5c94fc";
		ctx.fillRect(
			0,
			0,
			Camera.WIDTH,
			Camera.HEIGHT
		);

		const cameraCoords = data.camera.getCoords();

		ctx.save();

		// Center the camera viewport on the followed world position.
		ctx.translate(
			Camera.WIDTH / 2 - cameraCoords.x,
			Camera.HEIGHT / 2 - cameraCoords.y
		);

		this.drawMap(ctx, imageLoader);
		this.drawEntities(ctx, imageLoader);
		this.drawPlayers(ctx, imageLoader);

		ctx.restore();
	}

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	// -------------------------------------------------------------------------------
	// Save / load — everything that can affect future outcomes (including the RNG
	// seed and pre-rolled "hidden" values) must round-trip here.
	// -------------------------------------------------------------------------------

	override save(): Uint8Array {
		const { State } = protocols.get();

		const object: Fields = {
			seed: this.rng.seed,

			players: this.players,

			stars: this.stars.map(s => ({
				x: s.x,
				y: s.y,
				vx: s.vx,
				vy: s.vy
			})),

			items: this.items.map(i => ({
				x: i.x,
				y: i.y,
				vx: i.vx,
				vy: i.vy,
				type: i.type,
				direction: i.direction
			})),

			projectiles: this.projectiles.map(p => ({
				x: p.x,
				y: p.y,
				vx: p.vx,
				vy: p.vy,
				kind: p.kind === 'ice' ? 1 : 0,
				owner: p.owner
			})),

			itemBoxes: this.itemBoxes.map(b => ({
				used: b.used,
				cooldown: b.cooldown,
				pendingItem: b.pendingItem
			})),

			nextStarX: this.nextStarX,
			nextStarY: this.nextStarY,
			starSpawnTimer: this.starSpawnTimer
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = decodeFullMessage(State.decode(data));

		this.rng = new RNG(obj.seed);

		obj.players.forEach((p: Fields, idx: number) => {
			this.players[idx].load(p);
		});

		this.stars = obj.stars.map((s: Fields) => {
			const star = new StarPickup(0, 0, 0, 0);
			star.load(s);
			return star;
		});

		this.items = obj.items.map((i: Fields) => {
			const item = new ItemDrop(
				0,
				0,
				ItemType.MUSHROOM,
				1
			);

			item.load(i);
			return item;
		});

		this.projectiles = obj.projectiles.map((p: Fields) => {
			const proj = new Projectile(
				0,
				0,
				0,
				0,
				'fire',
				0
			);

			proj.load(p);
			return proj;
		});

		obj.itemBoxes.forEach((b: Fields, idx: number) => {
			this.itemBoxes[idx]?.load(b);
		});

		this.nextStarX = obj.nextStarX;
		this.nextStarY = obj.nextStarY;
		this.starSpawnTimer = obj.starSpawnTimer;
	}

	override getSize() {
		// The game viewport is fixed and independent from the map dimensions.
		return {
			width: Camera.WIDTH,
			height: Camera.HEIGHT
		};
	}

	override evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;
		const cameraCoords = clientData.camera.getCoords();

		// Convert viewport coordinates into world coordinates.
		const ret = {
			x: x + cameraCoords.x - Camera.WIDTH / 2,
			y: y + cameraCoords.y - Camera.HEIGHT / 2
		};

		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;

		return ret;
	}

	override getMobileDesc(): MobileDescriptor {
		return {
			joysticks: {},
			buttons: {
				left: {
					x: 10,
					xp: 'left',
					y: 10,
					yp: 'bottom',
					size: 70,
					color: '#ffffff88'
				},
				right: {
					x: 90,
					xp: 'left',
					y: 10,
					yp: 'bottom',
					size: 70,
					color: '#ffffff88'
				},
				jump: {
					x: 10,
					xp: 'right',
					y: 10,
					yp: 'bottom',
					size: 80,
					color: '#ffcc00aa'
				},
				run: {
					x: 100,
					xp: 'right',
					y: 10,
					yp: 'bottom',
					size: 60,
					color: '#ff5555aa'
				},
				down: {
					x: 50,
					xp: 'left',
					y: 100,
					yp: 'bottom',
					size: 60,
					color: '#88aaffaa'
				},
				throw: {
					x: 190,
					xp: 'right',
					y: 10,
					yp: 'bottom',
					size: 60,
					color: '#66ff66aa'
				}
			}
		};
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	// -------------------------------------------------------------------------------
	// Finish game: free-for-all ranking, each player forms their own "team of 1",
	// sorted by descending star count.
	// -------------------------------------------------------------------------------

	private produceFinish(): FinishGame {
		const order = this.players
			.map((p, idx) => ({ idx, stars: p.stars }))
			.sort((a, b) => b.stars - a.stars);

		const results: number[][] = order.map(entry => [entry.idx]);

		// Detect ties between consecutive teams (same star count) for the ranking display.
		const teamEqualities: number[] = [];

		for (let i = 0; i < order.length - 1; i++) {
			if (order[i].stars === order[i + 1].stars) {
				teamEqualities.push(i);
			}
		}

		return {
			results,
			teamEqualities,
			playerEqualities: [] // no meaning within a team of 1
		};
	}
}
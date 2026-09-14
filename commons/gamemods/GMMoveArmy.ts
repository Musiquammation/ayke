import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

const protocols = getProtocol('moveArmy', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

// =============================================================================
// CONSTANTS
// All game-balance numbers live here so the whole mode can be tuned in one place.
// =============================================================================

// --- Arena geometry (portrait rectangle) --------------------------------------
// Red team occupies the negative-Y half, Blue team the positive-Y half.
const ARENA_WIDTH = 900;
const ARENA_HEIGHT = 1600;
const ARENA_HALF_W = ARENA_WIDTH / 2;
const ARENA_HALF_H = ARENA_HEIGHT / 2;

// The arena is split into 5 horizontal bands. The two outer bands (one per team)
// are "slow zones": troops standing there are slowed down and simply walk
// forward instead of following their neighboor graph.
const NORMAL_ZONE_HALF_HEIGHT = 550; // |y| < this => normal (fast) zone
const SLOW_ZONE_SPEED_MULT = 0.5; // multiplier applied to troop speed while in a slow zone

// Troops spawn at the very edge of their own slow zone.
const SPAWN_Y = ARENA_HALF_H - 20;

// --- Mana / auto-spawn system ---------------------------------------------------
// Each team keeps one hidden "mana gauge" per troop type. The gauge grows over
// time, and jumps up whenever a troop of that type dies. Once it crosses 1.0,
// one unit is consumed and a fresh troop of that type is spawned for the team.
const MANA_REGEN_PER_SECOND = 0.3; // passive gauge growth, per second
const DEATH_MANA_GAIN = 0.7; // gauge bonus granted when a troop of that type dies

// --- Neighboor / targeting system ------------------------------------------------
// If a troop has had no movement target for longer than this, it auto-links to
// the closest friendly troop (never re-picking the ally it just lost).
const TARGET_LOST_TIMEOUT = 1; // seconds

// Radius (world units) used for hit-testing clicks/taps against troops & towers.
const HIT_RADIUS = 34;

// --- Timer ------------------------------------------------------------------
const MAIN_DURATION = 180; // 3 minutes of normal play
const SUDDEN_DEATH_DURATION = 60; // +1 minute sudden death if still tied

// --- Towers -------------------------------------------------------------------
const TOWER_HP = 1000;
const TOWER_RANGE = 260;
const TOWER_DAMAGE = 40;
const TOWER_ATTACK_INTERVAL = 0.35; // fast firing turret

// x positions of the 3 towers of each team (symmetrical, same for both teams)
const TOWER_XS = [-300, 0, 300];
// y position of the towers, deep in each team's own slow zone (their "base")
const TOWER_RED_Y = -(ARENA_HALF_H - 150);
const TOWER_BLUE_Y = (ARENA_HALF_H - 150);

// --- Troop types ----------------------------------------------------------------
// Ordered list of every troop type identifier, used both as array index and as
// the integer written into the protobuf `type` field.
const TYPE_LIST = ['soldier', 'archer', 'tank', 'bomber', 'car'] as const;
type TroopTypeName = typeof TYPE_LIST[number];

interface TroopStats {
	hp: number;
	dmg: number;
	range: number; // attack range
	atkInterval: number; // seconds between attacks
	speed: number; // world units / second, in the normal zone
	spawnMana: number; // mana threshold cost to auto-spawn one unit of this type
	laneX: number; // fixed X coordinate for this troop type (same for both teams)
	splashRadius?: number; // only used by TBomber, for area damage
}

// Each troop type has a fixed lane (x position), independent of team.
const STATS: Record<TroopTypeName, TroopStats> = {
	soldier: { hp: 100, dmg: 15, range: 55, atkInterval: 0.8, speed: 60, spawnMana: 12, laneX: -360 },
	archer: { hp: 60, dmg: 10, range: 220, atkInterval: 1.0, speed: 55, spawnMana: 7, laneX: -160 },
	tank: { hp: 400, dmg: 8, range: 60, atkInterval: 1.0, speed: 30, spawnMana: 3, laneX: 0 },
	bomber: { hp: 80, dmg: 20, range: 190, atkInterval: 1.5, speed: 45, spawnMana: 4, laneX: 160, splashRadius: 70 },
	car: { hp: 70, dmg: 9, range: 200, atkInterval: 0.9, speed: 140, spawnMana: 3, laneX: 360 },
};

// =============================================================================
// SHARED GEOMETRY HELPERS
// =============================================================================

/**
 * Returns true when the given Y coordinate is inside one of the two slow zones
 * (top for red, bottom for blue). Symmetrical around the center of the arena.
 */
function isInSlowZone(y: number) {
	return Math.abs(y) > NORMAL_ZONE_HALF_HEIGHT;
}

/**
 * Classic segment-segment intersection test (used for the "cut the links" mouse
 * gesture). Returns true if segment (p1,p2) crosses segment (p3,p4).
 */
function segmentsIntersect(
	x1: number, y1: number, x2: number, y2: number,
	x3: number, y3: number, x4: number, y4: number
) {
	const d1x = x2 - x1, d1y = y2 - y1;
	const d2x = x4 - x3, d2y = y4 - y3;

	const denom = d1x * d2y - d1y * d2x;
	if (denom === 0) return false; // parallel (or degenerate) segments never cross

	const t = ((x3 - x1) * d2y - (y3 - y1) * d2x) / denom;
	const u = ((x3 - x1) * d1y - (y3 - y1) * d1x) / denom;

	return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// A common shape shared by Troop and Tower so combat code can treat them alike.
interface Attackable {
	x: number;
	y: number;
	hp: number;
	isRed: boolean;
}

type NeighboorKind = 'none' | 'point' | 'troop' | 'tower';

// =============================================================================
// TROOP (abstract base) + 5 concrete troop types
// =============================================================================

/**
 * Abstract base class for every unit that walks around the battlefield.
 * Handles the generic "find something in range and attack it, otherwise move
 * toward the neighboor target" state machine. Concrete subclasses only need to
 * describe their stats and how their attack applies damage (single target vs
 * splash), plus whether they can keep moving while attacking (TCar only).
 */
abstract class Troop implements Attackable {
	hp: number;

	// Combat state
	attacking = false;
	attackCooldown = 0;

	// "Neighboor" graph state: what this troop is currently trying to reach.
	neighboorKind: NeighboorKind = 'none';
	neighboorId = -1; // used when neighboorKind is 'troop' or 'tower'
	neighboorX = 0; // used when neighboorKind is 'point'
	neighboorY = 0;

	// How long we've had no valid target, and who we should avoid re-linking to.
	noTargetTimer = 0;
	lastNeighboorId = -1;

	constructor(
		public readonly id: number,
		public readonly isRed: boolean,
		public x: number,
		public y: number
	) {
		this.hp = this.stats().hp;
	}

	/** Static stats table entry for this concrete troop type. */
	abstract stats(): TroopStats;

	/** Index into TYPE_LIST, used for protobuf serialization. */
	abstract get typeIndex(): number;

	/** Only TCar can keep moving while it is mid-attack. */
	abstract get canMoveWhileAttacking(): boolean;

	/** Applies this troop's damage to `target` (single hit or area splash). */
	abstract applyAttackEffect(game: GMMoveArmy, target: Attackable): void;

	/**
	 * Per-frame update: first resolve combat (attack anything in range), then
	 * resolve movement (following the neighboor graph, or just walking forward
	 * while inside a slow zone).
	 */
	update(dt: number, game: GMMoveArmy) {
		this.updateCombat(dt, game);

		// All troops except TCar freeze completely while they are attacking.
		if (this.attacking && !this.canMoveWhileAttacking) {
			return;
		}

		this.updateMovement(dt, game);
	}

	/** Looks for the nearest enemy (troop or tower) within attack range and fights it. */
	private updateCombat(dt: number, game: GMMoveArmy) {
		const enemy = game.findNearestAttackable(this.x, this.y, this.stats().range, !this.isRed);

		if (!enemy) {
			this.attacking = false;
			return;
		}

		this.attacking = true;
		this.attackCooldown -= dt;
		if (this.attackCooldown <= 0) {
			this.attackCooldown = this.stats().atkInterval;
			this.applyAttackEffect(game, enemy);
		}
	}

	/** Moves the troop toward its slow-zone forward direction or its neighboor target. */
	private updateMovement(dt: number, game: GMMoveArmy) {
		const inSlow = isInSlowZone(this.y);
		const speedMult = inSlow ? SLOW_ZONE_SPEED_MULT : 1;

		if (inSlow) {
			// Inside a slow zone we ignore the neighboor graph entirely and simply
			// march forward toward the middle of the arena. The neighboor link
			// itself is preserved (not cleared) so the graph keeps being formed
			// and will be used as soon as the troop reaches the normal zone.
			const forwardDir = this.isRed ? 1 : -1;
			this.y += forwardDir * this.stats().speed * speedMult * dt;
			this.clampToArena();
			return;
		}

		const targetPos = game.resolveNeighboorTarget(this);
		if (!targetPos) {
			// No valid target right now: count how long we've been "lost".
			this.noTargetTimer += dt;
			if (this.noTargetTimer > TARGET_LOST_TIMEOUT) {
				game.linkToNearestAlly(this);
			}
			return;
		}

		this.noTargetTimer = 0;

		const dx = targetPos.x - this.x;
		const dy = targetPos.y - this.y;
		const dist = Math.sqrt(norm2(dx, dy)) || 1;
		const step = this.stats().speed * speedMult * dt;

		if (step >= dist) {
			this.x = targetPos.x;
			this.y = targetPos.y;
		} else {
			this.x += (dx / dist) * step;
			this.y += (dy / dist) * step;
		}

		this.clampToArena();
	}

	/** Keeps the troop inside the physical arena bounds. */
	private clampToArena() {
		this.x = Math.max(-ARENA_HALF_W, Math.min(ARENA_HALF_W, this.x));
		this.y = Math.max(-ARENA_HALF_H, Math.min(ARENA_HALF_H, this.y));
	}
}

/** TSoldier: short range melee unit dealing damage to whatever is close to it. */
class TSoldier extends Troop {
	override stats() { return STATS.soldier; }
	get typeIndex() { return 0; }
	get canMoveWhileAttacking() { return false; }

	applyAttackEffect(_game: GMMoveArmy, target: Attackable) {
		target.hp -= this.stats().dmg;
	}
}

/** TArcher: mid/long range single-target archer, shoots arrows at a distance. */
class TArcher extends Troop {
	override stats() { return STATS.archer; }
	get typeIndex() { return 1; }
	get canMoveWhileAttacking() { return false; }

	applyAttackEffect(_game: GMMoveArmy, target: Attackable) {
		target.hp -= this.stats().dmg;
	}
}

/** TTank: tons of HP, weak damage, absorbs hits at the front line. */
class TTank extends Troop {
	override stats() { return STATS.tank; }
	get typeIndex() { return 2; }
	get canMoveWhileAttacking() { return false; }

	applyAttackEffect(_game: GMMoveArmy, target: Attackable) {
		target.hp -= this.stats().dmg;
	}
}

/** TBomber: lobs bombs that explode in an area, damaging every nearby enemy. */
class TBomber extends Troop {
	override stats() { return STATS.bomber; }
	get typeIndex() { return 3; }
	get canMoveWhileAttacking() { return false; }

	applyAttackEffect(game: GMMoveArmy, target: Attackable) {
		// The bomb explodes centered on the primary target's position and hits
		// every enemy (troop or tower) standing within the splash radius.
		const radius = this.stats().splashRadius ?? 0;
		const radiusSq = radius * radius;

		for (const other of game.getAllAttackables(!this.isRed)) {
			if (norm2(other.x - target.x, other.y - target.y) <= radiusSq) {
				other.hp -= this.stats().dmg;
			}
		}
	}
}

/** TCar: fast-moving skirmisher that fires arrows like TArcher but never stops moving. */
class TCar extends Troop {
	override stats() { return STATS.car; }
	get typeIndex() { return 4; }
	get canMoveWhileAttacking() { return true; }

	applyAttackEffect(_game: GMMoveArmy, target: Attackable) {
		target.hp -= this.stats().dmg;
	}
}

const TYPE_CLASSES: Record<TroopTypeName, new (id: number, isRed: boolean, x: number, y: number) => Troop> = {
	soldier: TSoldier,
	archer: TArcher,
	tank: TTank,
	bomber: TBomber,
	car: TCar,
};

// =============================================================================
// TOWER
// =============================================================================

/**
 * A defensive turret. Towers never move and never chase troops that go out of
 * range; they simply shoot fast, high-damage arrows at the nearest enemy troop
 * that dares to enter their radius. Destroying all 3 enemy towers wins the game.
 */
class Tower implements Attackable {
	hp = TOWER_HP;
	attackCooldown = 0;

	constructor(
		public readonly id: number,
		public readonly isRed: boolean,
		public readonly x: number,
		public readonly y: number
	) {}

	/** Fires at the closest living enemy troop within range, on a fast cooldown. */
	update(dt: number, game: GMMoveArmy) {
		if (this.hp <= 0) return; // destroyed towers stay silent

		const enemy = game.findNearestEnemyTroop(this.x, this.y, TOWER_RANGE, !this.isRed);
		if (!enemy) return;

		this.attackCooldown -= dt;
		if (this.attackCooldown <= 0) {
			this.attackCooldown = TOWER_ATTACK_INTERVAL;
			enemy.hp -= TOWER_DAMAGE;
		}
	}
}

// =============================================================================
// PLAYER
// This game mode has no per-player avatar on the field: players only observe
// the battle and issue "cut link" / "change neighboor" orders for their team.
// =============================================================================

class Player {
	connected = true;
	isRed = true;

	load(obj: Fields) {
		this.connected = obj.connected;
		this.isRed = obj.isRed;
	}
}

// =============================================================================
// CLIENT-ONLY DATA (never serialized into the shared game state)
// =============================================================================

class ClientData {
	firstFrame = true;
	mouseX = 0;
	mouseY = 0;

	// Index of the local player, captured once at createClient() time so
	// collectInputs() can know which team ("red"/"blue") belongs to us.
	localPlayerIdx = 0;

	// Drag-gesture state for the "cut links" / "create link" mouse interaction.
	dragMode: 'cut' | 'link' | null = null;
	dragStartX = 0;
	dragStartY = 0;
	dragCurrentX = 0;
	dragCurrentY = 0;
	draggedTroopId = -1;

	readonly html: HTMLDivElement;
	readonly time: HTMLDivElement;

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-moveArmy-root");

		this.time = document.createElement("div");
		this.time.classList.add("game-moveArmy-time");

		this.html.appendChild(this.time);
	}

	static showTime(time: number) {
		const minutes = Math.floor(time / 60);
		const seconds = Math.floor(time % 60);
		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	}

	update(game: GMMoveArmy) {
		this.time.innerText =
			(game.suddenDeath ? "SUDDEN DEATH " : "") + ClientData.showTime(game.time);
	}
}

class TutorialData {
	private step = 0;

	constructor(private readonly game: GMMoveArmy) {}

	frame(_dt: number, _clock: number) {
		if (this.step === 0) {
			return "Drag from a troop to redirect it. Draw a line across arrows to cut them.";
		}
		return "";
	}
}

// =============================================================================
// CLIENT START-DATA FORM (example.html "x-data")
// =============================================================================

function generateClientDom() {
	return {
		preferTeam: 0,

		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({
				preferTeam: this.preferTeam,
			}).finish();
		},
	};
}

// =============================================================================
// GAME MODE
// =============================================================================

export class GMMoveArmy extends GameMode {
	static readonly types = { Player, Troop, Tower };

	static readonly DATA = {
		ARENA_WIDTH,
		ARENA_HEIGHT,
		NORMAL_ZONE_HALF_HEIGHT,
		TOWER_XS,
		TOWER_RED_Y,
		TOWER_BLUE_Y,
		STATS,
	};

	readonly players: Player[];

	// Live troops, keyed by their unique id for O(1) lookup.
	readonly troops = new Map<number, Troop>();
	readonly towers: Tower[] = [];

	nextTroopId = 0;

	time = MAIN_DURATION;
	suddenDeath = false;

	// Hidden per-team, per-type mana gauges (never sent to the client HUD).
	redMana: Record<TroopTypeName, number> = { soldier: 0, archer: 0, tank: 0, bomber: 0, car: 0 };
	blueMana: Record<TroopTypeName, number> = { soldier: 0, archer: 0, tank: 0, bomber: 0, car: 0 };

	private constructor(total: number) {
		super();
		this.players = Array.from({ length: total }, () => new Player());
	}

	// -------------------------------------------------------------------------
	// SETUP
	// -------------------------------------------------------------------------

	static async createServ(
		players: PlayerInput[],
		total: number,
		_hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();
		const game = new GMMoveArmy(total);

		function decode(i: number) {
			if (i < players.length) return decodeFullMessage(StartData.decode(players[i].data));
			return { preferTeam: 0 };
		}

		const prefs = game.players.map((_, i) => decode(i).preferTeam ?? 0);

		// Balance the 4 players into two teams of 2, honoring preferences first.
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
			if (putRed && redCount < maxPerTeam) { assignedRed[i] = true; redCount++; }
			else { assignedRed[i] = false; blueCount++; }
		}

		for (const [i, p] of game.players.entries()) {
			p.isRed = assignedRed[i];
		}

		game.setupTowers();

		const data = StartDataClient.encode({
			players: game.players.map((p) => ({ isRed: p.isRed })),
		}).finish();

		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		playerIdx: number
	) {
		const game = new GMMoveArmy(total);
		const { StartData, StartDataClient } = protocols.get();
		const clientData = new ClientData();
		clientData.localPlayerIdx = playerIdx;

		if (origin === 'server') {
			const { players } = decodeFullMessage(StartDataClient.decode(data));
			for (const [idx, p] of players.entries()) {
				game.players[idx].isRed = p.isRed;
			}
		} else { // origin === 'client', local preview / bot match
			decodeFullMessage(StartData.decode(data));
			for (const [idx, p] of game.players.entries()) {
				p.isRed = idx % 2 === 0;
			}
		}

		game.setupTowers();

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: {},
		};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly SKINS = { 'default': "Default" };
	static readonly SKINS_IDS = Object.keys(GMMoveArmy.SKINS);

	static readonly TEXTURES = {
		'arrow': "/assets/games/moveArmy/arrow.png",
		'tower-red': "/assets/games/moveArmy/tower_red.png",
		'tower-blue': "/assets/games/moveArmy/tower_blue.png",
		'troop-soldier': "/assets/games/moveArmy/troop_soldier.png",
		'troop-archer': "/assets/games/moveArmy/troop_archer.png",
		'troop-tank': "/assets/games/moveArmy/troop_tank.png",
		'troop-bomber': "/assets/games/moveArmy/troop_bomber.png",
		'troop-car': "/assets/games/moveArmy/troop_car.png",
	};

	/** Places the 3 towers of each team at their fixed, symmetrical positions. */
	private setupTowers() {
		let id = 0;
		for (const x of TOWER_XS) {
			this.towers.push(new Tower(id++, true, x, TOWER_RED_Y));
		}
		for (const x of TOWER_XS) {
			this.towers.push(new Tower(id++, false, x, TOWER_BLUE_Y));
		}
	}

	override init(): void {
		// Nothing extra: towers are already set up in setupTowers(), troops
		// start appearing automatically once the mana gauges fill up.
	}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	// -------------------------------------------------------------------------
	// MAIN SIMULATION LOOP
	// -------------------------------------------------------------------------

	override run(dt: number, produceFinish: boolean): FinishGame | null {
		this.time -= dt;

		this.updateManaAndAutoSpawn(dt);

		for (const troop of this.troops.values()) {
			troop.update(dt, this);
		}
		for (const tower of this.towers) {
			tower.update(dt, this);
		}

		this.removeDeadTroops();

		const redTowersAlive = this.towers.some(t => t.isRed && t.hp > 0);
		const blueTowersAlive = this.towers.some(t => !t.isRed && t.hp > 0);

		let finished = !redTowersAlive || !blueTowersAlive;

		if (this.time <= 0) {
			if (!this.suddenDeath) {
				// Main time is over but nobody has been fully defeated: enter
				// a sudden-death overtime instead of ending the match right away.
				this.suddenDeath = true;
				this.time = SUDDEN_DEATH_DURATION;
			} else {
				finished = true;
				this.time = 0;
			}
		}

		if (produceFinish && finished) {
			return this.produceFinish();
		}

		return null;
	}

	/** Grows each team's per-type mana gauge and auto-spawns troops when it overflows. */
	private updateManaAndAutoSpawn(dt: number) {
		for (const isRed of [true, false]) {
			const gauges = isRed ? this.redMana : this.blueMana;
			for (const type of TYPE_LIST) {
				gauges[type] += MANA_REGEN_PER_SECOND * dt;
				if (gauges[type] >= 1) {
					gauges[type] -= 1;
					this.spawnTroop(type, isRed);
				}
			}
		}
	}

	/** Creates a brand new troop of the given type, at its fixed lane, in its team's spawn row. */
	private spawnTroop(type: TroopTypeName, isRed: boolean) {
		const stats = STATS[type];
		const x = stats.laneX;
		const y = isRed ? -SPAWN_Y : SPAWN_Y;

		const Ctor = TYPE_CLASSES[type];
		const troop = new Ctor(this.nextTroopId++, isRed, x, y);
		this.troops.set(troop.id, troop);
	}

	/** Removes troops with 0 or less HP, crediting their team's mana gauge for that type. */
	private removeDeadTroops() {
		for (const [id, troop] of this.troops) {
			if (troop.hp > 0) continue;

			const gauges = troop.isRed ? this.redMana : this.blueMana;
			const type = TYPE_LIST[troop.typeIndex];
			gauges[type] += DEATH_MANA_GAIN;

			this.troops.delete(id);
			// Any troop that was following this one will notice it's gone on its
			// next update (resolveNeighboorTarget lazily detects missing targets).
		}
	}

	// -------------------------------------------------------------------------
	// TARGETING / NEIGHBOOR GRAPH HELPERS (used by Troop and by input handling)
	// -------------------------------------------------------------------------

	/** Finds the nearest living troop or tower of the given team within `range`. */
	findNearestAttackable(x: number, y: number, range: number, isRed: boolean): Attackable | null {
		let best: Attackable | null = null;
		let bestDistSq = range * range;

		for (const troop of this.troops.values()) {
			if (troop.isRed !== isRed) continue;
			const d = norm2(troop.x - x, troop.y - y);
			if (d <= bestDistSq) { best = troop; bestDistSq = d; }
		}
		for (const tower of this.towers) {
			if (tower.isRed !== isRed || tower.hp <= 0) continue;
			const d = norm2(tower.x - x, tower.y - y);
			if (d <= bestDistSq) { best = tower; bestDistSq = d; }
		}

		return best;
	}

	/** Same as above, but towers only ever target troops (never enemy towers). */
	findNearestEnemyTroop(x: number, y: number, range: number, isRed: boolean): Troop | null {
		let best: Troop | null = null;
		let bestDistSq = range * range;

		for (const troop of this.troops.values()) {
			if (troop.isRed !== isRed) continue;
			const d = norm2(troop.x - x, troop.y - y);
			if (d <= bestDistSq) { best = troop; bestDistSq = d; }
		}

		return best;
	}

	/** Every attackable unit (troops + living towers) belonging to one team. Used for splash damage. */
	getAllAttackables(isRed: boolean): Attackable[] {
		const list: Attackable[] = [];
		for (const troop of this.troops.values()) {
			if (troop.isRed === isRed) list.push(troop);
		}
		for (const tower of this.towers) {
			if (tower.isRed === isRed && tower.hp > 0) list.push(tower);
		}
		return list;
	}

	/**
	 * Resolves the world position a troop's current neighboor target points to.
	 * Has the side effect of clearing the neighboor (falling back to 'none')
	 * when the target has become invalid (dead/destroyed), or when the target
	 * is a friendly troop that just started attacking (per the design rule:
	 * "if our target is a friendly troop and it starts attacking, we stop
	 * following it instead").
	 */
	resolveNeighboorTarget(troop: Troop): { x: number; y: number } | null {
		switch (troop.neighboorKind) {
			case 'none':
				return null;

			case 'point':
				return { x: troop.neighboorX, y: troop.neighboorY };

			case 'troop': {
				const target = this.troops.get(troop.neighboorId);
				if (!target) {
					this.clearNeighboor(troop);
					return null;
				}
				if (target.isRed === troop.isRed && target.attacking) {
					// Our guide ally stopped to fight: detach so we can react on our own.
					this.clearNeighboor(troop);
					return null;
				}
				return { x: target.x, y: target.y };
			}

			case 'tower': {
				const tower = this.towers.find(t => t.id === troop.neighboorId && t.isRed === troop.isRed === false || t.id === troop.neighboorId);
				if (!tower || tower.hp <= 0) {
					this.clearNeighboor(troop);
					return null;
				}
				return { x: tower.x, y: tower.y };
			}
		}
	}

	/** Clears a troop's neighboor link, remembering it so we don't immediately re-pick it. */
	private clearNeighboor(troop: Troop) {
		troop.lastNeighboorId = troop.neighboorKind === 'troop' ? troop.neighboorId : -1;
		troop.neighboorKind = 'none';
		troop.neighboorId = -1;
		troop.noTargetTimer = 0;
	}

	/** Links a lost troop to its nearest living ally, excluding the one it just lost. */
	linkToNearestAlly(troop: Troop) {
		let best: Troop | null = null;
		let bestDistSq = Infinity;

		for (const other of this.troops.values()) {
			if (other === troop) continue;
			if (other.isRed !== troop.isRed) continue;
			if (other.id === troop.lastNeighboorId) continue;

			const d = norm2(other.x - troop.x, other.y - troop.y);
			if (d < bestDistSq) { best = other; bestDistSq = d; }
		}

		if (best) {
			troop.neighboorKind = 'troop';
			troop.neighboorId = best.id;
			troop.noTargetTimer = 0;
		}
	}

	/**
	 * Cuts every displayed neighboor arrow that crosses the (startX,startY)-(endX,endY)
	 * segment drawn by the player. Works on both teams' links (no ownership check
	 * here — only creating/editing a link is restricted to your own team).
	 */
	cutLinks(startX: number, startY: number, endX: number, endY: number) {
		for (const troop of this.troops.values()) {
			if (troop.neighboorKind === 'none') continue;

			const pos = this.resolveNeighboorTarget(troop);
			if (!pos) continue; // link auto-cleared while resolving (e.g. dead target)

			if (segmentsIntersect(troop.x, troop.y, pos.x, pos.y, startX, startY, endX, endY)) {
				this.clearNeighboor(troop);
			}
		}
	}

	/** Finds a troop of a given team (or any team if omitted) near a world point. Used for hit-testing clicks. */
	findTroopNear(x: number, y: number, radius: number, isRed?: boolean): Troop | null {
		const radiusSq = radius * radius;
		let best: Troop | null = null;
		let bestDistSq = radiusSq;

		for (const troop of this.troops.values()) {
			if (isRed !== undefined && troop.isRed !== isRed) continue;
			const d = norm2(troop.x - x, troop.y - y);
			if (d <= bestDistSq) { best = troop; bestDistSq = d; }
		}
		return best;
	}

	/** Finds a tower near a world point. Used for hit-testing clicks. */
	findTowerNear(x: number, y: number, radius: number): Tower | null {
		const radiusSq = radius * radius;
		let best: Tower | null = null;
		let bestDistSq = radiusSq;

		for (const tower of this.towers) {
			const d = norm2(tower.x - x, tower.y - y);
			if (d <= bestDistSq) { best = tower; bestDistSq = d; }
		}
		return best;
	}

	// -------------------------------------------------------------------------
	// INPUT
	// -------------------------------------------------------------------------

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];

		switch (input.action) {
			case 'cutLine': {
				const { startX, startY, endX, endY } = input.cutLine;
				this.cutLinks(startX, startY, endX, endY);
				break;
			}

			case 'changeNeighboor': {
				const { troopId, targetKind, targetId, targetX, targetY } = input.changeNeighboor;
				const troop = this.troops.get(troopId);

				// A player may only redirect troops belonging to their own team.
				if (!troop || troop.isRed !== player.isRed) break;

				switch (targetKind) {
					case 0: // dropped back onto itself => cancel the link entirely
						this.clearNeighboor(troop);
						break;
					case 1: // dropped on empty ground => point target
						troop.neighboorKind = 'point';
						troop.neighboorX = targetX;
						troop.neighboorY = targetY;
						troop.noTargetTimer = 0;
						break;
					case 2: // dropped on a troop => follow that troop
						troop.neighboorKind = 'troop';
						troop.neighboorId = targetId;
						troop.noTargetTimer = 0;
						break;
					case 3: // dropped on a tower => march toward that tower
						troop.neighboorKind = 'tower';
						troop.neighboorId = targetId;
						troop.noTargetTimer = 0;
						break;
				}
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

		const localTeamRed = this.players[data.localPlayerIdx]?.isRed ?? true;

		// --- Drag start: decide between "cut" mode and "link" mode ------------
		if (mouse.first(0)) {
			const start = mouse.getCoords();
			data.dragStartX = start.x;
			data.dragStartY = start.y;
			data.dragCurrentX = start.x;
			data.dragCurrentY = start.y;

			const touchedTroop = this.findTroopNear(start.x, start.y, HIT_RADIUS, localTeamRed);
			if (touchedTroop) {
				data.dragMode = 'link';
				data.draggedTroopId = touchedTroop.id;
			} else {
				data.dragMode = 'cut';
				data.draggedTroopId = -1;
			}
		}

		// --- Drag continuation: keep the live preview line up to date --------
		if (data.dragMode && mouse.press(0)) {
			const current = mouse.getCoords();
			data.dragCurrentX = current.x;
			data.dragCurrentY = current.y;
		}

		// --- Drag end: emit the actual game input ------------------------------
		if (data.dragMode && mouse.killed(0)) {
			const end = mouse.getCoords();

			if (data.dragMode === 'cut') {
				inputs.push({
					action: 'cutLine',
					cutLine: {
						startX: data.dragStartX,
						startY: data.dragStartY,
						endX: end.x,
						endY: end.y,
					},
				});
			} else if (data.dragMode === 'link' && data.draggedTroopId >= 0) {
				const selfTroop = this.troops.get(data.draggedTroopId);

				let targetKind = 1; // default: dropped on empty ground
				let targetId = -1;

				if (selfTroop && norm2(end.x - selfTroop.x, end.y - selfTroop.y) <= HIT_RADIUS * HIT_RADIUS) {
					targetKind = 0; // dropped back on itself => cancel
				} else {
					const targetTroop = this.findTroopNear(end.x, end.y, HIT_RADIUS);
					const targetTower = targetTroop ? null : this.findTowerNear(end.x, end.y, HIT_RADIUS);

					if (targetTroop) { targetKind = 2; targetId = targetTroop.id; }
					else if (targetTower) { targetKind = 3; targetId = targetTower.id; }
				}

				inputs.push({
					action: 'changeNeighboor',
					changeNeighboor: {
						troopId: data.draggedTroopId,
						targetKind,
						targetId,
						targetX: end.x,
						targetY: end.y,
					},
				});
			}

			data.dragMode = null;
			data.draggedTroopId = -1;
		}

		return inputs;
	}

	// -------------------------------------------------------------------------
	// DRAWING
	// -------------------------------------------------------------------------

	/** Draws the 3 background bands (red slow zone / normal zone / blue slow zone). */
	private drawZones(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = "#2b2f3a";
		ctx.fillRect(-ARENA_HALF_W, -ARENA_HALF_H, ARENA_WIDTH, ARENA_HEIGHT);

		ctx.fillStyle = "rgba(255,60,60,0.12)";
		ctx.fillRect(-ARENA_HALF_W, -ARENA_HALF_H, ARENA_WIDTH, ARENA_HALF_H - NORMAL_ZONE_HALF_HEIGHT);

		ctx.fillStyle = "rgba(60,110,255,0.12)";
		ctx.fillRect(-ARENA_HALF_W, NORMAL_ZONE_HALF_HEIGHT, ARENA_WIDTH, ARENA_HALF_H - NORMAL_ZONE_HALF_HEIGHT);
	}

	/** Draws a small HP bar above any damaged unit. Full-HP units show nothing. */
	private drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, maxHp: number, width: number) {
		if (hp >= maxHp) return; // only show once damage has been taken

		const ratio = Math.max(0, hp / maxHp);
		const barY = y - 34;

		ctx.fillStyle = "#000";
		ctx.fillRect(x - width / 2, barY, width, 6);

		ctx.fillStyle = ratio > 0.4 ? "#4caf50" : "#e53935";
		ctx.fillRect(x - width / 2, barY, width * ratio, 6);
	}

	/** Draws every tower, always showing its HP bar (towers always display HP). */
	private drawTowers(ctx: CanvasRenderingContext2D) {
		for (const tower of this.towers) {
			ctx.fillStyle = tower.hp <= 0 ? "#555" : (tower.isRed ? "#c0392b" : "#2980b9");
			ctx.fillRect(tower.x - 28, tower.y - 28, 56, 56);

			// Towers always show HP, regardless of whether they've been hit.
			const ratio = Math.max(0, tower.hp / TOWER_HP);
			const barY = tower.y - 44;
			ctx.fillStyle = "#000";
			ctx.fillRect(tower.x - 30, barY, 60, 8);
			ctx.fillStyle = ratio > 0.4 ? "#4caf50" : "#e53935";
			ctx.fillRect(tower.x - 30, barY, 60 * ratio, 8);
		}
	}

	/** Draws all troops as colored circles, with HP bars only if damaged. */
	private drawTroops(ctx: CanvasRenderingContext2D) {
		for (const troop of this.troops.values()) {
			const stats = STATS[TYPE_LIST[troop.typeIndex]];
			ctx.beginPath();
			ctx.fillStyle = troop.isRed ? "#e74c3c" : "#3498db";
			ctx.arc(troop.x, troop.y, 16, 0, Math.PI * 2);
			ctx.fill();

			if (troop.attacking) {
				ctx.strokeStyle = "#fff";
				ctx.lineWidth = 2;
				ctx.stroke();
			}

			this.drawHpBar(ctx, troop.x, troop.y, troop.hp, stats.hp, 34);
		}
	}

	/** Draws thin colored arrows for every active neighboor link, plus the live drag preview. */
	private drawLinks(ctx: CanvasRenderingContext2D, data: ClientData) {
		for (const troop of this.troops.values()) {
			if (troop.neighboorKind === 'none') continue;

			let tx: number, ty: number;
			if (troop.neighboorKind === 'point') {
				tx = troop.neighboorX; ty = troop.neighboorY;
			} else if (troop.neighboorKind === 'troop') {
				const t = this.troops.get(troop.neighboorId);
				if (!t) continue;
				tx = t.x; ty = t.y;
			} else {
				const t = this.towers.find(tw => tw.id === troop.neighboorId);
				if (!t) continue;
				tx = t.x; ty = t.y;
			}

			ctx.strokeStyle = troop.isRed ? "#e74c3c" : "#3498db";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(troop.x, troop.y);
			ctx.lineTo(tx, ty);
			ctx.stroke();
		}

		// Live preview of the current mouse drag gesture (cut line or new link).
		if (data.dragMode) {
			ctx.strokeStyle = data.dragMode === 'cut' ? "#ffffff" : "#f1c40f";
			ctx.lineWidth = data.dragMode === 'cut' ? 2 : 3;
			ctx.setLineDash(data.dragMode === 'cut' ? [6, 6] : []);
			ctx.beginPath();
			ctx.moveTo(data.dragStartX, data.dragStartY);
			ctx.lineTo(data.dragCurrentX, data.dragCurrentY);
			ctx.stroke();
			ctx.setLineDash([]);
		}
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		_playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = false;
		const data = _data as ClientData;

		if (data.firstFrame) {
			data.firstFrame = false;
		}

		data.update(this);

		// The whole portrait arena is always fully visible: no camera transform
		// is needed, we simply draw directly in world/arena coordinates, centered.
		ctx.save();
		ctx.translate(ARENA_HALF_W, ARENA_HALF_H);

		this.drawZones(ctx);
		this.drawLinks(ctx, data);
		this.drawTowers(ctx);
		this.drawTroops(ctx);

		ctx.restore();
	}

	// -------------------------------------------------------------------------
	// LIFECYCLE / SERIALIZATION
	// -------------------------------------------------------------------------

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const { State } = protocols.get();

		const object: Fields = {
			players: this.players.map(p => ({ connected: p.connected, isRed: p.isRed })),
			troops: [...this.troops.values()].map(t => ({
				id: t.id,
				type: t.typeIndex,
				isRed: t.isRed,
				x: t.x,
				y: t.y,
				hp: t.hp,
				attacking: t.attacking,
				attackCooldown: t.attackCooldown,
				neighboorKind: NEIGHBOOR_KIND_TO_INT[t.neighboorKind],
				neighboorId: t.neighboorId,
				neighboorX: t.neighboorX,
				neighboorY: t.neighboorY,
				noTargetTimer: t.noTargetTimer,
				lastNeighboorId: t.lastNeighboorId,
			})),
			towers: this.towers.map(t => ({
				id: t.id,
				isRed: t.isRed,
				x: t.x,
				y: t.y,
				hp: t.hp,
				attackCooldown: t.attackCooldown,
			})),
			time: this.time,
			suddenDeath: this.suddenDeath,
			nextTroopId: this.nextTroopId,
			redMana: this.redMana,
			blueMana: this.blueMana,
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = decodeFullMessage(State.decode(data));

		for (const [i, p] of obj.players.entries()) {
			this.players[i].load(p);
		}

		this.troops.clear();
		for (const t of obj.troops) {
			const typeName = TYPE_LIST[t.type];
			const Ctor = TYPE_CLASSES[typeName];
			const troop = new Ctor(t.id, t.isRed, t.x, t.y);
			troop.hp = t.hp;
			troop.attacking = t.attacking;
			troop.attackCooldown = t.attackCooldown;
			troop.neighboorKind = INT_TO_NEIGHBOOR_KIND[t.neighboorKind];
			troop.neighboorId = t.neighboorId;
			troop.neighboorX = t.neighboorX;
			troop.neighboorY = t.neighboorY;
			troop.noTargetTimer = t.noTargetTimer;
			troop.lastNeighboorId = t.lastNeighboorId;
			this.troops.set(troop.id, troop);
		}

		this.towers.length = 0;
		for (const t of obj.towers) {
			const tower = new Tower(t.id, t.isRed, t.x, t.y);
			tower.hp = t.hp;
			tower.attackCooldown = t.attackCooldown;
			this.towers.push(tower);
		}

		this.time = obj.time;
		this.suddenDeath = obj.suddenDeath;
		this.nextTroopId = obj.nextTroopId;
		this.redMana = obj.redMana;
		this.blueMana = obj.blueMana;
	}

	override getSize() {
		return { width: ARENA_WIDTH, height: ARENA_HEIGHT };
	}

	override evalMouseCoords(
		x: number,
		y: number,
		_playerIdx: number,
		_clientData: any
	) {
		const clientData = _clientData as ClientData;

		// No camera transform is applied when drawing (see draw()), so screen
		// coordinates map directly to world coordinates once re-centered.
		const ret = { x: x - ARENA_HALF_W, y: y - ARENA_HALF_H };

		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;

		return ret;
	}

	override getMobileDesc(): MobileDescriptor {
		// No joysticks or buttons: all interaction happens through drag gestures
		// (touch is routed through the same mouse-like controller).
		return { joysticks: {}, buttons: {} };
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	/** Builds the FinishGame result once the match is over. */
	private produceFinish(): FinishGame {
		const redAlive = this.towers.filter(t => t.isRed && t.hp > 0).length;
		const blueAlive = this.towers.filter(t => !t.isRed && t.hp > 0).length;
		const redHp = this.towers.filter(t => t.isRed).reduce((s, t) => s + Math.max(0, t.hp), 0);
		const blueHp = this.towers.filter(t => !t.isRed).reduce((s, t) => s + Math.max(0, t.hp), 0);

		const redPlayers = this.players.map((p, i) => i).filter(i => this.players[i].isRed);
		const bluePlayers = this.players.map((p, i) => i).filter(i => !this.players[i].isRed);

		let results: number[][];
		const teamEqualities: number[] = [];

		if (redAlive === blueAlive && redHp === blueHp) {
			// Perfect tie between the two teams.
			results = [redPlayers, bluePlayers];
			teamEqualities.push(0);
		} else {
			const redWins = redAlive !== blueAlive ? redAlive > blueAlive : redHp > blueHp;
			results = redWins ? [redPlayers, bluePlayers] : [bluePlayers, redPlayers];
		}

		// Players within the same team are always tied with each other.
		const playerEqualities: number[] = [];
		let offset = 0;
		for (const team of results) {
			for (let i = 0; i < team.length - 1; i++) {
				playerEqualities.push(offset + i);
			}
			offset += team.length;
		}

		return { results, teamEqualities, playerEqualities };
	}
}

// Maps between the string NeighboorKind used in game logic and the small
// integer used on the wire (protobuf has no native string-enum for this).
const NEIGHBOOR_KIND_TO_INT: Record<NeighboorKind, number> = { none: 0, point: 1, troop: 2, tower: 3 };
const INT_TO_NEIGHBOOR_KIND: NeighboorKind[] = ['none', 'point', 'troop', 'tower'];

import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode, MultiplayerClientEntry } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { norm2 } from "../util/norm2";
import { IKeyboardController, IMobileController, IMouseController } from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader, ImageLoaderFolder } from "../util/ImageLoader";

const protocols = getProtocol('moveArmy', 'multiplayer');

interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

// ============================================================================
// CONSTANTS
// All tunable numbers live here so balance/design changes never require
// hunting through the logic below.
// ============================================================================

/** Portrait arena. Coordinates are centered: x/y in [-LIMIT, +LIMIT]. */
const WIDTH = 1200;
const HEIGHT = 2400;
const X_LIMIT = WIDTH / 2;
const Y_LIMIT = HEIGHT / 2;

/** The arena is split into 5 horizontal bands. Band 0 (topmost, red side) and
 *  band ZONE_COUNT-1 (bottommost, blue side) are "slow zones": troops standing
 *  in them are slowed down regardless of their team. The 3 middle bands behave
 *  identically to each other ("zone normale"). */
const ZONE_COUNT = 10;
const ZONE_HEIGHT = HEIGHT / ZONE_COUNT;
const SLOW_ZONE_SPEED_MULTIPLIER = 0.5;

/** Match S. The match lasts MATCH_TOTAL_TIME seconds, and the last
 *  SUDDEN_DEATH_DURATION seconds of it are sudden death (towers take extra
 *  damage to force a conclusion). */
const MATCH_TOTAL_TIME = 180; // 3 minutes
const SUDDEN_DEATH_DURATION = 60; // last minute
const SUDDEN_DEATH_DAMAGE_MULTIPLIER = 2;

/** Spawn-mana system. Each team keeps one gauge per troop type (never sent to
 *  the client as a "visible" resource, but it IS part of the shared State so
 *  a load() never desyncs it). The gauge fills over time and gets a bonus
 *  whenever a troop of that type dies; once it crosses the threshold, 1 unit
 *  is consumed and a troop of that type spawns automatically. */
const SPAWN_MANA_RATE = 0.1; // gauge units gained per second
const DEATH_MANA_BONUS = 0.9; // gauge units gained when a troop of this type dies
const SPAWN_MANA_THRESHOLD = 1; // gauge threshold that triggers a spawn

/** AI "neighboor" (movement link) behaviour. */
const TARGET_SEARCH_DELAY = 1; // seconds without a target before seeking a friendly troop to follow
const MAX_CYCLE_CHECK_DEPTH = 64; // safety cap when walking neighboor chains for cycle detection

/** Towers. */
const TOWER_COUNT_PER_TEAM = 3;
const TOWER_HP = 400;
const TOWER_RANGE = 260;
const TOWER_DAMAGE = 18;
const TOWER_FIRE_RATE = 0.25; // seconds between shots (towers fire fast)
const TOWER_RADIUS = 40;
const TOWER_X_POSITIONS = [-X_LIMIT * 0.55, 0, X_LIMIT * 0.55];
const TOWER_Y_OFFSET = Y_LIMIT * 0.8;

/** Troops. */
const TROOP_RADIUS = 18;
const ARROW_SPEED = 900;
const ARROW_HIT_DISTANCE = 14;
const BOMB_SPEED = 500;
const BOMB_HIT_DISTANCE = 14;
const BOMB_EXPLOSION_RADIUS = 90;

/** Each troop type occupies a fixed X "lane". */
type TroopTypeId = 'soldier' | 'archer' | 'tank' | 'bomber' | 'car';
const TROOP_TYPE_IDS: TroopTypeId[] = ['soldier', 'archer', 'tank', 'bomber', 'car'];

const TYPE_X_POSITION: Record<TroopTypeId, number> = {
	soldier: -X_LIMIT * 0.6,
	archer: -X_LIMIT * 0.3,
	tank: 0,
	bomber: X_LIMIT * 0.3,
	car: X_LIMIT * 0.6
};

const TROOP_TYPE_TO_ENUM: Record<TroopTypeId, number> = {
	soldier: 0, archer: 1, tank: 2, bomber: 3, car: 4
};
const ENUM_TO_TROOP_TYPE: TroopTypeId[] = ['soldier', 'archer', 'tank', 'bomber', 'car'];


// ============================================================================
// SHARED (non-serialized-directly) helper types
// ============================================================================

/** What a troop is currently moving towards / bound to. Mirrors the
 *  NeighboorTarget oneof from the proto, but as a small discriminated union
 *  that's pleasant to use in TS logic. */
type NeighboorTarget =
	| { kind: 'point'; x: number; y: number }
	| { kind: 'tower'; id: number }
	| { kind: 'troop'; id: number };

/** A resolved thing a troop can be in combat with. */
type CombatTarget =
	| { kind: 'troop'; id: number; x: number; y: number }
	| { kind: 'tower'; id: number; x: number; y: number };

interface Arrow {
	id: number;
	x: number; y: number;
	vx: number; vy: number;
	targetX: number; targetY: number;
	damage: number;
	team: 'red' | 'blue';
	targetTroopId: number | null;
	targetTowerId: number | null;
}

interface Bomb {
	id: number;
	x: number; y: number;
	vx: number; vy: number;
	targetX: number; targetY: number;
	damage: number;
	team: 'red' | 'blue';
	radius: number;
}


// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

/** 2D cross product, used by segmentsIntersect. */
function cross(ax: number, ay: number, bx: number, by: number): number {
	return ax * by - ay * bx;
}

/** Standard segment/segment intersection test (proper intersection only),
 *  used to know which troop-troop links a player's "cut" gesture severs. */
function segmentsIntersect(
	ax: number, ay: number, bx: number, by: number,
	cx: number, cy: number, dx: number, dy: number
): boolean {
	const d1 = cross(dx - cx, dy - cy, ax - cx, ay - cy);
	const d2 = cross(dx - cx, dy - cy, bx - cx, by - cy);
	const d3 = cross(bx - ax, by - ay, cx - ax, cy - ay);
	const d4 = cross(bx - ax, by - ay, dx - ax, dy - ay);

	return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
		   ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}


// ============================================================================
// TROOP HIERARCHY
// ============================================================================

/**
 * Abstract base for all army units. Holds every piece of state that must be
 * shared (and therefore saved/loaded), and implements the generic per-frame
 * behaviour (movement, targeting, combat trigger). Subclasses only need to
 * describe their stats and how they actually deal damage.
 */
abstract class Troop {
	x: number;
	y: number;
	hp: number;

	/** True while this troop is actively fighting something in range. Troops
	 *  (except TCar) stop moving while attacking. */
	attacking = false;

	/** What this troop is currently trying to reach: a fixed point, a tower,
	 *  or a friendly/enemy troop. Null means "no target yet". */
	neighboor: NeighboorTarget | null = null;

	/** How long (seconds) this troop has had no neighboor target. */
	noTargetTimer = 0;

	/** Countdown (seconds) until this troop can attack again. */
	attackCooldown = 0;

	/** The troop we were last bound to (so we don't immediately re-bind to it
	 *  the moment our link is cleared). Null if we've never been bound. */
	lastNeighboorTroopId: number | null = null;

	/** Static per-subclass initial mana value, see e.g. TSoldier.SPAWN_MANA.
	 *  Declared here only so subclasses can override it; used through the
	 *  TROOP_CLASSES / INITIAL_SPAWN_MANA lookup tables below. */
	static readonly SPAWN_MANA: number = 0;

	constructor(
		public readonly id: number,
		public readonly team: 'red' | 'blue',
		x: number,
		y: number
	) {
		this.x = x;
		this.y = y;
		this.hp = this.getMaxHp();
	}

	abstract getType(): TroopTypeId;
	abstract getMaxHp(): number;
	abstract getSpeed(): number;
	abstract getAttackRange(): number;
	abstract getAttackDamage(): number;
	abstract getAttackRate(): number;

	/** Applies this troop's attack to `target`, already-scaled `damage`. */
	abstract performAttack(game: GMMoveArmy, target: CombatTarget, damage: number): void;

	/** Only TCar can move while attacking; everyone else plants their feet. */
	canMoveWhileAttacking(): boolean {
		return false;
	}

	isAlive(): boolean {
		return this.hp > 0;
	}

	takeDamage(amount: number) {
		this.hp = Math.max(0, this.hp - amount);
	}

	/** Red pushes towards +y, blue pushes towards -y. */
	getForwardDirection(): number {
		return this.team === 'red' ? 1 : -1;
	}

	/** Which of the 5 horizontal bands this troop currently stands in. */
	getZoneIndex(): number {
		const clampedY = Math.max(-Y_LIMIT, Math.min(Y_LIMIT - 0.001, this.y));
		return Math.floor((clampedY + Y_LIMIT) / ZONE_HEIGHT);
	}

	isInSlowZone(): boolean {
		const idx = this.getZoneIndex();
		return idx === 0 || idx === ZONE_COUNT - 1;
	}

	private getEffectiveSpeed(): number {
		return this.isInSlowZone() ? this.getSpeed() * SLOW_ZONE_SPEED_MULTIPLIER : this.getSpeed();
	}

	/** Keeps the troop inside the arena bounds (used after movement/collisions). */
	clampToArena() {
		this.x = Math.max(-X_LIMIT + TROOP_RADIUS, Math.min(X_LIMIT - TROOP_RADIUS, this.x));
		this.y = Math.max(-Y_LIMIT + TROOP_RADIUS, Math.min(Y_LIMIT - TROOP_RADIUS, this.y));
	}

	/** Forgets the current neighboor troop link, remembering it so we don't
	 *  instantly re-select the same troop next time we search. */
	clearNeighboor(_game: GMMoveArmy) {
		if (this.neighboor?.kind === 'troop') {
			this.lastNeighboorTroopId = this.neighboor.id;
		}
		this.neighboor = null;
		this.noTargetTimer = 0;
	}

	/**
	 * Main per-frame update. Order of priorities:
	 *   1. If an enemy (troop or tower) is within attack range: fight it.
	 *   2. If in a slow zone: always push forward, but keep maintaining the
	 *      neighboor graph for later use.
	 *   3. If following a friendly troop that just started attacking: redirect
	 *      onto whatever that friendly troop is attacking.
	 *   4. Otherwise: move towards the resolved neighboor, or search for one,
	 *      or just advance forward as a last resort.
	 */
	frame(game: GMMoveArmy, dt: number) {
		if (!this.isAlive()) return;

		if (this.attackCooldown > 0) {
			this.attackCooldown -= dt;
		}

		// --- 1. Opportunistic combat -------------------------------------
		const combatTarget = game.findNearestEnemyInRange(this);
		if (combatTarget) {
			this.attacking = true;

			if (this.attackCooldown <= 0) {
				const damage = this.getAttackDamage() * game.getDamageMultiplier();
				this.performAttack(game, combatTarget, damage);
				this.attackCooldown = this.getAttackRate();
			}

			if (this.canMoveWhileAttacking()) {
				this.moveTowardsNeighboor(game, dt);
			}
			return;
		}

		this.attacking = false;

		// --- 2. Slow zone: always march forward ---------------------------
		if (this.isInSlowZone()) {
			this.updateNeighboorSearch(game, dt);
			this.moveForward(dt);
			return;
		}

		// --- 3. Redirect through an attacking friendly ---------------------
		this.checkFriendlyRedirect(game);

		// --- 4. Move towards neighboor, or search, or advance -------------
		if (this.neighboor) {
			this.moveTowardsNeighboor(game, dt);
		} else {
			this.noTargetTimer += dt;
			if (this.noTargetTimer > TARGET_SEARCH_DELAY) {
				const bound = this.tryBindNearestFriendly(game);
				if (!bound) {
					this.moveForward(dt);
				}
			}
		}
	}

	/** Same target-searching logic used outside slow zones, but only used to
	 *  MAINTAIN the graph while in a slow zone (movement itself always goes
	 *  forward there, per the design). */
	private updateNeighboorSearch(game: GMMoveArmy, dt: number) {
		this.checkFriendlyRedirect(game);
		if (!this.neighboor) {
			this.noTargetTimer += dt;
			if (this.noTargetTimer > TARGET_SEARCH_DELAY) {
				this.tryBindNearestFriendly(game);
			}
		}
	}

	/** If we're following a friendly troop that has started fighting, stop
	 *  trailing it and instead head towards whatever it's fighting — this
	 *  makes troops "pile onto" a fight instead of queuing behind a
	 *  stationary ally. */
	private checkFriendlyRedirect(game: GMMoveArmy) {
		if (!this.neighboor || this.neighboor.kind !== 'troop') return;

		const followed = game.getTroopById(this.neighboor.id);
		if (!followed || followed.team !== this.team || !followed.attacking) return;

		const theirFight = game.findNearestEnemyInRange(followed);
		if (theirFight) {
			this.neighboor = theirFight.kind === 'tower'
				? { kind: 'tower', id: theirFight.id }
				: { kind: 'troop', id: theirFight.id };
			this.noTargetTimer = 0;
		}
	}

	/** Searches for the closest living friendly troop to attach our neighboor
	 *  to, skipping the troop we were just following and any candidate that
	 *  would close a cycle in the link graph. Returns true if bound. */
	private tryBindNearestFriendly(game: GMMoveArmy): boolean {
		let best: Troop | null = null;
		let bestDist = Infinity;

		for (const other of game.getFriendlyTroops(this.team)) {
			if (
				(this.team === 'red' && other.y < this.y) ||
				(this.team === 'blue' && other.y > this.y) ||
				other.id === this.id ||
				!other.isAlive() ||
				other.id === this.lastNeighboorTroopId ||
				game.wouldCreateCycle(this.id, other.id)
			) continue;

			const d = norm2(other.x - this.x, other.y - this.y);
			if (d < bestDist) {
				bestDist = d;
				best = other;
			}
		}

		if (!best) return false;

		this.neighboor = { kind: 'troop', id: best.id };
		this.noTargetTimer = 0;
		return true;
	}

	private moveForward(dt: number) {
		this.y += this.getForwardDirection() * this.getEffectiveSpeed() * dt;
		this.clampToArena();
	}

	private moveTowardsNeighboor(game: GMMoveArmy, dt: number) {
		if (!this.neighboor) return;

		const pos = game.resolveNeighboorPosition(this.neighboor);
		if (!pos) {
			// The thing we were heading towards no longer exists (died/destroyed).
			this.clearNeighboor(game);
			return;
		}


		const dx = pos.x - this.x;
		const dy = pos.y - this.y;
		const dist = Math.sqrt(norm2(dx, dy));

		// Stop a bit short so troops don't stack exactly on top of their target.
		const stopDistance = TROOP_RADIUS * 2;
		if (dist <= stopDistance) {
			if (this.neighboor.kind === 'point') {
				this.neighboor = null;
			}
			return;
		}

		const speed = this.getEffectiveSpeed();
		this.x += (dx / dist) * speed * dt;
		this.y += (dy / dist) * speed * dt;
		this.clampToArena();
	}

	/** Serializes this troop's dynamic state into a plain protobuf-ready object. */
	serialize(): Fields {
		const base: Fields = {
			id: this.id,
			type: TROOP_TYPE_TO_ENUM[this.getType()],
			isRed: this.team === 'red',
			x: this.x,
			y: this.y,
			hp: this.hp,
			attacking: this.attacking,
			noTargetTimer: this.noTargetTimer,
			attackCooldown: this.attackCooldown,
			lastNeighboorTroopId: this.lastNeighboorTroopId ?? -1
		};

		if (!this.neighboor) {
			base.neighboor = 'neighboorNone';
			base.neighboorNone = {};
		} else if (this.neighboor.kind === 'point') {
			base.neighboor = 'neighboorPoint';
			base.neighboorPoint = { x: this.neighboor.x, y: this.neighboor.y };
		} else if (this.neighboor.kind === 'troop') {
			base.neighboor = 'neighboorTroopId';
			base.neighboorTroopId = this.neighboor.id;
		} else {
			base.neighboor = 'neighboorTowerId';
			base.neighboorTowerId = this.neighboor.id;
		}

		return base;
	}
}


/** Melee unit: damages nearby enemies directly, high HP-ish, no projectile. */
class TSoldier extends Troop {
	static readonly SPAWN_MANA = 5;

	getType(): TroopTypeId { return 'soldier'; }
	getMaxHp() { return 120; }
	getSpeed() { return 160; }
	getAttackRange() { return 50; }
	getAttackDamage() { return 20; }
	getAttackRate() { return 0.8; }

	performAttack(game: GMMoveArmy, target: CombatTarget, damage: number) {
		game.applyDamageToTarget(target, damage, this.team);
	}
}

/** Ranged unit: fires arrows at anything within a fairly large radius. */
class TArcher extends Troop {
	static readonly SPAWN_MANA = 1;

	getType(): TroopTypeId { return 'archer'; }
	getMaxHp() { return 70; }
	getSpeed() { return 140; }
	getAttackRange() { return 220; }
	getAttackDamage() { return 14; }
	getAttackRate() { return 1.0; }

	performAttack(game: GMMoveArmy, target: CombatTarget, damage: number) {
		game.spawnArrow(this.x, this.y, target, damage, this.team);
	}
}

/** Heavy unit: huge HP pool, but a small range and low damage. */
class TTank extends Troop {
	static readonly SPAWN_MANA = 1;

	getType(): TroopTypeId { return 'tank'; }
	getMaxHp() { return 400; }
	getSpeed() { return 80; }
	getAttackRange() { return 70; }
	getAttackDamage() { return 10; }
	getAttackRate() { return 1.2; }

	performAttack(game: GMMoveArmy, target: CombatTarget, damage: number) {
		game.applyDamageToTarget(target, damage, this.team);
	}
}

/** Support unit: lobs area-damage bombs at nearby enemies. */
class TBomber extends Troop {
	static readonly SPAWN_MANA = 1;

	getType(): TroopTypeId { return 'bomber'; }
	getMaxHp() { return 90; }
	getSpeed() { return 150; }
	getAttackRange() { return 180; }
	getAttackDamage() { return 25; }
	getAttackRate() { return 1.6; }

	performAttack(game: GMMoveArmy, target: CombatTarget, damage: number) {
		game.spawnBomb(this.x, this.y, target, damage, this.team, BOMB_EXPLOSION_RADIUS);
	}
}

/** Fast skirmisher: shoots like an archer but never stops moving. */
class TCar extends Troop {
	static readonly SPAWN_MANA = 1;

	getType(): TroopTypeId { return 'car'; }
	getMaxHp() { return 80; }
	getSpeed() { return 400; }
	getAttackRange() { return 200; }
	getAttackDamage() { return 12; }
	getAttackRate() { return 0.9; }

	canMoveWhileAttacking() { return true; }

	performAttack(game: GMMoveArmy, target: CombatTarget, damage: number) {
		game.spawnArrow(this.x, this.y, target, damage, this.team);
	}
}


const TROOP_CLASSES: Record<TroopTypeId, new (id: number, team: 'red' | 'blue', x: number, y: number) => Troop> = {
	soldier: TSoldier,
	archer: TArcher,
	tank: TTank,
	bomber: TBomber,
	car: TCar
};

const INITIAL_SPAWN_MANA: Record<TroopTypeId, number> = {
	soldier: TSoldier.SPAWN_MANA,
	archer: TArcher.SPAWN_MANA,
	tank: TTank.SPAWN_MANA,
	bomber: TBomber.SPAWN_MANA,
	car: TCar.SPAWN_MANA
};

function createTroop(type: TroopTypeId, id: number, team: 'red' | 'blue', x: number, y: number): Troop {
	const Ctor = TROOP_CLASSES[type];
	return new Ctor(id, team, x, y);
}

/** Rebuilds a Troop instance (correct subclass) from its saved State fields. */
function deserializeTroop(obj: Fields): Troop {
	const type = ENUM_TO_TROOP_TYPE[obj.type];
	const troop = createTroop(type, obj.id, obj.isRed ? 'red' : 'blue', obj.x, obj.y);

	troop.hp = obj.hp;
	troop.attacking = obj.attacking;
	troop.noTargetTimer = obj.noTargetTimer;
	troop.attackCooldown = obj.attackCooldown;
	troop.lastNeighboorTroopId = obj.lastNeighboorTroopId >= 0 ? obj.lastNeighboorTroopId : null;

	switch (obj.neighboor) {
		case 'neighboorPoint':
			troop.neighboor = { kind: 'point', x: obj.neighboorPoint.x, y: obj.neighboorPoint.y };
			break;
		case 'neighboorTroopId':
			troop.neighboor = { kind: 'troop', id: obj.neighboorTroopId };
			break;
		case 'neighboorTowerId':
			troop.neighboor = { kind: 'tower', id: obj.neighboorTowerId };
			break;
		default:
			troop.neighboor = null;
	}

	return troop;
}


// ============================================================================
// TOWER
// ============================================================================

/**
 * A defensive structure. Its x/y are initialization data (sent once via
 * StartDataClient, per the "spawnX/spawnY" pattern) and never resaved — only
 * its HP is dynamic and part of State.
 */
class Tower {
	hp = TOWER_HP;
	attackCooldown = 0;

	constructor(
		public readonly id: number,
		public readonly team: 'red' | 'blue',
		public readonly x: number,
		public readonly y: number
	) {}

	isAlive(): boolean {
		return this.hp > 0;
	}

	takeDamage(amount: number) {
		this.hp = Math.max(0, this.hp - amount);
	}

	/** Towers auto-fire fast, high-damage arrows at the closest enemy troop in range. */
	frame(game: GMMoveArmy, dt: number) {
		if (!this.isAlive()) return;
		if (this.attackCooldown > 0) this.attackCooldown -= dt;

		const target = game.findNearestEnemyTroopInRange(this.x, this.y, TOWER_RANGE, this.team);
		if (target && this.attackCooldown <= 0) {
			const damage = TOWER_DAMAGE * game.getDamageMultiplier();
			game.spawnArrow(this.x, this.y, target, damage, this.team);
			this.attackCooldown = TOWER_FIRE_RATE;
		}
	}
}


// ============================================================================
// PLAYER
// Holds ONLY shared/serializable data. No client-only fields here.
// ============================================================================

class Player {
	/** Assigned once at match creation, like spawnX/spawnY elsewhere: this is
	 *  initialization data, intentionally NOT re-sent via save()/load(). */
	team: 'red' | 'blue' = 'red';

	/** This DOES need to be part of the shared State, since it can change at
	 *  any point mid-match and losing it on a load() would be confusing. */
	connected = true;

	initTeam(team: 'red' | 'blue') {
		this.team = team;
	}
}


// ============================================================================
// CLIENT-ONLY DATA
// Everything here is display/interaction state; none of it is simulation
// state, so none of it may leak into Troop/Tower/GMMoveArmy/Player.
// ============================================================================

class ClientData {
	firstFrame = true;

	/** This client's own team, learned once from StartDataClient. */
	myTeam: 'red' | 'blue' = 'red';

	/** Last known world-space pointer position (mouse or first touch). */
	mouseX = 0;
	mouseY = 0;
	lastPointerX = 0;
	lastPointerY = 0;

	/** Drag/gesture state for the cut-links / re-link interaction. */
	dragMode: 'cut' | 'link' | null = null;
	dragTroopId: number | null = null;
	dragStartX = 0;
	dragStartY = 0;
	dragCurrentX = 0;
	dragCurrentY = 0;

	/** Emulated "first/killed" tracking for touch, since IMobileController
	 *  only exposes the raw current digit list. */
	prevDigitId: number | null = null;

	/** Troop currently under the pointer, used for the hover highlight. */
	hoveredTroopId: number | null = null;

	readonly html: HTMLDivElement;
	readonly time: HTMLDivElement;
	readonly towerRow: HTMLDivElement;
	readonly towerBars: HTMLDivElement[] = [];

	constructor() {
		this.html = document.createElement("div");
		this.html.classList.add("game-moveArmy-root");

		this.time = document.createElement("div");
		this.time.classList.add("game-moveArmy-time");

		this.towerRow = document.createElement("div");
		this.towerRow.classList.add("game-moveArmy-tower-row");

		for (let i = 0; i < TOWER_COUNT_PER_TEAM * 2; i++) {
			const isRed = i < TOWER_COUNT_PER_TEAM;
			const wrapper = document.createElement("div");
			wrapper.classList.add("game-moveArmy-tower-hp");

			const fill = document.createElement("div");
			fill.classList.add("game-moveArmy-tower-hp-fill");
			fill.classList.add(isRed ? "game-moveArmy-tower-hp-fill-red" : "game-moveArmy-tower-hp-fill-blue");

			wrapper.appendChild(fill);
			this.towerRow.appendChild(wrapper);
			this.towerBars.push(fill);
		}

		this.html.appendChild(this.time);
		this.html.appendChild(this.towerRow);
	}

	static showTime(time: number) {
		const minutes = Math.floor(time / 60);
		const seconds = Math.floor(time % 60);
		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	}

	/** Refreshes the overlay DOM and recomputes which troop (if any) is hovered. */
	update(game: GMMoveArmy, _playerIdx: number) {
		this.time.innerText = ClientData.showTime(game.time);

		for (const [i, tower] of game.towers.entries()) {
			const ratio = Math.max(0, tower.hp / TOWER_HP);
			this.towerBars[i].style.width = `${ratio * 100}%`;
		}

		// Find the closest troop to the pointer, within a small hover radius.
		let best: Troop | null = null;
		let bestDist = (TROOP_RADIUS * 1.5) ** 2;
		for (const troop of game.troops) {
			const d = norm2(troop.x - this.mouseX, troop.y - this.mouseY);
			if (d < bestDist) {
				bestDist = d;
				best = troop;
			}
		}
		this.hoveredTroopId = best?.id ?? null;
	}
}


class TutorialData {
	private step = 0;

	constructor(private readonly game: GMMoveArmy) {}

	frame(_dt: number, _clock: number) {
		if (this.step === 0) {
			return "Drag from a soldier to link it to a target. Drag across links to cut them.";
		}
		return "";
	}
}


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


// ============================================================================
// GAME MODE
// ============================================================================

export class GMMoveArmy extends GameMode {
	static readonly types = { Player, Troop, Tower };

	static readonly DATA = {
		WIDTH, HEIGHT, X_LIMIT, Y_LIMIT,
		ZONE_COUNT, ZONE_HEIGHT,
		TOWER_RADIUS, TROOP_RADIUS
	};

	readonly players: Player[];
	troops: Troop[] = [];
	towers: Tower[] = [];
	arrows: Arrow[] = [];
	bombs: Bomb[] = [];

	/** Per-team, per-type spawn gauges. Never shown to the client directly. */
	manaGauges: Record<'red' | 'blue', Record<TroopTypeId, number>> = {
		red: { soldier: 0, archer: 0, tank: 0, bomber: 0, car: 0 },
		blue: { soldier: 0, archer: 0, tank: 0, bomber: 0, car: 0 }
	};

	time = MATCH_TOTAL_TIME;

	private nextTroopId = 0;
	private nextProjectileId = 0;

	private constructor(total: number) {
		super();
		this.players = Array.from({ length: total }, () => new Player());
	}

	// -- Team assignment (shared by createServ and the local createClient fallback) --

	private static assignTeams(preferences: number[]): boolean[] {
		const total = preferences.length;
		const maxPerTeam = Math.ceil(total / 2);
		const assigned = new Array<boolean | undefined>(total);
		let redCount = 0;
		let blueCount = 0;

		// Phase 1: honor explicit preferences while there's room.
		for (let i = 0; i < total; i++) {
			if (preferences[i] === 1 && redCount < maxPerTeam) {
				assigned[i] = true;
				redCount++;
			} else if (preferences[i] === -1 && blueCount < maxPerTeam) {
				assigned[i] = false;
				blueCount++;
			}
		}

		// Phase 2: fill remaining slots, keeping team sizes balanced.
		for (let i = 0; i < total; i++) {
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

		return assigned as boolean[];
	}

	private createTowers() {
		let id = 0;
		for (const team of ['red', 'blue'] as const) {
			const y = team === 'red' ? -TOWER_Y_OFFSET : TOWER_Y_OFFSET;
			for (const x of TOWER_X_POSITIONS) {
				this.towers.push(new Tower(id++, team, x, y));
			}
		}
	}

	/** Sets each team's gauges to their starting values (TSoldier.SPAWN_MANA
	 *  etc.), immediately spawning whichever troops that implies (e.g. a
	 *  starting gauge of 12 spawns 12 soldiers right away). */
	private initializeInitialArmies() {
		for (const team of ['red', 'blue'] as const) {
			for (const type of TROOP_TYPE_IDS) {
				this.manaGauges[team][type] = INITIAL_SPAWN_MANA[type];
				if (this.manaGauges[team][type] >= SPAWN_MANA_THRESHOLD) {
					this.manaGauges[team][type] -= SPAWN_MANA_THRESHOLD;
					this.spawnTroop(team, type);
				}
			}
		}
	}

	private spawnTroop(team: 'red' | 'blue', type: TroopTypeId) {
		const x = TYPE_X_POSITION[type];
		const y = team === 'red'
			? -Y_LIMIT + TROOP_RADIUS * 2
			: Y_LIMIT - TROOP_RADIUS * 2;

		this.troops.push(createTroop(type, this.nextTroopId++, team, x, y));
	}

	static async createServ(
		players: PlayerInput[],
		total: number,
		_hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	) {
		const { StartData, StartDataClient } = protocols.get();
		const game = new GMMoveArmy(total);

		const preferences = Array.from({ length: total }, (_, i) => {
			if (i < players.length) {
				const decoded = decodeFullMessage(StartData.decode(players[i].data));
				return decoded.preferTeam ?? 0;
			}
			return 0;
		});

		const assignedRed = GMMoveArmy.assignTeams(preferences);
		for (const [i, player] of game.players.entries()) {
			player.initTeam(assignedRed[i] ? 'red' : 'blue');
		}

		game.createTowers();
		game.initializeInitialArmies();

		const data = StartDataClient.encode({
			playersRed: assignedRed,
			towers: game.towers.map(t => ({ id: t.id, x: t.x, y: t.y, isRed: t.team === 'red' }))
		}).finish();

		return { game, data };
	}

	static createClient(
		{ data, origin }: MultiplayerClientEntry,
		total: number,
		playerIdx: number
	) {
		const game = new GMMoveArmy(total);
		const { StartDataClient } = protocols.get();
		const clientData = new ClientData();

		if (origin === 'server') {
			const { playersRed, towers } = decodeFullMessage(StartDataClient.decode(data));

			for (const [i, player] of game.players.entries()) {
				player.initTeam(playersRed[i] ? 'red' : 'blue');
			}

			for (const t of towers) {
				game.towers.push(new Tower(t.id, t.isRed ? 'red' : 'blue', t.x, t.y));
			}

			// Troops are fully dynamic; they arrive with the first State load(),
			// spawning any locally here would desync from the server.
		} else { // origin === 'client': local fallback before any server exists
			const assignedRed = GMMoveArmy.assignTeams(new Array(total).fill(0));
			for (const [i, player] of game.players.entries()) {
				player.initTeam(assignedRed[i] ? 'red' : 'blue');
			}
			game.createTowers();
			game.initializeInitialArmies();
		}

		clientData.myTeam = game.players[playerIdx].team;

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins: {}
		};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly TEXTURES = {
		'tower-red': '/assets/games/moveArmy/tower-red.svg',
		'tower-blue': '/assets/games/moveArmy/tower-blue.svg',
		'troop-soldier-red': '/assets/games/moveArmy/troop-soldier-red.svg',
		'troop-soldier-blue': '/assets/games/moveArmy/troop-soldier-blue.svg',
		'troop-archer-red': '/assets/games/moveArmy/troop-archer-red.svg',
		'troop-archer-blue': '/assets/games/moveArmy/troop-archer-blue.svg',
		'troop-tank-red': '/assets/games/moveArmy/troop-tank-red.svg',
		'troop-tank-blue': '/assets/games/moveArmy/troop-tank-blue.svg',
		'troop-bomber-red': '/assets/games/moveArmy/troop-bomber-red.svg',
		'troop-bomber-blue': '/assets/games/moveArmy/troop-bomber-blue.svg',
		'troop-car-red': '/assets/games/moveArmy/troop-car-red.svg',
		'troop-car-blue': '/assets/games/moveArmy/troop-car-blue.svg',
		'arrow': '/assets/games/moveArmy/arrow.svg',
		'bomb': '/assets/games/moveArmy/bomb.svg'
	};

	override init(): void {}

	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	// -- Lookup helpers -------------------------------------------------------

	getTroopById(id: number): Troop | null {
		return this.troops.find(t => t.id === id) ?? null;
	}

	getTowerById(id: number): Tower | null {
		return this.towers.find(t => t.id === id) ?? null;
	}

	getFriendlyTroops(team: 'red' | 'blue'): Troop[] {
		return this.troops.filter(t => t.team === team);
	}

	/** Damage is doubled during the last minute (sudden death) to force a winner. */
	getDamageMultiplier(): number {
		return this.time <= SUDDEN_DEATH_DURATION ? SUDDEN_DEATH_DAMAGE_MULTIPLIER : 1;
	}

	resolveNeighboorPosition(target: NeighboorTarget): { x: number; y: number } | null {
		switch (target.kind) {
			case 'point':
				return { x: target.x, y: target.y };
			case 'troop': {
				const t = this.getTroopById(target.id);
				return t && t.isAlive() ? { x: t.x, y: t.y } : null;
			}
			case 'tower': {
				const t = this.getTowerById(target.id);
				return t && t.isAlive() ? { x: t.x, y: t.y } : null;
			}
		}
	}

	/** Walks the neighboor chain starting at `toId`; returns true if it ever
	 *  reaches `fromId`, meaning adding the fromId -> toId edge would create a
	 *  cycle in the link graph. */
	wouldCreateCycle(fromId: number, toId: number): boolean {
		let currentId: number | null = toId;
		let depth = 0;
		const visited = new Set<number>();

		while (currentId !== null && depth < MAX_CYCLE_CHECK_DEPTH) {
			if (currentId === fromId) return true;
			if (visited.has(currentId)) return true; // pre-existing cycle, bail out safely
			visited.add(currentId);

			const troop = this.getTroopById(currentId);
			if (!troop || !troop.neighboor || troop.neighboor.kind !== 'troop') break;

			currentId = troop.neighboor.id;
			depth++;
		}

		return false;
	}

	findNearestEnemyInRange(troop: Troop): CombatTarget | null {
		const range2 = troop.getAttackRange() ** 2;
		let best: CombatTarget | null = null;
		let bestDist = Infinity;

		for (const other of this.troops) {
			if (!other.isAlive() || other.team === troop.team) continue;
			const d = norm2(other.x - troop.x, other.y - troop.y);
			if (d <= range2 && d < bestDist) {
				bestDist = d;
				best = { kind: 'troop', id: other.id, x: other.x, y: other.y };
			}
		}

		for (const tower of this.towers) {
			if (!tower.isAlive() || tower.team === troop.team) continue;
			const d = norm2(tower.x - troop.x, tower.y - troop.y);
			if (d <= range2 && d < bestDist) {
				bestDist = d;
				best = { kind: 'tower', id: tower.id, x: tower.x, y: tower.y };
			}
		}

		return best;
	}

	findNearestEnemyTroopInRange(x: number, y: number, range: number, team: 'red' | 'blue'): CombatTarget | null {
		const range2 = range * range;
		let best: CombatTarget | null = null;
		let bestDist = Infinity;

		for (const troop of this.troops) {
			if (!troop.isAlive() || troop.team === team) continue;
			const d = norm2(troop.x - x, troop.y - y);
			if (d <= range2 && d < bestDist) {
				bestDist = d;
				best = { kind: 'troop', id: troop.id, x: troop.x, y: troop.y };
			}
		}

		return best;
	}

	applyDamageToTarget(target: CombatTarget, damage: number, _attackerTeam: 'red' | 'blue') {
		if (target.kind === 'troop') {
			const troop = this.getTroopById(target.id);
			if (troop && troop.isAlive()) {
				troop.takeDamage(damage);
				if (!troop.isAlive()) this.onTroopDeath(troop);
			}
		} else {
			const tower = this.getTowerById(target.id);
			if (tower && tower.isAlive()) tower.takeDamage(damage);
		}
	}

	/** Grants the death mana bonus and unlinks anyone who was following this
	 *  troop, so they immediately start searching for a new target. */
	private onTroopDeath(troop: Troop) {
		this.manaGauges[troop.team][troop.getType()] += DEATH_MANA_BONUS;

		for (const other of this.troops) {
			if (other.neighboor?.kind === 'troop' && other.neighboor.id === troop.id) {
				other.clearNeighboor(this);
			}
		}
	}

	spawnArrow(x: number, y: number, target: CombatTarget, damage: number, team: 'red' | 'blue') {
		const dx = target.x - x;
		const dy = target.y - y;
		const dist = Math.sqrt(norm2(dx, dy)) || 1;

		this.arrows.push({
			id: this.nextProjectileId++,
			x, y,
			vx: (dx / dist) * ARROW_SPEED,
			vy: (dy / dist) * ARROW_SPEED,
			targetX: target.x,
			targetY: target.y,
			damage,
			team,
			targetTroopId: target.kind === 'troop' ? target.id : null,
			targetTowerId: target.kind === 'tower' ? target.id : null
		});
	}

	spawnBomb(x: number, y: number, target: CombatTarget, damage: number, team: 'red' | 'blue', radius: number) {
		const dx = target.x - x;
		const dy = target.y - y;
		const dist = Math.sqrt(norm2(dx, dy)) || 1;

		this.bombs.push({
			id: this.nextProjectileId++,
			x, y,
			vx: (dx / dist) * BOMB_SPEED,
			vy: (dy / dist) * BOMB_SPEED,
			targetX: target.x,
			targetY: target.y,
			damage,
			team,
			radius
		});
	}

	private updateManaGauges(dt: number) {
		for (const team of ['red', 'blue'] as const) {
			const gauge = this.manaGauges[team];
			for (const type of TROOP_TYPE_IDS) {
				gauge[type] += SPAWN_MANA_RATE * dt;
				if (gauge[type] >= SPAWN_MANA_THRESHOLD) {
					gauge[type] -= SPAWN_MANA_THRESHOLD;
					this.spawnTroop(team, type);
				}
			}
		}
	}

	private updateArrows(dt: number) {
		const remaining: Arrow[] = [];

		for (const arrow of this.arrows) {
			arrow.x += arrow.vx * dt;
			arrow.y += arrow.vy * dt;

			const distToTarget = Math.sqrt(norm2(arrow.targetX - arrow.x, arrow.targetY - arrow.y));
			const outOfBounds = Math.abs(arrow.x) > X_LIMIT * 1.2 || Math.abs(arrow.y) > Y_LIMIT * 1.2;

			if (distToTarget < ARROW_HIT_DISTANCE) {
				if (arrow.targetTroopId !== null) {
					const troop = this.getTroopById(arrow.targetTroopId);
					if (troop && troop.isAlive()) {
						troop.takeDamage(arrow.damage);
						if (!troop.isAlive()) this.onTroopDeath(troop);
					}
				} else if (arrow.targetTowerId !== null) {
					const tower = this.getTowerById(arrow.targetTowerId);
					if (tower) tower.takeDamage(arrow.damage);
				}
			} else if (!outOfBounds) {
				remaining.push(arrow);
			}
		}

		this.arrows = remaining;
	}

	private updateBombs(dt: number) {
		const remaining: Bomb[] = [];

		for (const bomb of this.bombs) {
			bomb.x += bomb.vx * dt;
			bomb.y += bomb.vy * dt;

			const distToTarget = Math.sqrt(norm2(bomb.targetX - bomb.x, bomb.targetY - bomb.y));
			if (distToTarget < BOMB_HIT_DISTANCE) {
				this.explodeBomb(bomb);
			} else {
				remaining.push(bomb);
			}
		}

		this.bombs = remaining;
	}

	private explodeBomb(bomb: Bomb) {
		const r2 = bomb.radius * bomb.radius;

		for (const troop of this.troops) {
			if (troop.team === bomb.team || !troop.isAlive()) continue;
			if (norm2(troop.x - bomb.targetX, troop.y - bomb.targetY) <= r2) {
				troop.takeDamage(bomb.damage);
				if (!troop.isAlive()) this.onTroopDeath(troop);
			}
		}

		for (const tower of this.towers) {
			if (tower.team === bomb.team || !tower.isAlive()) continue;
			if (norm2(tower.x - bomb.targetX, tower.y - bomb.targetY) <= r2) {
				tower.takeDamage(bomb.damage);
			}
		}
	}

	/** Adapted from the reference PlayerCollisions code: pairwise circle-circle
	 *  separation so troops don't overlap. Troops that are planted while
	 *  attacking hold their ground; only free-moving troops get pushed. */
	private handleTroopCollisions(): void {
		const minDist = TROOP_RADIUS * 2;

		for (let i = 0; i < this.troops.length; i++) {
			const a = this.troops[i];
			if (!a.isAlive()) continue;

			for (let j = i + 1; j < this.troops.length; j++) {
				const b = this.troops[j];
				if (!b.isAlive()) continue;

				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const dist2 = norm2(dx, dy);

				if (dist2 >= minDist * minDist || dist2 === 0) continue;

				const dist = Math.sqrt(dist2);
				const nx = dx / dist;
				const ny = dy / dist;
				const penetration = minDist - dist;
				const correction = penetration / 2;

				const aFixed = a.attacking && !a.canMoveWhileAttacking();
				const bFixed = b.attacking && !b.canMoveWhileAttacking();

				if (!aFixed) {
					a.x -= nx * correction;
					a.y -= ny * correction;
				}
				if (!bFixed) {
					b.x += nx * correction;
					b.y += ny * correction;
				}

				a.clampToArena();
				b.clampToArena();
			}
		}
	}

	/** True once either team has lost all of its towers (instant win). */
	private checkEarlyFinish(): boolean {
		const redAlive = this.towers.some(t => t.team === 'red' && t.isAlive());
		const blueAlive = this.towers.some(t => t.team === 'blue' && t.isAlive());
		return !redAlive || !blueAlive;
	}

	override run(dt: number, produceFinish: boolean): FinishGame | null {
		this.time = Math.max(0, this.time - dt);
		const timeUp = this.time <= 0;

		this.updateManaGauges(dt);

		for (const troop of this.troops) {
			troop.frame(this, dt);
		}
		this.handleTroopCollisions();

		for (const tower of this.towers) {
			tower.frame(this, dt);
		}

		this.updateArrows(dt);
		this.updateBombs(dt);

		this.troops = this.troops.filter(t => t.isAlive());

		if (timeUp || this.checkEarlyFinish()) {
			if (produceFinish) {
				return this.produceFinish();
			}
		}

		return null;
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];

		switch (input.action) {
			case 'cutLine':
				this.handleCutLine(player.team, input.cutLine);
				break;

			case 'changeNeighboor':
				this.handleChangeNeighboor(player, input.changeNeighboor);
				break;
		}
	}

	/** Cuts every link (of any team — cutting isn't restricted, only creating
	 *  new links is) that crosses the given segment. */
	private handleCutLine(team: 'red' | 'blue', data: Fields) {
		const { startX, startY, endX, endY } = data;

		for (const troop of this.troops) {
			if (
				!troop.neighboor ||
				troop.neighboor.kind !== 'troop' ||
				troop.team !== team
			) continue;

			const pos = this.resolveNeighboorPosition(troop.neighboor);
			if (!pos) continue;

			if (segmentsIntersect(startX, startY, endX, endY, troop.x, troop.y, pos.x, pos.y)) {
				troop.clearNeighboor(this);
			}
		}
	}

	/** Re-links a troop the player commands. Only the owning team may do this. */
	private handleChangeNeighboor(player: Player, data: Fields) {
		const troop = this.getTroopById(data.troopId);
		if (!troop || troop.team !== player.team) return;

		switch (data.target?.case) {
			case 'cancel':
				troop.clearNeighboor(this);
				return;

			case 'targetPoint':
				troop.neighboor = { kind: 'point', x: data.target.targetPoint.x, y: data.target.targetPoint.y };
				break;

			case 'targetTroopId': {
				const targetId = data.target.targetTroopId;
				if (targetId === troop.id || this.wouldCreateCycle(troop.id, targetId)) return;
				troop.neighboor = { kind: 'troop', id: targetId };
				break;
			}

			case 'targetTowerId':
				troop.neighboor = { kind: 'tower', id: data.target.targetTowerId };
				break;

			default:
				return;
		}

		troop.noTargetTimer = 0;
	}

	// -- Input collection -------------------------------------------------

	private hitTestTroop(x: number, y: number): Troop | null {
		for (const troop of this.troops) {
			if (!troop.isAlive()) continue;
			if (norm2(troop.x - x, troop.y - y) <= TROOP_RADIUS * TROOP_RADIUS) return troop;
		}
		return null;
	}

	private hitTestTower(x: number, y: number): Tower | null {
		for (const tower of this.towers) {
			if (!tower.isAlive()) continue;
			if (norm2(tower.x - x, tower.y - y) <= TOWER_RADIUS * TOWER_RADIUS) return tower;
		}
		return null;
	}

	/** Unifies mouse and (emulated) single-touch pointer handling, since
	 *  IMobileController only exposes the raw current digit list rather than
	 *  first/press/killed helpers like the mouse controller does. */
	private getPointerState(mouse: IMouseController, mobile: IMobileController | null, data: ClientData) {
		if (mouse.press(0) || mouse.first(0) || mouse.killed(0)) {
			const coords = mouse.getCoords();
			return { x: coords.x, y: coords.y, first: mouse.first(0), press: mouse.press(0), killed: mouse.killed(0) };
		}

		if (mobile) {
			const digits = mobile.getDigits();
			const digit = digits[0] ?? null;

			const wasDown = data.prevDigitId !== null;
			const isDown = digit !== null;
			const first = isDown && !wasDown;
			const killedNow = !isDown && wasDown;

			data.prevDigitId = isDown ? digit!.id : null;

			if (isDown) {
				return { x: digit!.x, y: digit!.y, first, press: true, killed: false };
			}
			if (killedNow) {
				return { x: data.lastPointerX, y: data.lastPointerY, first: false, press: false, killed: true };
			}
		}

		return null;
	}

	override collectInputs(
		_keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	): Fields[] {
		const data = _data as ClientData;
		const inputs: Fields[] = [];
		const pointer = this.getPointerState(mouse, mobile, data);
		if (!pointer) return inputs;

		data.mouseX = pointer.x;
		data.mouseY = pointer.y;
		data.lastPointerX = pointer.x;
		data.lastPointerY = pointer.y;

		if (pointer.first) {
			const hitTroop = this.hitTestTroop(pointer.x, pointer.y);
			if (hitTroop && hitTroop.team === data.myTeam) {
				data.dragMode = 'link';
				data.dragTroopId = hitTroop.id;
			} else {
				data.dragMode = 'cut';
				data.dragTroopId = null;
			}
			data.dragStartX = pointer.x;
			data.dragStartY = pointer.y;
			data.dragCurrentX = pointer.x;
			data.dragCurrentY = pointer.y;
		}

		if (pointer.press && data.dragMode) {
			data.dragCurrentX = pointer.x;
			data.dragCurrentY = pointer.y;
		}

		if (pointer.killed && data.dragMode) {
			if (data.dragMode === 'cut') {
				inputs.push({
					action: 'cutLine',
					cutLine: {
						startX: data.dragStartX, startY: data.dragStartY,
						endX: pointer.x, endY: pointer.y
					}
				});
			} else if (data.dragMode === 'link' && data.dragTroopId !== null) {
				const targetTroop = this.hitTestTroop(pointer.x, pointer.y);
				const targetTower = this.hitTestTower(pointer.x, pointer.y);

				let target: Fields;
				if (targetTroop && targetTroop.id === data.dragTroopId) {
					target = { case: 'cancel', cancel: {} };
				} else if (targetTroop) {
					target = { case: 'targetTroopId', targetTroopId: targetTroop.id };
				} else if (targetTower) {
					target = { case: 'targetTowerId', targetTowerId: targetTower.id };
				} else {
					target = { case: 'targetPoint', targetPoint: { x: pointer.x, y: pointer.y } };
				}

				inputs.push({
					action: 'changeNeighboor',
					changeNeighboor: { troopId: data.dragTroopId, target }
				});
			}

			data.dragMode = null;
			data.dragTroopId = null;
		}

		return inputs;
	}

	// -- Drawing ------------------------------------------------------------

	private drawBackground(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		ctx.fillStyle = "#2b2b2b";
		ctx.fillRect(-X_LIMIT, -Y_LIMIT, WIDTH, HEIGHT);
	}

	/** Tints the two slow zones (red top / blue bottom) so their effect is legible. */
	private drawZones(ctx: CanvasRenderingContext2D) {
		for (let i = 0; i < ZONE_COUNT; i++) {
			const top = -Y_LIMIT + i * ZONE_HEIGHT;
			const isSlow = i === 0 || i === ZONE_COUNT - 1;
			ctx.fillStyle = isSlow
				? (i === 0 ? 'rgba(255,0,68,0.10)' : 'rgba(0,68,255,0.10)')
				: 'rgba(255,255,255,0.02)';
			ctx.fillRect(-X_LIMIT, top, WIDTH, ZONE_HEIGHT);
		}
	}

	private drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, maxHp: number, width: number) {
		const ratio = Math.max(0, hp / maxHp);
		const height = 6;

		ctx.fillStyle = '#222';
		ctx.fillRect(x - width / 2, y, width, height);

		ctx.fillStyle = ratio > 0.5 ? '#4caf50' : ratio > 0.2 ? '#ffb300' : '#e53935';
		ctx.fillRect(x - width / 2, y, width * ratio, height);
	}

	private drawArrowShape(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
		ctx.save();
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = width;

		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();

		const angle = Math.atan2(y2 - y1, x2 - x1);
		const headLength = 10;
		ctx.beginPath();
		ctx.moveTo(x2, y2);
		ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
		ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}

	/** Draws every neighboor link as a thin team-colored arrow; links that the
	 *  current in-progress "cut" gesture crosses are drawn thicker. */
	private drawLinks(ctx: CanvasRenderingContext2D, data: ClientData) {
		const cutting = data.dragMode === 'cut';

		for (const troop of this.troops) {
			if (!troop.neighboor) continue;
			const pos = this.resolveNeighboorPosition(troop.neighboor);
			if (!pos) continue;

			const color = troop.team === 'red' ? '#ff0044' : '#0044ff';
			let width = 1.5;

			if (cutting) {
				const crosses = segmentsIntersect(
					data.dragStartX, data.dragStartY, data.dragCurrentX, data.dragCurrentY,
					troop.x, troop.y, pos.x, pos.y
				);
				if (crosses) width = 4;
			}

			this.drawArrowShape(ctx, troop.x, troop.y, pos.x, pos.y, color, width);
		}
	}

	private drawTowers(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		for (const tower of this.towers) {
			const texture = imageLoader.get(tower.team === 'red' ? 'tower-red' : 'tower-blue');

			ctx.save();
			if (!tower.isAlive()) ctx.globalAlpha = 0.35;
			ctx.drawImage(texture, tower.x - TOWER_RADIUS, tower.y - TOWER_RADIUS, TOWER_RADIUS * 2, TOWER_RADIUS * 2);
			ctx.restore();

			// Tower HP is always shown, per the design.
			this.drawHpBar(ctx, tower.x, tower.y - TOWER_RADIUS - 10, tower.hp, TOWER_HP, 50);
		}
	}

	private drawTroops(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder, data: ClientData) {
		for (const troop of this.troops) {
			const texture = imageLoader.get(`troop-${troop.getType()}-${troop.team}`);

			const isHighlighted = troop.id === data.hoveredTroopId || troop.id === data.dragTroopId;
			if (isHighlighted) {
				ctx.save();
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 3;
				ctx.beginPath();
				ctx.arc(troop.x, troop.y, TROOP_RADIUS + 5, 0, Math.PI * 2);
				ctx.stroke();
				ctx.restore();
			}

			ctx.drawImage(texture, troop.x - TROOP_RADIUS, troop.y - TROOP_RADIUS, TROOP_RADIUS * 2, TROOP_RADIUS * 2);

			// Only show a troop's HP bar once it has actually taken damage.
			if (troop.hp < troop.getMaxHp()) {
				this.drawHpBar(ctx, troop.x, troop.y - TROOP_RADIUS - 8, troop.hp, troop.getMaxHp(), 30);
			}
		}
	}

	private drawProjectiles(ctx: CanvasRenderingContext2D, imageLoader: ImageLoaderFolder) {
		const arrowTexture = imageLoader.get('arrow');
		for (const arrow of this.arrows) {
			ctx.save();
			ctx.translate(arrow.x, arrow.y);
			ctx.rotate(Math.atan2(arrow.vy, arrow.vx));
			ctx.drawImage(arrowTexture, -12, -4, 24, 8);
			ctx.restore();
		}

		const bombTexture = imageLoader.get('bomb');
		for (const bomb of this.bombs) {
			ctx.drawImage(bombTexture, bomb.x - 10, bomb.y - 10, 20, 20);
		}
	}

	private drawDragPreview(ctx: CanvasRenderingContext2D, data: ClientData) {
		if (!data.dragMode) return;

		if (data.dragMode === 'cut') {
			ctx.save();
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2;
			ctx.setLineDash([6, 6]);
			ctx.beginPath();
			ctx.moveTo(data.dragStartX, data.dragStartY);
			ctx.lineTo(data.dragCurrentX, data.dragCurrentY);
			ctx.stroke();
			ctx.restore();
		} else if (data.dragMode === 'link' && data.dragTroopId !== null) {
			const troop = this.getTroopById(data.dragTroopId);
			if (troop) {
				this.drawArrowShape(ctx, troop.x, troop.y, data.dragCurrentX, data.dragCurrentY, '#ffffff', 2);
			}
		}
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		ctx.imageSmoothingEnabled = false;
		const imageLoader = _imageLoader.getFolder('moveArmy');
		const data = _data as ClientData;

		if (data.firstFrame) {
			data.firstFrame = false;
		}

		data.update(this, playerIdx);

		// Centered coordinate system: (0,0) is the middle of the arena, matching
		// "red = negative Y, blue = positive Y" from the design.
		ctx.save();
		ctx.translate(X_LIMIT, Y_LIMIT);

		this.drawBackground(ctx, imageLoader);
		this.drawZones(ctx);
		this.drawLinks(ctx, data);
		this.drawTowers(ctx, imageLoader);
		this.drawTroops(ctx, imageLoader, data);
		this.drawProjectiles(ctx, imageLoader);
		this.drawDragPreview(ctx, data);

		ctx.restore();
	}

	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const { State } = protocols.get();

		const object: Fields = {
			time: this.time,
			players: this.players.map(p => ({ connected: p.connected })),
			troops: this.troops.map(t => t.serialize()),
			towers: this.towers.map(t => ({ id: t.id, hp: t.hp })),
			arrows: this.arrows.map(a => ({
				id: a.id, x: a.x, y: a.y, vx: a.vx, vy: a.vy,
				targetX: a.targetX, targetY: a.targetY, damage: a.damage,
				isRed: a.team === 'red',
				targetTroopId: a.targetTroopId ?? -1,
				targetTowerId: a.targetTowerId ?? -1
			})),
			bombs: this.bombs.map(b => ({
				id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
				targetX: b.targetX, targetY: b.targetY, damage: b.damage,
				isRed: b.team === 'red', radius: b.radius
			})),
			redMana: this.manaGauges.red,
			blueMana: this.manaGauges.blue,
			nextTroopId: this.nextTroopId,
			nextProjectileId: this.nextProjectileId
		};

		return State.encode(object).finish();
	}

	override load(data: Uint8Array) {
		const { State } = protocols.get();
		const obj = decodeFullMessage(State.decode(data));

		this.time = obj.time;

		for (const [i, p] of this.players.entries()) {
			p.connected = obj.players[i]?.connected ?? false;
		}

		this.troops = obj.troops.map((t: Fields) => deserializeTroop(t));

		for (const [i, tower] of this.towers.entries()) {
			const saved = obj.towers[i];
			if (saved) tower.hp = saved.hp;
		}

		this.arrows = obj.arrows.map((a: Fields) => ({
			id: a.id, x: a.x, y: a.y, vx: a.vx, vy: a.vy,
			targetX: a.targetX, targetY: a.targetY, damage: a.damage,
			team: a.isRed ? 'red' : 'blue',
			targetTroopId: a.targetTroopId >= 0 ? a.targetTroopId : null,
			targetTowerId: a.targetTowerId >= 0 ? a.targetTowerId : null
		}));

		this.bombs = obj.bombs.map((b: Fields) => ({
			id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
			targetX: b.targetX, targetY: b.targetY, damage: b.damage,
			team: b.isRed ? 'red' : 'blue', radius: b.radius
		}));

		this.manaGauges.red = obj.redMana;
		this.manaGauges.blue = obj.blueMana;
		this.nextTroopId = obj.nextTroopId;
		this.nextProjectileId = obj.nextProjectileId;
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
		const clientData = _clientData as ClientData;
		const ret = { x: x - X_LIMIT, y: y - Y_LIMIT };
		clientData.mouseX = ret.x;
		clientData.mouseY = ret.y;
		return ret;
	}

	override getMobileDesc(): MobileDescriptor {
		// No joysticks/buttons: all interaction happens through direct drag
		// gestures on the battlefield itself (mouse or touch alike).
		return { joysticks: {}, buttons: {} };
	}

	override createTutorial() {
		return new TutorialData(this);
	}

	/** Ranks the two teams by how many of their towers are still standing.
	 *  Players within the same team are always tied with each other (2v2). */
	private produceFinish(): FinishGame {
		const redStanding = this.towers.filter(t => t.team === 'red' && t.isAlive()).length;
		const blueStanding = this.towers.filter(t => t.team === 'blue' && t.isAlive()).length;

		const redPlayers = this.players.map((_, idx) => idx).filter(idx => this.players[idx].team === 'red');
		const bluePlayers = this.players.map((_, idx) => idx).filter(idx => this.players[idx].team === 'blue');

		let results: number[][];
		const teamEqualities: number[] = [];

		if (redStanding === blueStanding) {
			results = [redPlayers, bluePlayers];
			teamEqualities.push(0);
		} else if (redStanding > blueStanding) {
			results = [redPlayers, bluePlayers];
		} else {
			results = [bluePlayers, redPlayers];
		}

		const playerEqualities: number[] = [];
		let cursor = 0;
		for (const team of results) {
			for (let i = 0; i < team.length - 1; i++) {
				playerEqualities.push(cursor + i);
			}
			cursor += team.length;
		}

		return { results, teamEqualities, playerEqualities };
	}
}
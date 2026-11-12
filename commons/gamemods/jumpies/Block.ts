import { Fields } from "../../Fields";
import { collisions } from "../../util/collisions";
import type { GMJumpies } from "../GMJumpies";
import { BlockDef } from "./defs";
import { BlockModule, createModules } from "./modules";
import { Switchable } from "./modules/Switchable";
import type { Player } from "./Player";
import { ActiveTracker, PlayersInsideTracker, RotationTracker, SpeedTracker, Tracker } from "./trackers";

type TrackerType<T extends Tracker> = new () => T;

/**
 * A runtime block, created from a BlockDef when a game is created.
 * Blocks never stop players: they only detect them.
 */
export class Block implements Switchable {
	readonly w: number;
	readonly h: number;
	x: number;
	y: number;

	private readonly trackers = new Map<TrackerType<Tracker>, Tracker>();
	readonly modules: BlockModule[];

	private readonly usesCollisions: boolean;
	private readonly playersInside: PlayersInsideTracker | null;
	private readonly activeTracker: ActiveTracker | null;
	private readonly rotation: RotationTracker | null;

	constructor(
		readonly id: number,
		readonly def: BlockDef,
		readonly playerCount: number // the units of the block depend on it
	) {
		this.w = def.w;
		this.h = def.h;
		this.x = def.x;
		this.y = def.y;

		this.modules = createModules(def, this);
		this.usesCollisions = this.modules.some(m => m.onTouch || m.onEnter);
		this.playersInside = this.modules.some(m => m.onEnter)
			? this.track(PlayersInsideTracker)
			: null;
		this.activeTracker = this.createActiveTracker();
		this.rotation = this.peek(RotationTracker);
	}

	/** Only blocks which can be switched on or off need to share their state. */
	private createActiveTracker() {
		const states = Object.values(this.def.switchStates ?? {});
		const switched = states.some(state => state.active !== undefined);
		if (!switched && !this.peek(ActiveTracker))
			return null;

		const tracker = this.track(ActiveTracker);
		tracker.active = this.def.active ?? true;
		return tracker;
	}

	/** Returns the unique tracker of this type for this block, creating it if needed. */
	track<T extends Tracker>(type: TrackerType<T>): T {
		let tracker = this.trackers.get(type) as T | undefined;
		if (!tracker) {
			tracker = new type();
			this.trackers.set(type, tracker);
		}

		return tracker;
	}

	/** Returns the tracker of this type, or null if no module of the block uses it. */
	peek<T extends Tracker>(type: TrackerType<T>): T | null {
		return (this.trackers.get(type) as T | undefined) ?? null;
	}

	/** Angle of the block around its center, in radians. */
	getAngle() {
		return this.rotation?.angle ?? 0;
	}

	isActive() {
		return this.activeTracker?.active ?? this.def.active ?? true;
	}

	/** Applies the state the level associates with this code. */
	switch(code: number) {
		const state = this.def.switchStates?.[code];
		if (!state)
			return;

		if (state.active !== undefined && this.activeTracker) {
			this.activeTracker.active = state.active;
		}

		const speed = this.peek(SpeedTracker);
		if (speed) {
			speed.vx = state.vx ?? speed.vx;
			speed.vy = state.vy ?? speed.vy;
		}
	}

	/** Detects a collision with a player. */
	private touches(player: Player) {
		if (!this.rotation)
			return collisions.RectRect(player.getRect(), this);

		const rotated = { x: this.x, y: this.y, w: this.w, h: this.h, angle: this.rotation.angle };
		return collisions.RotatedRectRect(rotated, player.getRect());
	}

	/** Lists the players who touch the block during this frame. */
	private findTouchingPlayers(game: GMJumpies) {
		if (!this.usesCollisions || !this.isActive())
			return [];

		return game.players.filter(player => player.isInGame() && this.touches(player));
	}

	/** Runs a callback on a player, unless a previous module just killed them. */
	private forEachLivingPlayer(players: Player[], callback: (player: Player) => void) {
		for (const player of players) {
			if (player.isAlive()) {
				callback(player);
			}
		}
	}

	/** Runs the modules for one simulation step. */
	frame(game: GMJumpies, dt: number) {
		for (const module of this.modules) {
			module.frame?.(this, game, dt);
		}

		const touching = this.findTouchingPlayers(game);
		const enteredIds = this.playersInside?.update(touching.map(p => p.id)) ?? [];
		const entered = enteredIds.map(id => game.players[id]);

		for (const module of this.modules) {
			if (module.onEnter) {
				this.forEachLivingPlayer(entered, p => module.onEnter!(p, this, game));
			}

			if (module.onTouch) {
				this.forEachLivingPlayer(touching, p => module.onTouch!(p, this, game, dt));
			}
		}
	}

	/** Tells the modules a player just died. */
	onPlayerDeath() {
		for (const module of this.modules) {
			module.onPlayerDeath?.(this);
		}
	}

	/** Brings the block back to the state of its definition. */
	reset() {
		this.x = this.def.x;
		this.y = this.def.y;
		if (this.activeTracker) {
			this.activeTracker.active = this.def.active ?? true;
		}

		for (const module of this.modules) {
			module.reset?.(this);
		}
	}

	/** Tells whether the block has data which can change during a game. */
	hasSharedData() {
		return this.trackers.size > 0;
	}

	/** Builds the BlockState message: the id, then one field per tracker. */
	save(): Fields {
		const state: Fields = { id: this.id };
		for (const tracker of this.trackers.values()) {
			state[tracker.key] = tracker.load(this);
		}

		return state;
	}

	/** Reads a BlockState message. */
	load(state: Fields) {
		for (const tracker of this.trackers.values()) {
			const data = state[tracker.key];
			if (data) {
				tracker.save(this, data);
			}
		}
	}
}

import { Fields } from "../../Fields";
import {
	DEATH_TIME,
	FAST_FALL_SPEED,
	GRAVITY,
	JUMP_COUNT,
	JUMP_HP_COST,
	JUMP_VELOCITY,
	MAX_SPEED,
	PLAYER_HP,
	PLAYER_SIZE,
	RESPAWN_TIME,
	SPEED_DEC,
	SPEED_INC,
	SPEED_SLOW
} from "./constants";
import type { Stage } from "./Stage";

/**
 * A player: a falling square controlled by inputs.
 * The class is purely simulation: bars and animations belong to ClientData.
 */
export class Player {
	// Set at creation from the level, never shared
	spawnX = 0;
	spawnY = 0;
	spawnRoom = 0;

	room = 0; // index in the rooms of the stage
	x = 0;
	y = 0;
	vx = 0;
	vy = 0;
	connected = true;

	hp = PLAYER_HP;
	jumps = JUMP_COUNT;

	// Arrival order. Negative while the player has not finished the level.
	finishRank = -1;

	// Negative when no death is running. See DEATH_TIME and RESPAWN_TIME.
	deathCooldown = -1;

	// False after a bounce: the player keeps their momentum instead of braking hard.
	useDefaultDeceleration = true;

	// Input state, filled by runInput and read by frame
	dirX = 0;
	fastFall = false;
	jumpRequested = false;

	constructor(
		readonly id: number,
		private readonly onDeath: () => void
	) {}

	/** Places the player on their spawn point for the first time. */
	initSpawn(x: number, y: number, room: number) {
		this.spawnX = x;
		this.spawnY = y;
		this.spawnRoom = room;
		this.respawn();
	}

	/** A player is alive from the respawn on, even if the death transition is not over. */
	isAlive() {
		return this.deathCooldown < RESPAWN_TIME;
	}

	isFinished() {
		return this.finishRank >= 0;
	}

	/** Disconnected, dead and arrived players do not exist for blocks and other players. */
	isInGame() {
		return this.connected && this.isAlive() && !this.isFinished();
	}

	/** Uses a jump, or hit points when no jump is left. */
	private consumeJump() {
		if (this.jumps > 0) {
			this.jumps = Math.max(0, this.jumps - 1);
			return;
		}

		this.hit(JUMP_HP_COST);
	}

	/** Sends a falling player back up. The stronger the fall, the more jumps it costs. */
	bounce(factor: number, cost: number) {
		if (this.vy <= 0)
			return;

		this.jumps = Math.max(0, this.jumps - cost * this.vy);
		this.vy *= -factor;
	}

	/** Gives jumps, up to the maximum. */
	restoreJumps(gain: number) {
		this.jumps = Math.min(JUMP_COUNT, this.jumps + gain);
	}

	/** Gives hit points, up to the maximum. */
	heal(gain: number) {
		this.hp = Math.min(PLAYER_HP, this.hp + gain);
	}

	/** Removes hit points and kills the player when none is left. */
	hit(damages: number) {
		if (!this.isAlive())
			return;

		this.hp -= damages;
		if (this.hp <= 0) {
			this.kill();
		}
	}

	/** Starts the death of the player and notifies the game. */
	kill() {
		if (!this.isAlive())
			return;

		this.deathCooldown = DEATH_TIME;
		this.jumpRequested = false;
		this.onDeath();
	}

	/** Brings the player back on their spawn point with a small jump. */
	private respawn() {
		this.room = this.spawnRoom;
		this.x = this.spawnX;
		this.y = this.spawnY;
		this.vx = 0;
		this.vy = -JUMP_VELOCITY;
		this.hp = PLAYER_HP;
		this.jumps = JUMP_COUNT;
		this.useDefaultDeceleration = true;
	}

	/** Runs the death cooldown and respawns the player when it reaches RESPAWN_TIME. */
	private reduceCooldown(dt: number) {
		if (this.deathCooldown < 0)
			return;

		const wasDead = !this.isAlive();
		this.deathCooldown -= dt;
		if (wasDead && this.isAlive()) {
			this.respawn();
		}

		if (this.deathCooldown < 0) {
			this.deathCooldown = -1;
		}
	}

	/** Applies the horizontal input, with the braking rules of the speed limit. */
	private moveHorizontally(dt: number) {
		if (this.dirX !== 0) {
			// Work in the direction of the input to handle left and right the same way.
			let speed = this.vx * this.dirX;
			if (speed <= MAX_SPEED) {
				this.useDefaultDeceleration = true;
			}

			if (speed < 0) {
				speed += SPEED_DEC * dt;
			}

			speed = speed <= MAX_SPEED
				? Math.min(MAX_SPEED, speed + SPEED_INC * dt)
				: Math.max(MAX_SPEED, speed - SPEED_SLOW * dt);

			this.vx = speed * this.dirX;
			return;
		}

		const brake = (this.useDefaultDeceleration ? SPEED_DEC : SPEED_SLOW) * dt;
		const speed = Math.abs(this.vx) - brake;
		if (speed > 0) {
			this.vx = speed * Math.sign(this.vx);
		} else {
			this.vx = 0;
			this.useDefaultDeceleration = true;
		}
	}

	/** Moves the player for one simulation step. */
	frame(dt: number) {
		if (!this.connected)
			return;

		// The cooldown keeps running after an arrival to end the death transition.
		this.reduceCooldown(dt);
		if (!this.isAlive() || this.isFinished())
			return;

		if (this.jumpRequested) {
			this.jumpRequested = false;
			this.consumeJump();
			this.vy = -JUMP_VELOCITY;

			// The jump can be the last hit point of the player.
			if (!this.isAlive())
				return;
		}

		this.vy += GRAVITY * dt;
		this.moveHorizontally(dt);

		this.x += this.vx * dt;
		this.y += (this.vy + (this.fastFall ? FAST_FALL_SPEED : 0)) * dt;
	}

	/**
	 * Updates the room of the player. Entering a new room gives back all the
	 * jumps, and a player who touches no room anymore is killed.
	 */
	handleRoom(stage: Stage) {
		const update = stage.update(this.getRect(), this.room);
		switch (update.code) {
			case 'new':
				this.room = update.room;
				this.jumps = JUMP_COUNT;
				break;

			case 'out':
				this.kill();
				break;
		}
	}

	/** Returns the collision box of the player (centered, like every box of the game). */
	getRect() {
		return { x: this.x, y: this.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
	}

	/** Returns every field which can change during a game. */
	save(): Fields {
		return {
			connected: this.connected,
			room: this.room,
			x: this.x,
			y: this.y,
			vx: this.vx,
			vy: this.vy,
			hp: this.hp,
			jumps: this.jumps,
			finishRank: this.finishRank,
			deathCooldown: this.deathCooldown,
			useDefaultDeceleration: this.useDefaultDeceleration,
			dirX: this.dirX,
			fastFall: this.fastFall,
			jumpRequested: this.jumpRequested
		};
	}

	/** Restores the fields returned by save. */
	load(obj: Fields) {
		this.connected = obj.connected;
		this.room = obj.room;
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.hp = obj.hp;
		this.jumps = obj.jumps;
		this.finishRank = obj.finishRank;
		this.deathCooldown = obj.deathCooldown;
		this.useDefaultDeceleration = obj.useDefaultDeceleration;
		this.dirX = obj.dirX;
		this.fastFall = obj.fastFall;
		this.jumpRequested = obj.jumpRequested;
	}
}

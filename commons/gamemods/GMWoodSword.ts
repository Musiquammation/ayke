import { MobileDescriptor } from "../../client/src/controllers/MobileController";
import { Fields } from "../Fields";
import { FinishGame, GameMode } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import {
	IKeyboardController,
	IMobileController,
	IMouseController
} from "../util/controllerInterfaces";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

/*
 * Load the protocol definitions required by this game mode.
 *
 * The "woodSword" protocol contains the messages used to synchronize
 * the game state and initialize the client.
 */
const protocols = getProtocol("woodSword", "multiplayer");

/*
 * Minimal information received when creating a server-side game.
 *
 * The actual player state is managed by the Player class below.
 */
interface PlayerInput {
	data: Uint8Array;
	pseudo: string | null;
}

/*
 * Logical dimensions of the game world.
 *
 * The coordinate system is centered on (0, 0), so:
 *   - negative X values belong to the red side;
 *   - positive X values belong to the blue side.
 */
const WIDTH = 1920;
const HEIGHT = 1080;

/*
 * Radius of the wooden trunk.
 *
 * Swords stop moving when their front reaches this radius.
 */
const TRUNK_RADIUS = 150;

/*
 * Initial X position of a newly thrown sword.
 *
 * Red swords start on the left and travel towards the right.
 * Blue swords start on the right and travel towards the left.
 */
const SWORD_SPAWN = 650;

/*
 * Constant horizontal speed of moving swords.
 */
const SWORD_SPEED = 2000;

/*
 * Visual length of a sword.
 */
const SWORD_LENGTH = 120;

/*
 * Visual thickness of a sword.
 */
const SWORD_THICKNESS = 30;

/*
 * Angular tolerance used when determining whether a newly arriving
 * sword overlaps an already embedded sword.
 *
 * PI / 12 corresponds to 15 degrees.
 */
const SWORD_HITBOX_ANGLE = Math.PI / 12;

/*
 * Number of points required by a team to win the whole game.
 */
const MAX_SCORE = 5;

/*
 * Maximum duration of a round, expressed in seconds.
 */
const ROUND_TIME = 20;

/*
 * Maximum angular acceleration of the trunk.
 *
 * The trunk does not instantly reach the requested speed.
 * Instead, its angular speed is progressively adjusted towards
 * the current target speed.
 */
const TRUNK_ACCEL = 3;

/*
 * Number of swords given to each player at the beginning of a round.
 */
const SWORDS_STREAM = [10];

/*
 * Predefined trunk movement sequence.
 *
 * Each entry specifies the angular speed that should be targeted
 * starting from the associated timestamp.
 *
 * The sequence loops indefinitely.
 */
const TRUNK_STREAM = [
	{ speed: 2, timestamp: 0 },
	{ speed: -1.5, timestamp: 3 },
	{ speed: 3, timestamp: 5 },
	{ speed: 0, timestamp: 7 }
];

/*
 * Represents a sword that has reached the trunk and is now attached
 * to it.
 *
 * The angle is stored relative to the trunk itself rather than as a
 * global world-space angle. This allows the trunk to rotate while
 * preserving the sword's position on the trunk.
 */
interface CliningSword {
	angle: number;
	team: "red" | "blue" | null;
	id: number;
}

/*
 * Represents a sword that is currently travelling horizontally
 * towards the trunk.
 */
interface MovingSword {
	x: number;
	team: "red" | "blue";
	id: number;
}

/*
 * Represents a sword that has just disappeared from the game
 * and is currently being animated as a fading sword on the client.
 *
 * This state exists only for rendering purposes.
 */
interface DyingSword {
	x: number;
	team: "red" | "blue";
	step: number;
}

/*
 * Server-side state associated with a player.
 */
class Player {
	/*
	 * Whether this player is currently connected.
	 */
	connected = true;

	/*
	 * Team assigned to the player.
	 */
	team: "red" | "blue" = "red";

	/*
	 * Number of swords the player can still throw during
	 * the current round.
	 */
	swordsLeft = 0;

	constructor() { }

	/*
	 * Restore the persistent player state from a serialized object.
	 */
	load(obj: Fields) {
		this.swordsLeft = obj.swordsLeft;
		this.connected = obj.connected;
		this.team = obj.isRed ? 'red' : 'blue';
	}
}

/*
 * Client-only state used by the renderer and HUD.
 *
 * The authoritative game state remains inside GMWoodSword.
 * ClientData only stores information required to render temporary
 * visual effects and HTML elements.
 */
class ClientData {
	/*
	 * Used to initialize first-frame-specific rendering logic.
	 */
	firstFrame = true;

	/*
	 * Swords that are currently playing their destruction/fade animation.
	 */
	dyingSwords: DyingSword[] = [];

	/*
	 * Snapshot of moving swords known during the previous frame.
	 *
	 * This allows the client to detect swords that disappeared between
	 * two frames and therefore need a death animation.
	 */
	knownMovingSwords: Map<number, MovingSword> = new Map();

	/*
	 * Root HTML element containing the game's HUD.
	 */
	readonly html: HTMLDivElement;

	/*
	 * HUD elements displaying the round timer and team scores.
	 */
	readonly time: HTMLDivElement;
	readonly redScore: HTMLDivElement;
	readonly blueScore: HTMLDivElement;

	/*
	 * HUD elements displaying the remaining swords for each team.
	 */
	readonly redSwords: HTMLDivElement;
	readonly blueSwords: HTMLDivElement;

	/*
	 * Timestamp of the previous rendering update.
	 *
	 * It is used to compute a rendering delta time independently
	 * from the simulation delta time.
	 */
	private lastTime = 0;

	constructor() {
		/*
		 * Create the root container for the game's HTML interface.
		 */
		this.html = document.createElement("div");
		this.html.classList.add("game-woodSword-root");

		/*
		 * Create the header containing scores and round timer.
		 */
		const header = document.createElement("div");
		header.classList.add("game-woodSword-header");

		this.redScore = document.createElement("div");
		this.redScore.classList.add("game-woodSword-red");

		this.time = document.createElement("div");
		this.time.classList.add("game-woodSword-time");

		this.blueScore = document.createElement("div");
		this.blueScore.classList.add("game-woodSword-blue");

		header.appendChild(this.redScore);
		header.appendChild(this.time);
		header.appendChild(this.blueScore);

		/*
		 * Create the sword counters displayed below the score header.
		 */
		const swordsPanel = document.createElement("div");
		swordsPanel.classList.add("game-woodSword-swords-panel");

		this.redSwords = document.createElement("div");
		this.redSwords.classList.add("game-woodSword-swords", "red");

		this.blueSwords = document.createElement("div");
		this.blueSwords.classList.add("game-woodSword-swords", "blue");

		swordsPanel.appendChild(this.redSwords);
		swordsPanel.appendChild(this.blueSwords);

		/*
		 * Assemble the complete HUD.
		 */
		this.html.appendChild(header);
		this.html.appendChild(swordsPanel);
	}

	/*
	 * Update all client-side HUD values and temporary visual effects.
	 */
	update(game: GMWoodSword, dt: number) {
		/*
		 * Update the round timer and team scores.
		 */
		this.time.innerText = Math.ceil(game.roundTimer).toString();
		this.redScore.innerText = `Score: ${game.redScore}`;
		this.blueScore.innerText = `Score: ${game.blueScore}`;

		/*
		 * Display the remaining swords for both players.
		 */
		this.redSwords.innerText = `Swords: ${game.players[0].swordsLeft}`;
		this.blueSwords.innerText = `Swords: ${game.players[1].swordsLeft}`;

		/*
		 * Build a map of all swords that are currently moving.
		 *
		 * Sword IDs are stable during their lifetime, which makes them
		 * suitable for detecting which swords disappeared.
		 */
		const currentMoving = new Map(
			game.movingSwords.map(s => [s.id, s])
		);

		/*
		 * Store the IDs of swords currently attached to the trunk.
		 *
		 * A sword disappearing from movingSwords is not considered
		 * destroyed if it simply became a clinging sword.
		 */
		const clingingIds = new Set(
			game.clingingSwords.map(s => s.id)
		);

		/*
		 * Compare the previous moving-sword snapshot with the current one.
		 *
		 * If a sword existed previously but is no longer moving and did
		 * not become attached to the trunk, it has been destroyed/removed.
		 */
		for (const [id, oldSword] of this.knownMovingSwords) {
			if (!currentMoving.has(id) && !clingingIds.has(id)) {
				this.dyingSwords.push({
					x: oldSword.x,
					team: oldSword.team,
					step: 0
				});
			}
		}

		/*
		 * Replace the previous snapshot with the current state.
		 */
		this.knownMovingSwords = currentMoving;

		/*
		 * Advance all sword destruction animations.
		 *
		 * The animation progresses at roughly three units per second,
		 * resulting in approximately one third of a second of animation.
		 */
		for (let i = this.dyingSwords.length - 1; i >= 0; i--) {
			this.dyingSwords[i].step += dt * 3;

			/*
			 * Remove the animation once it has completely faded out.
			 */
			if (this.dyingSwords[i].step >= 1) {
				this.dyingSwords.splice(i, 1);
			}
		}
	}
}

/*
 * Generate the client-side DOM configuration used by the game framework.
 */
function generateClientDom(_unlockedSkins: string[]) {
	return {
		/*
		 * Produce the serialized StartData message expected by the client.
		 */
		produce() {
			const { StartData } = protocols.get();
			return StartData.encode({}).finish();
		}
	};
}

/*
 * Stores tutorial-specific state.
 *
 * The tutorial is currently only a placeholder.
 */
class TutorialData {
	private step = 0;
	private wakeUp = 0;

	constructor(private readonly game: GMWoodSword) { }

	/*
	 * Advance the tutorial by one frame.
	 *
	 * This method currently returns a placeholder string.
	 */
	frame(_dt: number, _clock: number) {
		return "Hello";
	}
}

/*
 * Main game mode implementation for Wood Sword.
 *
 * The game consists of two teams throwing swords at a rotating
 * wooden trunk. Swords that arrive at an unused angular position
 * become attached to the trunk.
 */
export class GMWoodSword extends GameMode {
	/*
	 * Tell the generic game framework which data type represents
	 * a player.
	 */
	static readonly types = { Player };

	/*
	 * All players participating in the game.
	 */
	readonly players: Player[];

	/*
	 * Current score of each team.
	 */
	redScore = 0;
	blueScore = 0;

	/*
	 * Remaining time in the current round.
	 */
	roundTimer = ROUND_TIME;

	/*
	 * Current rotation angle of the trunk.
	 */
	trunkAngle = 0;

	/*
	 * Current angular velocity of the trunk.
	 */
	trunkSpeed = 0;

	/*
	 * Current position inside the predefined trunk movement stream.
	 */
	trunkStreamTime = 0;

	/*
	 * Swords currently attached to the trunk.
	 */
	clingingSwords: CliningSword[] = [];

	/*
	 * Swords currently travelling towards the trunk.
	 */
	movingSwords: MovingSword[] = [];

	/*
	 * Monotonically increasing identifier used to uniquely identify
	 * every sword created during the game.
	 */
	private nextSwordId = 1;

	/*
	 * Private constructor used internally by createServ/createClient.
	 */
	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player()
		);
	}

	/*
	 * Create the authoritative server-side game state.
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
		const { StartData, StartDataClient } = protocols.get();

		const game = new GMWoodSword(total);

		/*
		 * This game mode currently assumes a 1v1 configuration.
		 *
		 * Red spawns on the left and blue spawns on the right.
		 */
		game.players[0].team = "red";
		game.players[1].team = "blue";
		/*
		 * Give both players the configured initial number of swords.
		 */
		game.players[0].swordsLeft = SWORDS_STREAM[0];
		game.players[1].swordsLeft = SWORDS_STREAM[0];

		/*
		 * Serialize the initial player information that the client
		 * needs in order to initialize its local game representation.
		 */
		const data = StartDataClient.encode({
			players: game.players.map(p => ({
				skin: GMWoodSword.SKINS_IDS[0],
				isRed: p.team === "red"
			}))
		}).finish();

		return { game, data };
	}

	/*
	 * Create the client-side game state.
	 *
	 * The server-provided StartDataClient message is decoded to recover
	 * the initial spawn positions and team assignments.
	 */
	static createClient(
		data: Uint8Array | null,
		total: number
	) {
		const game = new GMWoodSword(total);
		const { StartDataClient } = protocols.get();
		const clientData = new ClientData();

		let skins: { [k: string]: string } = {};

		if (data) {
			/*
			 * Decode the server-provided initialization message.
			 */
			const { players } = decodeFullMessage(
				StartDataClient.decode(data)
			);

			/*
			 * Apply the initial position and team of every player.
			 */
			for (const [idx, p] of players.entries()) {
				game.players[idx].team = p.isRed ? "red" : "blue";
			}
		} else {
			/*
			 * Fallback initialization used when no server data is available.
			 */
			game.players[0].team = 'red';
			game.players[1].team = 'blue';
		}

		return {
			game,
			data: clientData,
			html: clientData.html,
			skins
		};
	}

	/*
	 * Expose the DOM generator to the generic game framework.
	 */
	static readonly generateClientDom = generateClientDom;

	/*
	 * Available skins for this game mode.
	 */
	static readonly SKINS = {};

	/*
	 * Extract the skin IDs from the skin definition object.
	 */
	static readonly SKINS_IDS = Object.keys(GMWoodSword.SKINS);

	/*
	 * Texture paths used by the renderer.
	 */
	static readonly TEXTURES = {
		wood: "/assets/games/woodSword/wood.svg",
		"sword-red": "/assets/games/woodSword/sword-red.svg",
		"sword-blue": "/assets/games/woodSword/sword-blue.svg",
		"sword-white": "/assets/games/woodSword/sword-white.svg"
	};

	/*
	 * Game initialization hook.
	 *
	 * No additional initialization is currently required.
	 */
	override init(): void { }

	/*
	 * Return the bot IDs that should be used when creating bots.
	 *
	 * The current implementation always uses player ID 0.
	 */
	override getBotIds(count: number): number[] {
		return Array.from({ length: count }, () => 0);
	}

	/*
	 * Generate a globally unique sword ID.
	 */
	private produceSwordId() {
		return this.nextSwordId++;
	}

	/*
	 * Advance the simulation by dt seconds.
	 */
	override run(
		dt: number,
		produceFinish: boolean
	): FinishGame | null {
		/*
		 * ================================================================
		 * TRUNK PHYSICS
		 * ================================================================
		 */

		/*
		 * Advance the position inside the trunk movement stream.
		 */
		this.trunkStreamTime += dt;

		/*
		 * The final timestamp defines the duration of one complete cycle.
		 */
		const cycleLength =
			TRUNK_STREAM[TRUNK_STREAM.length - 1].timestamp;

		/*
		 * Wrap the stream time so that the movement repeats indefinitely.
		 */
		const t = this.trunkStreamTime % cycleLength;

		/*
		 * Determine the angular speed currently requested by the stream.
		 */
		let targetSpeed = 0;

		/*
		 * Search backwards so that the most recent stream event
		 * before the current timestamp is selected.
		 */
		for (let i = TRUNK_STREAM.length - 2; i >= 0; i--) {
			if (t >= TRUNK_STREAM[i].timestamp) {
				targetSpeed = TRUNK_STREAM[i].speed;
				break;
			}
		}

		/*
		 * Gradually accelerate towards the target speed.
		 *
		 * The speed cannot change faster than TRUNK_ACCEL radians/second².
		 */
		if (this.trunkSpeed < targetSpeed) {
			this.trunkSpeed = Math.min(
				targetSpeed,
				this.trunkSpeed + TRUNK_ACCEL * dt
			);
		}

		if (this.trunkSpeed > targetSpeed) {
			this.trunkSpeed = Math.max(
				targetSpeed,
				this.trunkSpeed - TRUNK_ACCEL * dt
			);
		}

		/*
		 * Integrate angular velocity to obtain the new trunk angle.
		 */
		this.trunkAngle += this.trunkSpeed * dt;

		/*
		 * ================================================================
		 * MOVING SWORDS
		 * ================================================================
		 */

		/*
		 * Iterate backwards because swords can be removed from the array
		 * during the loop.
		 */
		for (
			let i = this.movingSwords.length - 1;
			i >= 0;
			i--
		) {
			const sword = this.movingSwords[i];

			/*
			 * Red swords travel towards positive X.
			 * Blue swords travel towards negative X.
			 */
			const dx =
				(sword.team === "red"
					? SWORD_SPEED
					: -SWORD_SPEED) * dt;

			sword.x += dx;

			let hit = false;

			/*
			 * Detect when a red sword reaches the left side of the trunk.
			 */
			if (
				sword.team === "red" &&
				sword.x >= -TRUNK_RADIUS
			) {
				hit = true;
				sword.x = -TRUNK_RADIUS;
			}

			/*
			 * Detect when a blue sword reaches the right side of the trunk.
			 */
			else if (
				sword.team === "blue" &&
				sword.x <= TRUNK_RADIUS
			) {
				hit = true;
				sword.x = TRUNK_RADIUS;
			}

			if (hit) {
				/*
				 * Determine the world-space angle corresponding to the
				 * side of the trunk reached by the sword.
				 *
				 * Red swords arrive from the left, corresponding to PI.
				 * Blue swords arrive from the right, corresponding to 0.
				 */
				const arrivalWorld =
					sword.team === "red"
						? Math.PI
						: 0;

				/*
				 * Convert the world-space arrival angle into the trunk's
				 * local coordinate system.
				 */
				const localAngle =
					arrivalWorld - this.trunkAngle;

				let overlap = false;

				/*
				 * Check whether another sword already occupies an angular
				 * position close enough to the new sword's position.
				 */
				for (const cs of this.clingingSwords) {
					let diff =
						(localAngle - cs.angle) %
						(2 * Math.PI);

					/*
					 * Normalize the angular difference into [-PI, PI].
					 *
					 * This is necessary because angles wrap around at
					 * 2 * PI.
					 */
					if (diff > Math.PI) {
						diff -= 2 * Math.PI;
					}

					if (diff < -Math.PI) {
						diff += 2 * Math.PI;
					}

					/*
					 * If the angular distance is below the hitbox threshold,
					 * the new sword overlaps an existing sword.
					 */
					if (
						Math.abs(diff) <
						SWORD_HITBOX_ANGLE
					) {
						overlap = true;
						break;
					}
				}

				/*
				 * Only attach the sword if its position is not already
				 * occupied by another sword.
				 */
				if (!overlap) {
					this.clingingSwords.push({
						angle: localAngle,
						team: sword.team,
						id: sword.id
					});
				}

				/*
				 * Regardless of whether the sword overlaps another sword
				 * or successfully attaches, the moving sword is removed.
				 */
				this.movingSwords.splice(i, 1);
			}
		}

		/*
		 * ================================================================
		 * ROUND MANAGEMENT
		 * ================================================================
		 */

		/*
		 * Decrease the remaining round time.
		 */
		this.roundTimer -= dt;

		/*
		 * The round is considered "all out" when:
		 *
		 *   1. every player has no swords left;
		 *   2. no sword is still travelling towards the trunk.
		 *
		 * This guarantees that all thrown swords have reached their
		 * final state before the round ends.
		 */
		const allOut =
			this.players.every(
				p => p.swordsLeft <= 0
			) &&
			this.movingSwords.length === 0;

		/*
		 * A round ends either when its timer expires or when all swords
		 * have been used and resolved.
		 */
		if (this.roundTimer <= 0 || allOut) {
			let redCount = 0;
			let blueCount = 0;

			/*
			 * Count the swords belonging to each team that are currently
			 * attached to the trunk.
			 */
			for (const cs of this.clingingSwords) {
				if (cs.team === "red") {
					redCount++;
				}

				if (cs.team === "blue") {
					blueCount++;
				}
			}

			/*
			 * Award one point to the team with the most attached swords.
			 *
			 * Equal counts result in no score change.
			 */
			if (redCount > blueCount) {
				this.redScore++;
			}

			if (blueCount > redCount) {
				this.blueScore++;
			}

			/*
			 * Check whether either team has reached the winning score.
			 */
			if (
				this.redScore >= MAX_SCORE ||
				this.blueScore >= MAX_SCORE
			) {
				/*
				 * Only produce the final result when the caller requests it.
				 */
				if (produceFinish) {
					return this.produceFinish();
				}
			} else {
				/*
				 * Start a new round.
				 */
				this.roundTimer = ROUND_TIME;

				this.clingingSwords = [];
				this.movingSwords = [];

				/*
				 * Reset the trunk to its initial state.
				 */
				this.trunkAngle = 0;
				this.trunkSpeed = 0;
				this.trunkStreamTime = 0;

				/*
				 * Refill both players' sword supplies.
				 */
				for (const p of this.players) {
					p.swordsLeft = SWORDS_STREAM[0];
				}
			}
		}

		return null;
	}

	/*
	 * Apply an input received from a player.
	 */
	override runInput(
		playerIdx: number,
		input: Fields
	): void {
		const player = this.players[playerIdx];

		/*
		 * The only gameplay action currently supported is throwing a sword.
		 *
		 * A player cannot throw if they have no swords remaining.
		 */
		if (
			input.action === "throw" &&
			player.swordsLeft > 0
		) {
			/*
			 * Consume one sword from the player's inventory.
			 */
			player.swordsLeft--;

			/*
			 * Create a new moving sword at the appropriate side
			 * of the arena.
			 */
			this.movingSwords.push({
				x:
					player.team === "red"
						? -SWORD_SPAWN
						: SWORD_SPAWN,
				team: player.team,
				id: this.produceSwordId()
			});
		}
	}

	/*
	 * Convert raw controller events into game-specific inputs.
	 */
	override collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		_data: any
	) {
		/*
		 * A throw can be triggered by:
		 *
		 *   - the space key;
		 *   - the "jump" keyboard action;
		 *   - mouse button 0;
		 *   - the mobile "throw" button.
		 */
		const wantsThrow =
			keyboard.first('jump') ||
			mouse.first(0) ||
			(mobile && mobile.getDigits().length > 0);

		const inputs: Fields[] = [];

		/*
		 * Convert the controller event into the protocol-level
		 * "throw" action.
		 */
		if (wantsThrow) {
			inputs.push({
				action: "throw",
				throw: true
			});
		}

		return inputs;
	}

	/*
	 * Render the complete game scene.
	 */
	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		_imageLoader: ImageLoader
	) {
		/*
		 * Enable smoothing for texture rendering.
		 */
		ctx.imageSmoothingEnabled = true;

		/*
		 * Retrieve all Wood Sword textures from the corresponding
		 * asset folder.
		 */
		const imageLoader =
			_imageLoader.getFolder("woodSword");

		const data = _data as ClientData;

		/*
		 * Compute a visual delta time based on the browser clock.
		 *
		 * This delta is intentionally independent from the simulation
		 * delta because it is only used for client-side visual effects.
		 */
		const now = performance.now();

		const dt = data["lastTime"]
			? (now - data["lastTime"]) / 1000
			: 0.016;

		data["lastTime"] = now;

		/*
		 * Perform first-frame initialization.
		 */
		if (data.firstFrame) {
			data.firstFrame = false;
		}

		/*
		 * Update HUD values and temporary visual effects.
		 */
		data.update(this, dt);

		/*
		 * Clear the entire game background.
		 */
		ctx.fillStyle = "#1a1a2e";
		ctx.fillRect(
			0,
			0,
			WIDTH,
			HEIGHT
		);

		/*
		 * Move the canvas origin to the center of the game world.
		 *
		 * The game uses (0, 0) as the center of the arena.
		 */
		ctx.save();
		ctx.translate(
			WIDTH / 2,
			HEIGHT / 2
		);

		// Draw a sword at the local player's spawn position when they still
		// have at least one sword available to throw.
		const player = this.players[playerIdx];

		if (player.swordsLeft > 0) {
			ctx.save();
			// Position the sword at the player's spawn point.
			ctx.translate(player.team === 'red' ? -SWORD_SPAWN : +SWORD_SPAWN, 0);

			const tex = imageLoader.get(`sword-${player.team}`);

			if (tex) {
				// Orient the sword towards the trunk.
				ctx.rotate(player.team === "red" ? 0 : Math.PI);

				ctx.drawImage(
					tex,
					-SWORD_LENGTH,
					-SWORD_THICKNESS / 2,
					SWORD_LENGTH,
					SWORD_THICKNESS
				);
			}

			ctx.restore();
		}

		/*
		 * ================================================================
		 * CLINGING SWORDS
		 * ================================================================
		 */

		/*
		 * Draw every sword currently attached to the trunk.
		 */
		for (const cs of this.clingingSwords) {
			ctx.save();

			/*
			 * Combine the sword's local angle with the trunk's current
			 * world-space rotation.
			 */
			ctx.rotate(
				cs.angle + this.trunkAngle
			);

			/*
			 * Move to the outer edge of the trunk.
			 */
			ctx.translate(
				TRUNK_RADIUS,
				0
			);

			const tex = imageLoader.get(
				cs.team
					? `sword-${cs.team}`
					: "sword-white"
			);

			if (tex) {
				/*
				 * Draw the sword so that its left edge starts at the
				 * trunk boundary and extends outward.
				 */
				ctx.drawImage(
					tex,
					0,
					-SWORD_THICKNESS / 2,
					SWORD_LENGTH,
					SWORD_THICKNESS
				);
			}

			ctx.restore();
		}

		/*
		 * ================================================================
		 * TRUNK
		 * ================================================================
		 */

		ctx.save();

		/*
		 * Apply the current trunk rotation.
		 */
		ctx.rotate(this.trunkAngle);

		const trunkTex = imageLoader.get("wood");

		if (trunkTex) {
			/*
			 * Draw the trunk texture centered at the origin.
			 */
			ctx.drawImage(
				trunkTex,
				-TRUNK_RADIUS,
				-TRUNK_RADIUS,
				TRUNK_RADIUS * 2,
				TRUNK_RADIUS * 2
			);
		} else {
			/*
			 * Fallback rendering when the texture is unavailable.
			 */
			ctx.beginPath();
			ctx.arc(
				0,
				0,
				TRUNK_RADIUS,
				0,
				2 * Math.PI
			);

			ctx.fillStyle = "#8B4513";
			ctx.fill();
		}

		ctx.restore();

		/*
		 * ================================================================
		 * MOVING SWORDS
		 * ================================================================
		 */

		/*
		 * Draw all swords that are still travelling towards the trunk.
		 */
		for (const ms of this.movingSwords) {
			ctx.save();

			/*
			 * Position the sword according to its current X coordinate.
			 */
			ctx.translate(ms.x, 0);

			const tex = imageLoader.get(
				`sword-${ms.team}`
			);

			if (tex) {
				/*
				 * Red swords are flipped horizontally because they travel
				 * from left to right.
				 *
				 * Blue swords use the default orientation.
				 */
				ctx.rotate(
					ms.team === "red"
						? Math.PI
						: 0
				);

				ctx.drawImage(
					tex,
					0,
					-SWORD_THICKNESS / 2,
					SWORD_LENGTH,
					SWORD_THICKNESS
				);
			}

			ctx.restore();
		}

		/*
		 * ================================================================
		 * DYING SWORDS
		 * ================================================================
		 *
		 * These swords are no longer part of the authoritative game state.
		 * They are rendered temporarily so that their disappearance is
		 * visually smoother.
		 */
		for (const ds of data.dyingSwords) {
			ctx.save();

			/*
			 * Fade the sword according to its animation progress.
			 */
			ctx.globalAlpha = 1 - ds.step;

			ctx.translate(ds.x, 0);

			const tex = imageLoader.get(
				`sword-${ds.team}`
			);

			if (tex) {
				ctx.rotate(
					ds.team === "red"
						? Math.PI
						: 0
				);

				ctx.drawImage(
					tex,
					0,
					-SWORD_THICKNESS / 2,
					SWORD_LENGTH,
					SWORD_THICKNESS
				);
			}

			ctx.restore();
		}

		/*
		 * Restore the original canvas transformation.
		 */
		ctx.restore();
	}

	/*
	 * Mark a player as disconnected.
	 */
	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	/*
	 * Serialize the complete authoritative game state.
	 *
	 * This state can later be restored using load().
	 */
	override save(): Uint8Array {
		const { State } = protocols.get();

		const object: Fields = {
			trunkAngle: this.trunkAngle,
			trunkSpeed: this.trunkSpeed,
			trunkStreamTime: this.trunkStreamTime,
			roundTimer: this.roundTimer,

			redScore: this.redScore,
			blueScore: this.blueScore,

			nextSwordId: this.nextSwordId,

			clingingSwords: this.clingingSwords.map(i => ({
				angle: i.angle,
				id: i.id,
				isRed: i.team === 'red',
			})),

			movingSwords: this.movingSwords.map(i => ({
				x: i.x,
				id: i.id,
				isRed: i.team === 'red',
			})),

			/*
			 * Only persistent player state is serialized.
			 */
			players: this.players.map(p => ({
				swordsLeft: p.swordsLeft,
				connected: p.connected,
				isRed: p.team === 'red'
			}))
		};

		return State.encode(object).finish();
	}

	/*
	 * Restore the authoritative game state from serialized data.
	 */
	override load(data: Uint8Array) {
		const { State } = protocols.get();

		const obj = State.decode(data);

		/*
		 * Restore the global game state.
		 */
		this.trunkAngle = obj.trunkAngle;
		this.trunkSpeed = obj.trunkSpeed;
		this.trunkStreamTime = obj.trunkStreamTime;
		this.roundTimer = obj.roundTimer;

		this.redScore = obj.redScore;
		this.blueScore = obj.blueScore;

		this.nextSwordId = obj.nextSwordId;

		/*
		 * Restore all sword states.
		 *
		 * Use an empty array if the serialized field is absent.
		 */
		this.clingingSwords = obj.clingingSwords.map((i: Fields): CliningSword => ({
			angle: i.angle,
			team: i.isRed ? 'red' : 'blue',
			id: i.id
		}));

		this.movingSwords = obj.movingSwords.map((i: Fields): MovingSword => ({
			x: i.x,
			team: i.isRed ? 'red' : 'blue',
			id: i.id
		}));

		/*
		 * Restore each player if the corresponding local player exists.
		 */
		if (obj.players) {
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
		}
	}

	/*
	 * Return the dimensions of the game rendering area.
	 */
	override getSize() {
		return {
			width: WIDTH,
			height: HEIGHT
		};
	}

	/*
	 * Convert mouse coordinates from screen coordinates into
	 * game-world coordinates.
	 *
	 * The current game uses the same coordinate system, so no
	 * transformation is necessary.
	 */
	override evalMouseCoords(
		x: number,
		y: number
	) {
		return { x, y };
	}

	/*
	 * Describe the mobile controls available for this game mode.
	 */
	override getMobileDesc(): MobileDescriptor {
		return {
			/*
			 * No virtual joystick is required because the player
			 * does not move.
			 */
			joysticks: {},

			/*
			 * A single button is used to throw a sword.
			 */
			buttons: {
				throw: {
					x: 50,
					xp: "ratio",

					y: 80,
					yp: "ratio",

					size: 150,
					color: "#ffffff"
				}
			}
		};
	}

	/*
	 * Produce the final result of the match.
	 */
	private produceFinish(): FinishGame {
		/*
		 * Determine whether each team has reached the winning score.
		 */
		const redWon =
			this.redScore >= MAX_SCORE;

		const blueWon =
			this.blueScore >= MAX_SCORE;

		/*
		 * Handle the theoretical case where both teams reach the
		 * winning score simultaneously.
		 */
		if (redWon && blueWon) {
			return {
				results: [[0, 1]],
				teamEqualities: [0],
				playerEqualities: [0]
			};
		}

		/*
		 * Red team wins.
		 */
		if (redWon) {
			return {
				results: [[0], [1]],
				teamEqualities: [],
				playerEqualities: []
			};
		}

		/*
		 * Blue team wins.
		 */
		return {
			results: [[1], [0]],
			teamEqualities: [],
			playerEqualities: []
		};
	}

	/*
	 * Create the tutorial state associated with this game mode.
	 */
	override createTutorial(): TutorialData {
		return new TutorialData(this);
	}
}

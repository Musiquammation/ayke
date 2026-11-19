import { TrustState } from "./simulation";

/* -------------------------------------------------------------------------- */
/* Tutorial: a few steps, each one validated by looking at the game state.    */
/* Player 0 is the human, the other players are bots.                         */
/* -------------------------------------------------------------------------- */

interface Step {
	text: string;
	done: (state: TrustState, t: TutorialData) => boolean;
}

const STEPS: Step[] = [
	{
		text: "Click on the game to capture the mouse, then look around with it",
		done: (s, t) => Math.abs(s.players[0].yaw - t.startYaw) > 0.5,
	},
	{
		text: "Move with Z Q S D, jump with Space",
		done: (s, t) => Math.hypot(s.players[0].x - t.startX, s.players[0].z - t.startZ) > 3,
	},
	{
		text: "The platforms are invisible! Walk off the spawn toward a glowing zone, then press E to explode: it paints everything around you, and you come back to the spawn at once",
		done: s => s.players[0].explosions > 0,
	},
	{
		text: "Your paint (and the others') stays. Follow the painted platforms, explode again to see farther. Watch out: some paths lead nowhere",
		done: (_s, t) => t.elapsed > 12,
	},
	{
		text: "Reach a zone: the first player gets 10 points, the second 5, the third 2",
		done: s => s.players[0].zones !== 0,
	},
	{
		text: "Well done! Reach the other zones before the end of the 7 minutes",
		done: (_s, t) => t.elapsed > 8,
	},
];

export class TutorialData {
	private step = 0;
	startX = 0;
	startZ = 0;
	startYaw = 0;
	/** Time spent on the current step (seconds). */
	elapsed = 0;

	constructor(private readonly state: TrustState) {
		this.restart();
	}

	/** Returns the text to display (empty once the tutorial is over). */
	frame(dt: number, _clock: number) {
		if (this.step >= STEPS.length)
			return "";

		this.elapsed += dt;
		if (STEPS[this.step].done(this.state, this)) {
			this.step++;
			this.restart();
		}

		return this.step < STEPS.length ? STEPS[this.step].text : "";
	}

	/** Remember where the player is at the start of a step. */
	private restart() {
		const self = this.state.players[0];
		this.startX = self?.x ?? 0;
		this.startZ = self?.z ?? 0;
		this.startYaw = self?.yaw ?? 0;
		this.elapsed = 0;
	}
}

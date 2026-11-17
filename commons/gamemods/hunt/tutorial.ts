import { ITEM_NONE, WEAPONS } from "./constants";
import { HuntState } from "./simulation";

/* -------------------------------------------------------------------------- */
/* Tutorial: a few steps, each one validated by looking at the game state.    */
/* Player 0 is the human, the other players are bots.                         */
/* -------------------------------------------------------------------------- */

const STEPS: { text: string; done: (state: HuntState, t: TutorialData) => boolean }[] = [
	{
		text: "Move with Z Q S D",
		done: (s, t) => Math.hypot(s.players[0].x - t.startX, s.players[0].y - t.startY) > 200,
	},
	{
		text: "Jump with Space (you can climb on crates)",
		done: s => s.players[0].z > 20,
	},
	{
		text: "Hold left click to shoot. Every weapon has its own ammo (shown above its name). Switch weapons with 1, 2, 3 or the wheel",
		done: s => s.players[0].ammo.some((a, i) => a < WEAPONS[i].startAmmo),
	},
	{
		text: "Hold Shift while the blue indicator is on an enemy to lock it: your shots go straight at it (jump with Q / D while locked for a fast side jump)",
		done: (_s, t) => t.elapsed > 8,
	},
	{
		text: "Break a box to get an item (bomb, ice bomb, shells, super jump) and ammo: walk on them to pick them up. Hold right click to see its path, release it to use the item (1-4 or wheel select it while right click is held, middle click cancels)",
		done: s => s.players[0].items.some(i => i !== ITEM_NONE) || s.players[0].kills > 0,
	},
	{
		text: "Get 10 kills before everybody else!",
		done: (_s, t) => t.elapsed > 6,
	},
];

export class TutorialData {
	private step = 0;
	startX = 0;
	startY = 0;
	/** Time spent on the current step. */
	elapsed = 0;

	constructor(private readonly state: HuntState) {
		this.startX = state.players[0].x;
		this.startY = state.players[0].y;
	}

	/** Returns the text to display (empty once the tutorial is over). */
	frame(dt: number, _clock: number) {
		if (this.step >= STEPS.length)
			return "";

		this.elapsed += dt;
		const current = STEPS[this.step];
		if (current.done(this.state, this)) {
			this.step++;
			this.elapsed = 0;
			this.startX = this.state.players[0].x;
			this.startY = this.state.players[0].y;
		}

		return this.step < STEPS.length ? STEPS[this.step].text : "";
	}
}

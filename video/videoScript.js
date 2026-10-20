function initScript(game) {
	
}
function scheduleActions() {}



let lastStep = -1;

function script(now, game, clientData, bots) {
	const PLAYER_SPEED = 1500;
	const PLAYER_JUMP = 800;

	const players = game.players;
	const ball = game.ball;

	const inputs = [];

	const STEPS = [
		// Startup
		{
			start: 0,
			perform(t, first) {
				// Setup
				if (first) {
					for (const p of game.buckets) {
						p.team = 'red';
					}

					game.buckets[7].team = null;
					
					const positions = [
						{x: -500, y: -200},
						{x: +500, y: -200},
						{x: -300, y: 200},
						{x: +300, y: 200},
					];

					for (let [i, p] of game.players.entries()) {
						p.x = positions[i].x;
						p.y = positions[i].y;
						p.vx = 0;
						p.vy = -90;
					}

					clientData.camera.teleport(0, 0);
				}

				/// TODO: make bots to play
				for (const {playerIdx, bot} of bots) {
					for (const input of bot.play(game)) {
						inputs.push({playerIdx, ...input});
					}
				}
			}
		},

		{
			start: 2,
			perform(t, first) {

			}
		}
	];

	const stepIndex = STEPS.findLastIndex(step => now >= step.start);
	if (stepIndex === -1) return;

	const first = lastStep !== stepIndex;
	lastStep = stepIndex;

	STEPS[stepIndex].perform(now - STEPS[stepIndex].start, first);

	return inputs;
}
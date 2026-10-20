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

	function playBot(bot) {
		for (const input of bot.bot.play(game)) {
			inputs.push({playerIdx: bot.playerIdx, ...input});
		}
	}

	function placeMouse() {
		const grabber = game.players[0];
		const ix = Math.trunc(grabber.x * 2/2400);
		const iy = Math.trunc(grabber.y * 2/1350);
		const tx = Math.sign(ix) * Math.ceil(Math.abs(ix) / 2) * 2400;
		const ty = Math.sign(iy) * Math.ceil(Math.abs(iy) / 2) * 1350;
		clientData.mouseX = tx;
		clientData.mouseY = ty;
	}

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
						{x: -300, y: 200},
						{x: -800, y: -200},
						{x: +600, y: 200},
						{x: +800, y: -200},
					];

					for (let [i, p] of game.players.entries()) {
						p.x = positions[i].x;
						p.y = positions[i].y;
						p.vx = 0;
						p.vy = -90;
					}

					clientData.camera.teleport(0, 0);
				}

				// Bots play
				for (const bot of bots) {
					if (t < 2 || (t < 2.37 && bot.playerIdx <= 1)) {
						playBot(bot);
					} else {
						const player = game.players[bot.playerIdx];
						player.target = {
							type: 'fixed',
							x: 2400,
							y: 0
						};

						if (t > 2.5)
							player.dir = -1;

						if (player.vy > 0) {
							player.vy = -800;
						}
					}
				}


				
				placeMouse();
			}
		},

		// Game too easy
		{
			start: 3.2,
			perform(t, first) {
				if (first) {
					for (const bucket of game.buckets) {
						bucket.team = 'red';
					}
					game.buckets[8].team = null;

					game.ball.x = 0;
					game.ball.y = 0;
					game.ball.vx = 0;
					game.ball.vy = -20;

					const player = game.players[0];
					player.x = -1200;
					player.y = 200;
					player.vx = 500;
					player.vy = 0;
					player.dir = 1;
					player.target = null;

					game.players[1].x = 1400;
					game.players[1].y = 0;

					game.players[2].x = 2000;
					game.players[2].y = -500;

					game.players[3].x = 2700;
					game.players[3].y = 500;
				}

				const player = game.players[0];

				if (player.x < 3700) {
					player.vx = 1500;
					player.dir = 1;
				}

				clientData.mouseX = Math.floor(game.players[0].x / 2400) * 2400;

				if (player.y > 400) {
					player.vy = -800;
				}

				// clientData.camera.teleport(-1200 + 50 * t, 0);

				for (const bot of bots) {
					if (bot.playerIdx >= 1 || player.x >= 3700) {
						playBot(bot);
					}
				}

				placeMouse();
			}
		},

		// Cannot jump while holding the ball
		{
			start: 8.5,
			perform(t, first) {
				if (first) {
					for (const bucket of game.buckets) {
						bucket.team = null;
					}

					game.ball.x = 0;
					game.ball.y = 0;
					game.ball.vx = 0;
					game.ball.vy = -20;
					game.ball.prevGrabber = -1

					game.players[0].x = 0;
					game.players[0].y = -500;
					game.players[0].vx = 0;
					game.players[0].dir = 0;
					game.players[0].vy = -90;

				}

				for (let i = 1; i < 4; i++) {
					game.players[i].x = 2400;
					game.players[i].y = 0;
					game.players[i].vx = 0;
					game.players[i].vy = 0;
				}

				placeMouse();

				if (game.players[0].y > 1800 && game.ball.grabber === 0) {
					game.players[0].target = {
						type: 'fixed',
						x: 600,
						y: 1350
					};
				}

			}
		},

		// 
		{
			start: 12.5,
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
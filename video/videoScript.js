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
		// Presentation
		{
			start: 0,
			perform(t, first) {
				if (first) {
					game.ball.x = 0;
					game.ball.y = 0;
					game.ball.vx = 0;
					game.ball.vy = -20;
					game.ball.grabber = -1;
					game.ball.prevGrabber = -1;

					
					
				}

				for (const p of game.buckets) {
					p.team = 'red';
				}

				game.buckets[7].team = null;
				game.buckets[0].team = null;


				const p = game.players[0];
				p.dir = 1;

				if (p.y > 100)
					p.vy = -800;


				placeMouse();
				
				const positions = [
					{x: -300, y: 200},
					{x: -800, y: -200},
					{x: +600, y: 200},
					{x: +800, y: -200},
				];

				for (let [i, p] of game.players.entries()) {
					if (i == 0) continue;
					p.x = positions[i].x;
					p.y = positions[i].y;
					p.vx = 0;
					p.vy = -90;
				}
				
			}
		},

		// Game
		{
			start: 2.8,
			perform(t, first) {
				// Setup
				if (first) {
					for (const p of game.buckets) {
						p.team = 'red';
					}

					game.buckets[7].team = null;
					game.buckets[0].team = null;

					game.ball.x = 0;
					game.ball.y = 0;
					game.ball.vx = 0;
					game.ball.vy = -20;
					game.ball.grabber = -1;
					game.ball.prevGrabber = -1;
					
					const positions = [
						{x: -300, y: 200},
						{x: -800, y: -200},
						{x: +600, y: 200},
						{x: +800, y: -200},
					];

					for (let [i, p] of game.players.entries()) {
						p.vx = 0;
						p.vy = -90;
						p.y = positions[i].y;
						p.x = positions[i].x;
					}

					clientData.camera.teleport(0, 0);
				}

				// Bots play
				for (const bot of bots) {
					if (t < 2 || (t < 2.37 && bot.playerIdx <= 1) || t >= 3) {
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
			start: 7.8,
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
					game.ball.grabber = -1;
					game.ball.prevGrabber = -1;

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

				if (player.y > 400 || player.x >= 4300) {
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
			start: 12.8,
			perform(t, first) {
				if (first) {
					for (const bucket of game.buckets) {
						bucket.team = null;
					}

					game.ball.x = 0;
					game.ball.y = 0;
					game.ball.vx = 0;
					game.ball.vy = -20;
					game.ball.grabber = -1
					game.ball.prevGrabber = -1

					game.players[0].x = 0;
					game.players[0].y = -500;
					game.players[0].vx = 0;
					game.players[0].vy = -500;
					game.players[0].dir = 0;

					clientData.camera.teleport(0, 0);

				}

				if (t <= .1) {
					game.players[0].vy = -1000;
				}

				for (let i = 1; i < 4; i++) {
					game.players[i].alive = 0.1;
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

		// Passing the ball to a teammate
		{
			start: 16.1,
			perform(t, first) {
				const passer = game.players[0];
				const teammate = game.players[2];

				if (first) {
					for (const bucket of game.buckets) {
						bucket.team = 'red';
					}
					clientData.camera.teleport(0, 0);

					game.buckets[8].team = null;

					game.ball.x = 0;
					game.ball.y = -300;
					game.ball.vx = 0;
					game.ball.vy = 0;
					game.ball.grabber = -1;
					game.ball.prevGrabber = -1;

					passer.x = -700;
					passer.y = 0;
					passer.vx = 0;
					passer.vy = -800;
					passer.dir = 1;
					passer.target = null;
					passer.alive = -1;
					passer.grabber = false;
					passer.pushDown = false;

					teammate.x = 2700;
					teammate.y = 1350 * 2.4;
					teammate.vx = 0;
					teammate.vy = -1300;
					teammate.dir = 0;
					teammate.target = null;

					game.players[1].x = -5000;
					game.players[1].y = 300;
					game.players[3].x = -5000;
					game.players[3].y = 300;
				}


				if (t <= 1.5) {
					teammate.x = 2900 - 1.26 * 1500;
					teammate.y = 1350;
					teammate.vy = -2000;
					teammate.dir = 0;
				} else if (t <= 3) {
					teammate.dir = 1;
				}

				if (t >= 2 && t < 2.2) {
					passer.target = {
						type: 'fixed',
						x: 4800,
						y: -2700
					};
				}

				if (t >= 1.9 && t <= 2.4) {
					passer.vy = -800;
				}


				if (t >= 4) {
					playBot(bots[2]);
				}

				placeMouse();
			}
		},

		{
			start: 21.5,
			perform(t, first) {
				if (first) {
					for (const bucket of game.buckets) {
						bucket.team = null;
					}
					game.buckets[11].team = 'red';
					game.buckets[12].team = 'blue';
					clientData.camera.teleport(0, 0);
					
					game.ball.x = 0;
					game.ball.y = -200;
					game.ball.vx = 0;
					game.ball.vy = -50;
				
					const positions = [
						{x: -600, y: 200},
						{x: -1000, y: -200},
						{x: +800, y: 200},
						{x: +1000, y: -200},
					];

					for (let [i, p] of game.players.entries()) {
						p.x = positions[i].x;
						p.y = positions[i].y;
						p.vx = 0;
						p.vy = -90;
						p.alive = -1;
					}
				}

				for (const bot of bots) {
					playBot(bot);
				}

				placeMouse();
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
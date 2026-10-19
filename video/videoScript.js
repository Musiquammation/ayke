function initScript(game) {
	const players = game.players;

	const positions = [
		[-320, 100],
		[320, 100],
		[-520, 250],
		[520, 250]
	];

	for (let i = 0; i < players.length; i++) {
		const p = players[i];

		p.x = positions[i][0];
		p.y = positions[i][1];
		p.vx = 0;
		p.vy = 0;
		p.alive = -1;
	}

	game.ball.x = 0;
	game.ball.y = 0;
	game.ball.vx = 0;
	game.ball.vy = 0;
	game.ball.grabber = -1;
	game.ball.prevGrabber = -1;
}
function scheduleActions() {}


function script(game, now) {
	const PLAYER_SPEED = 1500;
	const PLAYER_JUMP = 800;

	const players = game.players;
	const ball = game.ball;

	
}

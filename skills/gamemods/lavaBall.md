GMLavaBall
id: lavaBall

## GAME

2v2 game.

Class: `GMLavaBall`
ID: `lavaBall`

## CONCEPT

A vertical game, playable on both mobile and PC, where there is a ball that each player must throw when it is their turn.

The game is therefore turn-based.

The objective is to take the ball as high as possible in a procedurally generated level made of platforms, while avoiding moving obstacles such as rotating rectangles and circles.

The levels are vertical.

## MISSION

Obstacles may or may not be affected by gravity. All obstacles must spawn outside the screen, at random positions.

To generate obstacles, the server checks every `0.85` seconds whether or not it should spawn a new obstacle. Create a constant for this interval.

When an obstacle is selected for spawning, it is stored as a `WaitingObstacle`. The `WaitingObstacle` must be synchronized through the `.proto` and therefore included in `save`/`load`.

The obstacle is actually spawned `1` second later. Create a constant for this delay.

All obstacles must be drawn in red.

### Turn timing

A turn proceeds as follows. A timer is displayed on the client, showing only the remaining seconds:

* `1s` during which the player does nothing.
* `3s` during which the player can aim.

  * During this aiming phase, all game actions are slowed down.
  * The game speed is `0.2`.
  * The transition into and out of slow motion must be progressive rather than instantaneous.
  * Create a function mapping `t ∈ [0, 3]` to `[0.2, 1]` for this transition.
* `1s` during which the player does nothing again.

The complete turn therefore lasts `5` seconds.

If a player dies during their turn, the next turn must still begin only after the normal cooldown has elapsed.

When a player dies, the next round must be started after a delay.

The turn system must therefore support restarting rounds whenever necessary.

### Player elimination and scoring

During a player's turn, the player loses if the ball:

* collides with a red obstacle, or
* leaves the screen vertically, i.e.:
  `ball.y <= yLevel - SCREEN_HEIGHT / 2`.

When a player loses, their score is set to the current `yLevel`.

If only one player remains alive, that player wins `1.2 * yLevelOfTheSecondPlayer`. Create a constant for this multiplier.

The first player to reach `10,000` points wins. Create a constant for this score limit.

Create `yLevel`, which is equal to the maximum value of `ball.y` reached at any frame.

On the client, the camera must be centered at:

```ts
x = 0
y = yLevel
```

The ball can bounce off the side walls.

### Level height

Levels are vertical and have a maximum height of `5000`.

Create a constant for this maximum level height.

When a player reaches `y = 5000`:

* that player immediately wins `5000` points;
* all players who have not been eliminated receive `0` points for that round.

The player who reaches `5000` therefore wins the round immediately.

## BALL THROWING

Use the following function to calculate the initial velocity required to reach a target:

```ts
// Computes the initial velocity vector required for a projectile
// starting at the origin (0, 0) to reach the target position (X, Y)
// with an initial speed of N and a constant gravitational acceleration g.
//
// The function returns success = true when a valid ballistic trajectory
// exists. When no valid trajectory can be found, it returns a fallback
// vector pointing approximately toward the target.
function getVectorToReachTarget(
	X: number,
	Y: number,
	N: number,
	g: number
): { x: number, y: number, success: boolean } {
	if (X === 0) {
		return { x: 0, y: Y > 0 ? N : -N, success: false };
	}

	const X2 = X * X;
	const Y2 = Y * Y;
	const N2 = N * N;
	const g2 = g * g;

	const delta = X2 * (N2 * N2 + 2 * N2 * g * Y - g2 * X2);

	function fail() {
		const n = N / Math.sqrt(X2 + Y2);
		return { x: X * n, y: Y * n, success: false };
	}

	if (delta < 0) {
		return fail();
	}

	const a = X2 + Y2;
	const b = -X2 * (N2 + g * Y);

	const S = (-b + Math.sqrt(delta)) / (2 * a);

	if (S <= 0) {
		return fail();
	}

	const v0 = Math.sign(X) * Math.sqrt(S);
	const w0 = (v0 / X) * (Y - (g * X2) / (2 * S));

	return { x: v0, y: w0, success: true };
}
```

## AIMING VISUALIZATION

Draw the player's aiming trajectory using the following function:

```ts
function drawPlayerToTarget(
	ctx: CanvasRenderingContext2D,
	srcX: number,
	srcY: number,
	destX: number,
	destY: number,
	color: string | boolean
) {
	const X = destX - srcX;
	const Y = destY - srcY;

	let radius: number;
	let lineWidth: number;
	let outline = false;

	if (color === true) {
		lineWidth = 5;
		ctx.strokeStyle = "black";
		color = "black";
		radius = 5;
	} else if (color === false) {
		lineWidth = 4;
		ctx.strokeStyle = "grey";
		color = "grey";
		radius = 4;
	} else {
		lineWidth = 10;
		ctx.strokeStyle = color;
		radius = 10;
		outline = true;
	}

	// Draw target circle
	if (outline) {
		ctx.beginPath();
		ctx.arc(destX, destY, radius + 2, 0, Math.PI * 2);
		ctx.lineWidth = lineWidth + 4;
		ctx.strokeStyle = "black";
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(destX, destY, radius, 0, Math.PI * 2);
		ctx.lineWidth = lineWidth;
		ctx.strokeStyle = color;
		ctx.stroke();
	} else {
		ctx.beginPath();
		ctx.arc(destX, destY, radius, 0, Math.PI * 2);
		ctx.stroke();
	}

	const velocity = getVectorToReachTarget(
		X,
		Y,
		Player.THROW,
		Ball.GRAVITY
	);

	// Unable to calculate a valid trajectory
	if (velocity.x === 0 || !velocity.success) {
		const dx = destX - srcX;
		const dy = destY - srcY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance === 0) {
			return;
		}

		// Start 40 pixels away from the player so that the trajectory
		// does not visually overlap the player itself.
		const startX = srcX + dx / distance * 40;
		const startY = srcY + dy / distance * 40;

		ctx.beginPath();
		ctx.moveTo(startX, startY);
		ctx.lineTo(destX, destY);

		if (outline) {
			ctx.lineWidth = lineWidth + 4;
			ctx.strokeStyle = "black";
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo(startX, startY);
			ctx.lineTo(destX, destY);

			ctx.lineWidth = lineWidth;
			ctx.strokeStyle = color;
			ctx.stroke();
		} else {
			ctx.stroke();
		}

		return;
	}

	const vx = velocity.x;
	const vy = velocity.y;
	const g = Ball.GRAVITY;

	// Compute the time required for the projectile to reach the target X.
	const T = X / vx;

	if (T <= 0) {
		return;
	}

	// Use multiple points to approximate the ballistic trajectory
	// with a smooth line.
	const steps = 50;

	// Calculate the complete trajectory before drawing anything.
	const points: { x: number; y: number }[] = [];

	for (let i = 0; i <= steps; i++) {
		const t = T * i / steps;

		const x = srcX + vx * t;
		const y = srcY + vy * t + (g / 2) * t * t;

		points.push({ x, y });
	}

	// Find the first point that is at least 40 pixels away from
	// the player's position. This prevents the trajectory from
	// being drawn directly underneath the player.
	let startIndex = 0;

	for (let i = 1; i < points.length; i++) {
		const dx = points[i].x - srcX;
		const dy = points[i].y - srcY;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance >= 40) {
			startIndex = i;
			break;
		}
	}

	const drawCurve = () => {
		ctx.beginPath();
		ctx.moveTo(points[startIndex].x, points[startIndex].y);

		for (let i = startIndex + 1; i < points.length; i++) {
			ctx.lineTo(points[i].x, points[i].y);
		}

		ctx.stroke();
	};

	// Draw a black outline around colored trajectories to keep them
	// clearly visible against platforms and the game background.
	if (outline) {
		ctx.lineWidth = lineWidth + 4;
		ctx.strokeStyle = "black";
		drawCurve();
	}

	// Draw the actual colored trajectory on top of the outline.
	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color as string;
	drawCurve();
}
```

## TURN INDICATOR

Display whose turn it currently is.

Display the four players as:

```text
1 2 3 4
```

The player controlled by the local client must be displayed as `M` instead of their player number.

For example, if the local player is player `2`:

```text
1 M 3 4
```

Each player must be displayed using their team color:

* red for the red team;
* blue for the blue team.

Underline the player whose turn it currently is.

If a player has been eliminated, display them in grey while preserving their original team color in some way. For example, their red/blue identity should remain visually recognizable even though the player is greyed out.

The turn indicator must therefore communicate three pieces of information simultaneously:

* which player is which;
* which player belongs to which team;
* which player is currently playing.

## SCORE DISPLAY

Display the score of every player on the side of the screen.

The score display must remain visible while the camera moves vertically.

Scores should clearly correspond to players `1`, `2`, `3`, and `4`, using the same player/team colors as the turn indicator.

## ROUNDS

The game must support multiple rounds.

When a player is eliminated, do not immediately start the next turn. The current turn must continue through its normal cooldown.

After the round ends, wait for a short delay before starting the next round.

During this delay, the client should clearly indicate that the round has ended and prepare the next round.

The round system must correctly handle:

* a player dying during their turn;
* multiple players being eliminated during the same round;
* only one player remaining;
* a player reaching `5000`;
* restarting the game state for the next round;
* preserving accumulated scores between rounds;
* stopping the round immediately when its win condition is reached.

## CODE QUALITY

Be verbose with comments.

All comments must be written in English.

Create named constants for every gameplay value explicitly requested above rather than using magic numbers directly in the game logic.

Keep the server authoritative for:

* obstacle generation;
* obstacle spawn timing;
* random decisions;
* player elimination;
* `yLevel`;
* scoring;
* turn order;
* round transitions;
* win conditions.

The client should only visualize the state and send the player's aiming/throw input when appropriate.

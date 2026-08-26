import { Fields } from "../Fields";
import { GameMode, IKeyboardController, IMouseController } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";

const protocols = getProtocol('airbasket');

interface PlayerInput {
	data: Fields;
}

const GRAVITY = 1200;
const WIDTH = 1600;
const HEIGHT = 900;

const X_LIMIT = WIDTH * 2.5;
const Y_LIMIT = HEIGHT * 1.5;

const COLORS = [
	["#ff4f99", "#ff9b7a", "#ffffff", "#7199ff", "#4f99ff"],
	["#ff0770", "#ff7744", "#ffffff", "#4477ff", "#0077ff"],
	["#cc0059", "#cc5f36", "#cccccc", "#365fcc", "#005fcc"]
];

class Ball {
	static readonly RADIUS = 20;
	static readonly SPAWN_JUMP = 20;
	static readonly GRAVITY = 500;
	static readonly EJECT = 1200;

	x = 0;
	y = 0;
	vx = 0;
	vy = -Ball.SPAWN_JUMP;

	grabber = -1;
	prevGrabber = -1;

	move(dt: number) {
		if (this.grabber >= 0) {
			return; // ball is grabbed
		}

		this.vy += Ball.GRAVITY * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;

		if (this.isOOB()) {
			this.reset();
		}
	}

	reset() {
		this.x = 0;
		this.y = 0;
		this.vx = 0;
		this.vy = -Ball.SPAWN_JUMP;
	}

	load(obj: Fields) {
		if (obj.ball === 'freeBall') {
			this.x = obj.freeBall.x;
			this.y = obj.freeBall.y;
			this.vx = obj.freeBall.vx;
			this.vy = obj.freeBall.vy;
			this.grabber = -1;
		} else {
			this.grabber = obj.grabbedBall.owner;
		}

		this.prevGrabber = obj.prevBallGrabber;
	}

	isOOB() {
		return (
			this.x < -X_LIMIT + Ball.RADIUS/2 ||
			this.x > X_LIMIT - Ball.RADIUS/2 ||
			this.y < -Y_LIMIT + Ball.RADIUS/2 ||
			this.y > Y_LIMIT - Ball.RADIUS/2
		);
	}

	removeGrabber() {
		this.prevGrabber = this.grabber;
		this.grabber = -1;
	}

	eject() {
		this.removeGrabber();
		
		if (this.y <= -HEIGHT) {
			this.vy = 0;
		} else {
			this.vy = -Ball.EJECT;
		}

		if (this.x < -WIDTH) {
			this.vx = Ball.EJECT;
		}

		if (this.x > WIDTH) {
			this.vx = -Ball.EJECT;
		}


		// Place correctly
		if (this.x > X_LIMIT - Ball.RADIUS/2) {
			this.x = X_LIMIT - Ball.RADIUS/2;
		} else if (this.x < -X_LIMIT + Ball.RADIUS/2) {
			this.x = -X_LIMIT + Ball.RADIUS/2;
		}

		if (this.y > Y_LIMIT - Ball.RADIUS/2) {
			this.y = Y_LIMIT - Ball.RADIUS/2;
		} else if (this.y < -Y_LIMIT + Ball.RADIUS/2) {
			this.y = -Y_LIMIT + Ball.RADIUS/2;
		}
	}
}

class Player {
	static readonly SPEED = 1000;
	static readonly ACCELERATION = 5000;
	static readonly SOFT_DECELERATION = 8000;
	static readonly QUICK_DECELERATION = 20000;
	static readonly JUMP = 900;
	static readonly SPAWN_JUMP = 90;
	static readonly COOLDOWN = 1.5;
	static readonly WIDTH = 20;
	static readonly HEIGHT = 40;
	static readonly PUSH_DOWN = 1000;

	spawnX: number | null = null;
	spawnY: number | null = null
	connected = true;
	alive = -1;
	vx = 0;
	vy = -Player.SPAWN_JUMP;
	dir = 0;
	pushDown = false;

	constructor(
		public x: number,
		public y: number
	) {
	}

	initSpawn(x: number, y: number) {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
	}

	isAlive() {
		return this.alive < 0;
	}

	move(dt: number) {
		if (this.alive >= 0) {
			this.alive -= dt;
			if (this.alive >= 0)
				return;

			if (this.spawnX !== null) {this.x = this.spawnX;}
			if (this.spawnY !== null) {this.y = this.spawnY;}
		}


		// Set vx
		if (this.dir === 0) {
			if (this.vx > 0) {
				this.vx -= Player.SOFT_DECELERATION * dt;
				if (this.vx < 0) this.vx = 0;
			} else if (this.vx < 0) {
				this.vx += Player.SOFT_DECELERATION * dt;
				if (this.vx > 0) this.vx = 0;
			}
		} else if (this.dir > 0) {
			if (this.vx < 0) {
				this.vx += Player.QUICK_DECELERATION * dt;
				if (this.vx > 0) this.vx = 0;
			} else if (this.vx < Player.SPEED) {
				this.vx += Player.ACCELERATION * dt;
				if (this.vx > Player.SPEED) this.vx = Player.SPEED;
			}
		} else /*if (this.dir < 0)*/ {
			if (this.vx > 0) {
				this.vx -= Player.QUICK_DECELERATION * dt;
				if (this.vx < 0) this.vx = 0;
			} else if (this.vx > -Player.SPEED) {
				this.vx -= Player.ACCELERATION * dt;
				if (this.vx < -Player.SPEED) this.vx = -Player.SPEED;
			}
		}
		
		this.vy += GRAVITY * dt;

		this.x += this.vx * dt;
		this.y += this.vy * dt;

		if (this.pushDown) {
			this.y += Player.PUSH_DOWN * dt;
		}

		if (this.isOOB()) {
			this.die();
		}
	}

	touchsBall(ball: Ball) {
		return collisions.RectCircle({
			x: this.x,
			y: this.y,
			w: Player.WIDTH,
			h: Player.HEIGHT,
		}, {
			x: ball.x,
			y: ball.y,
			r: Ball.RADIUS,
		});
	}


	load(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.vx = obj.vx;
		this.vy = obj.vy;
		this.dir = obj.dir;
		this.alive = obj.alive;
		this.pushDown = obj.pushDown;
	}

	isOOB() {
		return (
			this.x < -X_LIMIT + Player.WIDTH/2 ||
			this.x > X_LIMIT - Player.WIDTH/2 ||
			this.y < -Y_LIMIT + Player.HEIGHT/2 ||
			this.y > Y_LIMIT - Player.HEIGHT/2
		);
	}

	die() {
		this.vx = 0;
		this.vy = -Player.SPAWN_JUMP;
		this.alive = Player.COOLDOWN;
	}
}






export class GMAirBasket extends GameMode {
	static readonly types = {Player};

	readonly players: Player[];
	readonly ball = new Ball();

	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0)
		);
	}

	static createServ(players: PlayerInput[], total: number) {
		const game = new GMAirBasket(total);
		const invParts =  1/(total/2 + 1);
		for (const [i, p] of game.players.entries()) {
			const redTeam = (i % 2 === 0);
			p.initSpawn(
				redTeam ? -WIDTH : WIDTH,
				((i+1)*invParts - .5) * HEIGHT
			);
		}

		const data = new Uint8Array();

		return {
			game,
			data
		}
	}

	static createClient(data: Uint8Array, total: number) {
		const g = new GMAirBasket(total);
		return g;
	}

	override init(): void {
		
	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
	}

	override run(dt: number): boolean {
		// Move
		for (const p of this.players) {
			p.move(dt);
		}

		// Eject ball from dead player
		if (this.ball.grabber >= 0) {
			const grabber = this.players[this.ball.grabber];
			if (!grabber.isAlive()) {
				this.ball.eject();
			}
		}

		this.ball.move(dt);
		if (this.ball.grabber >= 0) {
			const grabber = this.players[this.ball.grabber];
			this.ball.x = grabber.x;
			this.ball.y = grabber.y;

		}

		// Grab ball
		if (this.ball.grabber < 0) {
			let grabber = -1;
			for (const [i, p] of this.players.entries()) {
				if (i !== this.ball.prevGrabber && p.touchsBall(this.ball)) {
					if (grabber >= 0) {
						// Only one grabber is allowed
						grabber = -1; 
						break;
					}

					grabber = i;
				}
			}

			if (grabber >= 0) {
				this.ball.grabber = grabber;
			}
		}

		return false;
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		switch (input.action) {
			case 'right':
				player.dir = 1;
				break;

			case 'left':
				player.dir = -1;
				break;

			case 'stop':
				player.dir = 0;
				break;

			case 'jump':
				player.vy = -Player.JUMP;
				break;

			case 'downOn':
				player.pushDown = true;
				break;

			case 'downOff':
				player.pushDown = false;
				break;
		}
	}

	override collectInputs(keyboard: IKeyboardController, mouse: IMouseController) {
		function getMoveInput(): Fields|null {
			const r0 = keyboard.first('right');
			const l0 = keyboard.first('left');

			const right = {right: {}, action: 'right'};
			const left = {left: {}, action: 'left'};
			const stop = {stop: {}, action: 'stop'};
	
			if (r0 && !l0)
				return right;
			
			if (!r0 && l0)
				return left;
			
			if (r0 && l0)
				return stop;
	
			const rK = keyboard.killed('right');
			const lK = keyboard.killed('left');

			if (rK && lK)
				return stop;

			const r = keyboard.press('right');
			const l = keyboard.press('left');

			if (rK) {
				return l ? left : stop;
			}

			if (lK) {
				return r ? right : stop;
			}
			
			return null;
		}


		const inputs: Fields[] = [];
		const moveInput = getMoveInput();
		if (moveInput) {
			inputs.push(moveInput);
		}

		if (keyboard.first('up') || keyboard.first('jump')) {
			inputs.push({jump: {}, action: 'jump'});
		}

		if (keyboard.first('down')) {
			inputs.push({downOn: {}, action: 'downOn'});
		}

		if (keyboard.killed('down')) {
			inputs.push({downOff: {}, action: 'downOff'});
		}


		return inputs;
	}

	override draw(ctx: CanvasRenderingContext2D, playerIdx: number) {
		const player = this.players[playerIdx];

		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		// Center the camera on the current player
		ctx.save();
		ctx.translate(
			WIDTH/2 - player.x,
			HEIGHT/2 - player.y
		);

		// Background
		for (let y = 0; y < 3; y++) {
			for (let x = 0; x < 5; x++) {
				ctx.fillStyle = COLORS[y][x];
				ctx.fillRect(
					(x-2.5)*WIDTH,
					(y-1.5)*HEIGHT,
					WIDTH,
					HEIGHT
				);
			}
		}

		// Draw players
		for (const [i, p] of this.players.entries()) {
			ctx.fillStyle = (i % 2 === 0) ? "red" : "blue";
			ctx.fillRect(
				p.x - Player.WIDTH/2,
				p.y - Player.HEIGHT/2,
				Player.WIDTH,
				Player.HEIGHT
			);
		}

		// Draw ball
		ctx.fillStyle = "green";
		ctx.fillRect(
			this.ball.x - Ball.RADIUS/2,
			this.ball.y - Ball.RADIUS/2,
			Ball.RADIUS,
			Ball.RADIUS
		);

		ctx.restore();
	}


	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const {State} = protocols.get();
		const object: Fields = {
			players: this.players,
			prevBallGrabber: this.ball.prevGrabber
		};
		
		if (this.ball.grabber >= 0) {
			object.grabbedBall = {owner: this.ball.grabber};
		} else {
			object.freeBall = this.ball;
		}

		return State.encode(object).finish();
	}

	override load(data: Uint8Array): void {
		const {State} = protocols.get();
		const obj = State.decode(data);
		for (const [idx, player] of obj.players.entries()) {
			this.players[idx].load(player);
		}

		this.ball.load(obj);
	}

	override getSize() {
		return {width: WIDTH, height: HEIGHT};
	}
}


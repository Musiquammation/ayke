import { Fields } from "../Fields";
import { GameMode, IKeyboardController, IMouseController } from "../GameMode";
import { getProtocol } from "../protocolLoader";

const protocols = getProtocol('airbasket');

interface PlayerInput {
	data: Fields;
}

const GRAVITY = 900;
const WIDTH = 1600;
const HEIGHT = 900;

class Ball {
	static readonly RADIUS = 20;
	static readonly SPAWN_JUMP = 20;
	static readonly GRAVITY = 50;

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
}

class Player {
	static readonly SPEED = 1000;
	static readonly ACCELERATION = 3000;
	static readonly SOFT_DECELERATION = 4000;
	static readonly QUICK_DECELERATION = 20000;
	static readonly JUMP = 900;
	static readonly SPAWN_JUMP = 90;
	static readonly COOLDOWN = 1.5;
	static readonly RADIUS = 20;
	static readonly PUSH_DOWN = 1000;

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

	isAlive() {
		return this.alive < 0;
	}

	move(dt: number) {
		if (this.alive >= 0)
			this.alive -= dt;

		if (this.alive >= 0)
			return;

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
	}

	canGrabBall(ball: Ball) {
		const dx = this.x - ball.x;
		const dy = this.y - ball.y;
		const distSq = dx*dx + dy*dy;
		const radiusSum = Player.RADIUS + Ball.RADIUS;
		return distSq <= radiusSum * radiusSum;
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
			p.x = redTeam ? -WIDTH : WIDTH;
			p.x = -p.x; // temp
			p.y = ((i+1)*invParts - .5) * HEIGHT;
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

		this.ball.move(dt);

		// Grab ball
		if (this.ball.grabber < 0) {
			let grabber = -1;
			for (const [i, p] of this.players.entries()) {
				if (i !== this.ball.prevGrabber && p.canGrabBall(this.ball)) {
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

	override draw(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, 1600, 900);
		
		// Draw players
		for (const [i, p] of this.players.entries()) {
			ctx.fillStyle = (i % 2 === 0) ? "red" : "blue";
			ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
		}

		// Draw ball
		ctx.fillStyle = "green";
		ctx.fillRect(this.ball.x - 10, this.ball.y - 10, 20, 20);
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


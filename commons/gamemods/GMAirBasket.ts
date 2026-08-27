import { $data } from "alpinejs";
import { Fields } from "../Fields";
import { FinishGame, GameMode, IKeyboardController, IMouseController } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { collisions } from "../util/collisions";
import { decodeFullMessage } from "../util/decodeFullMessage";
import { ImageLoader } from "../util/ImageLoader";

const protocols = getProtocol('airbasket');

interface PlayerInput {
	data: Uint8Array;
}

const GRAVITY = 1200;
const WIDTH = 1600;
const HEIGHT = 900;

const X_LIMIT = WIDTH * 2.5;
const Y_LIMIT = HEIGHT * 1.5;

const TIMES = [
	90, // normal
	30, // grabber infinite
	60, // sudden death
];

const COLORS = [
	["#ff4f99", "#ff9b7a", "#ffffff", "#7199ff", "#4f99ff"],
	["#ff0770", "#ff7744", "#ffffff", "#4477ff", "#0077ff"],
	["#cc0059", "#cc5f36", "#cccccc", "#365fcc", "#005fcc"]
];

const BUCKET_POSITIONS: number[][] = [
	[-2, -1], [-1, -1],         [0, -1],          [+1, -1], [+2, -1],
	[-2,  0], [-1,  0],                           [+1,  0], [+2,  0],
	[-2, +1], [-1, +1], [-0.25, +1], [+0.25, +1], [+1, +1], [+2, +1],
]


class Ball {
	static readonly RADIUS = 60;
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
		this.removeGrabber();
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
		if (this.grabber < 0)
			return;

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

interface FixedTarget {
	type: 'fixed';
	x: number;
	y: number;
}

interface DeltaTarget {
	type: 'delta';
	dx: number;
	dy: number;
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
	static readonly THROW = 700;

	spawnX: number | null = null;
	spawnY: number | null = null
	connected = true;
	alive = -1;
	vx = 0;
	vy = -Player.SPAWN_JUMP;
	dir = 0;
	pushDown = false;
	score = 0;
	target : FixedTarget | DeltaTarget | null = null;
	team: 'red' | 'blue' = 'red';

	constructor(
		public x: number,
		public y: number
	) {
	}

	initSpawn(x: number, y: number, team: 'red' | 'blue') {
		this.spawnX = x;
		this.spawnY = y;
		this.x = x;
		this.y = y;
		this.team = team;
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



class Bucket {
	team: 'red' | 'blue' | null = null;

	static readonly SIZE = 70;

	constructor(
		public readonly x: number,
		public readonly y: number
	) {}
}






class ClientData {

}

function generateClientDom() {
	return {
		skin: 0,
		preferTeam: 0,

		produce() {
			const {StartData} = protocols.get();
			return StartData.encode({
				skin: this.skin,
				preferTeam: this.preferTeam
			}).finish();
		}
	};
}





export class GMAirBasket extends GameMode {
	static readonly types = {Player};

	readonly players: Player[];
	readonly ball = new Ball();
	readonly buckets: Bucket[];
	redScore = 0;
	blueScore = 0;
	leftBuckets = BUCKET_POSITIONS.length;

	timeStep = 0;
	time = TIMES[0];

	finished = false;

	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0)
		);

		this.buckets = BUCKET_POSITIONS.map(([x, y]) => new Bucket(x*WIDTH, y*HEIGHT));
	}

	static createServ(players: PlayerInput[], total: number) {
		const {StartData, StartDataClient} = protocols.get();

		const game = new GMAirBasket(total);
		const invParts =  1/(total/2 + 1);


		function decode(i: number) {
			if (i < players.length)
				return decodeFullMessage(StartData.decode(players[i].data));

			return generateClientDom();
		}

		// Pre-decode all player messages once for performance
		const playerInfos = game.players.map((p, i) => ({
			player: p,
			index: i,
			pref: decode(i).preferTeam ?? 0
		}));

		const totalPlayers = playerInfos.length;
		const maxPerTeam = Math.ceil(totalPlayers / 2);

		const assigned = new Array(totalPlayers);
		let redCount = 0;
		let blueCount = 0;

		// Phase 1: Assign players with explicit valid preferences if team capacity allows
		for (let i = 0; i < totalPlayers; i++) {
			const info = playerInfos[i];
			if (info.pref === 1 && redCount < maxPerTeam) {
				assigned[info.index] = true; // Red
				redCount++;
			} else if (info.pref === -1 && blueCount < maxPerTeam) {
				assigned[info.index] = false; // Blue
				blueCount++;
			}
		}

		// Phase 2: Fill remaining slots by alternating to maintain balanced team sizes
		for (let i = 0; i < totalPlayers; i++) {
			if (assigned[i] !== undefined) continue;

			// Assign to the team that currently has fewer players
			const isRed = redCount < blueCount || (redCount === blueCount && i % 2 === 0);
			if (isRed && redCount < maxPerTeam) {
				assigned[i] = true;
				redCount++;
			} else {
				assigned[i] = false;
				blueCount++;
			}
		}

		// Phase 3: Initialize spawn points based on final team assignments
		for (const [i, p] of game.players.entries()) {
			const redTeam = assigned[i];
			p.initSpawn(
				redTeam ? -WIDTH * 2 : WIDTH * 2,
				((i + 1) * invParts - 0.5) * HEIGHT,
				redTeam ? 'red' : 'blue'
			);
		}



		const data = StartDataClient.encode({
			players: game.players.map(p => ({
				x: p.spawnX,
				y: p.spawnY,
				isRed: p.team === 'red'
			}))
		}).finish();

		return {
			game,
			data
		}
	}

	static createClient(data: Uint8Array, total: number) {
		const game = new GMAirBasket(total);
		const {StartDataClient} = protocols.get();

		const {players} = decodeFullMessage(StartDataClient.decode(data));

		for (const [idx, p] of players.entries()) {
			game.players[idx].initSpawn(p.x, p.y, p.isRed ? 'red' : 'blue');
		}

		return {game, data: new ClientData()};
	}

	static readonly generateClientDom = generateClientDom;

	static readonly TEXTURES = {
		'ball': "/assets/games/airbasket/ball.png",
		'bucket-blue': "/assets/games/airbasket/bucket-blue.png",
		'bucket-mid': "/assets/games/airbasket/bucket-mid.png",
		'bucket-red': "/assets/games/airbasket/bucket-red.png",
	};


	override init(): void {
		
	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
	}

	private playerTouchBucket(player: Player) {
		const rect = {
			x: player.x,
			y: player.y,
			w: Player.WIDTH,
			h: Player.HEIGHT,
		};

		for (const bucket of this.buckets) {
			if (bucket.team !== null)
				continue;

			if (collisions.RectRect(rect, {
				x: bucket.x,
				y: bucket.y,
				w: Bucket.SIZE,
				h: Bucket.SIZE,
			})) {
				return bucket;
			}
		}

		return null;
	}

	private ballTouchBucket() {
		const circle = {
			x: this.ball.x,
			y: this.ball.y,
			r: Ball.RADIUS,
		};

		for (const bucket of this.buckets) {
			if (bucket.team !== null)
				continue;

			if (collisions.RectCircle({
				x: bucket.x,
				y: bucket.y,
				w: Bucket.SIZE,
				h: Bucket.SIZE,
			}, circle)) {
				return bucket;
			}
		}

		return null;
	}

	private winPoint(playerIdx: number, bucket: Bucket) {
		const player = this.players[playerIdx];
		player.score++;
		bucket.team = player.team;
		if (player.team === 'red') {
			this.redScore++;
		} else {
			this.blueScore++;
		}
		this.leftBuckets--;

		this.ball.reset();
	}

	private canRegrab() {
		return this.timeStep >= 1;
	}

	private isSuddenDeath() {
		return this.timeStep >= 2;
	}

	override run(dt: number, produceFinish: boolean): FinishGame | null {
		// Time
		this.time -= dt;
		if (this.time <= 0) {
			this.timeStep++;
			if (this.timeStep >= TIMES.length) {
				this.finished = true;
				this.time = Infinity;
			}
			this.time += TIMES[this.timeStep];
		}

		if (this.isSuddenDeath() && this.redScore !== this.blueScore) {
			this.finished = true;
		}


		// Move
		for (const p of this.players) {
			p.move(dt);
		}

		// Eject ball from dead player or throw ball
		if (this.ball.grabber >= 0) {
			const grabber = this.players[this.ball.grabber];
			if (!grabber.isAlive()) {
				this.ball.eject();
			} else if (grabber.target && grabber.target.type === 'fixed') {
				const dx = grabber.target.x - grabber.x;
				const dy = grabber.target.y - grabber.y;
				const length = Math.sqrt(dx * dx + dy * dy);
				if (length > 0) {
					const inv = Player.THROW / length;
					this.ball.vx = dx * inv;
					this.ball.vy = dy * inv;
					this.ball.removeGrabber();
				}

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
			const canRegrab = this.canRegrab();
			let grabber = -1;
			for (const [i, p] of this.players.entries()) {
				if (
					(canRegrab || i !== this.ball.prevGrabber) &&
					p.touchsBall(this.ball)
				) {
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

		// Ball touch bucket
		if (this.ball.grabber >= 0) {
			const bucket = this.playerTouchBucket(this.players[this.ball.grabber]);
			if (bucket) {
				this.winPoint(this.ball.grabber, bucket);
			}

		} else if (this.ball.prevGrabber >= 0) {
			const bucket = this.ballTouchBucket();
			if (bucket) {
				this.winPoint(this.ball.prevGrabber, bucket);
			}
		}


		if (produceFinish && this.finished) {
			return this.produceFinish();
		}
		return null;
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
				// Jump if ball is not grabbed
				if (this.ball.grabber !== playerIdx)
					player.vy = -Player.JUMP;
				break;

			case 'downOn':
				player.pushDown = true;
				break;

			case 'downOff':
				player.pushDown = false;
				break;

			case 'throwTarget':
				player.target = {
					type: 'fixed',
					x: input.throwTarget.x,
					y: input.throwTarget.y,
				};
				break;

			case 'throwDir':
				player.target = {
					type: 'delta',
					dx: input.throwTarget.dx,
					dy: input.throwTarget.dy,
				};
				break;

			case 'throwOff':
				player.target = null;
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


		// Left / Right
		const inputs: Fields[] = [];
		const moveInput = getMoveInput();
		if (moveInput) {
			inputs.push(moveInput);
		}

		// Jump / Down
		if (keyboard.first('up') || keyboard.first('jump')) {
			inputs.push({jump: {}, action: 'jump'});
		}

		if (keyboard.first('down')) {
			inputs.push({downOn: {}, action: 'downOn'});
		}

		if (keyboard.killed('down')) {
			inputs.push({downOff: {}, action: 'downOff'});
		}


		// Target
		if (mouse.press(0)) {
			const throwTarget = mouse.getCoords();
			inputs.push({throwTarget, action: 'throwTarget'});
			
		} else if (mouse.killed(0)) {
			inputs.push({throwOff: {}, action: 'throwOff'});
		}

		return inputs;
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any,
		imageLoader: ImageLoader
	) {
		const data = _data as ClientData;

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

		// Buckets
		for (const bucket of this.buckets) {
			const b = "bucket-" + (bucket.team ?? "mid");
			ctx.drawImage(
				imageLoader.get(b),
				bucket.x - Bucket.SIZE/2,
				bucket.y - Bucket.SIZE/2,
				Bucket.SIZE,
				Bucket.SIZE
			);
		}

		// Draw players
		for (const [i, p] of this.players.entries()) {
			ctx.fillStyle = p.team;
			ctx.fillRect(
				p.x - Player.WIDTH/2,
				p.y - Player.HEIGHT/2,
				Player.WIDTH,
				Player.HEIGHT
			);
		}

		// Draw ball
		ctx.drawImage(
			imageLoader.get('ball'),
			this.ball.x - Ball.RADIUS/2,
			this.ball.y - Ball.RADIUS/2,
			Ball.RADIUS,
			Ball.RADIUS
		)

		ctx.restore();
	}


	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const {State} = protocols.get();
		const object: Fields = {
			players: this.players,
			prevBallGrabber: this.ball.prevGrabber,
			buckets: this.buckets.map(b => ({
				taken: b.team !== null,
				redTeam: b.team === 'red'
			})),
			time: this.time,
			timeStep: this.timeStep,
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

		for (const [idx, bucket] of obj.buckets.entries()) {
			if (!bucket.taken) {
				this.buckets[idx].team = null;
			} else {
				this.buckets[idx].team = bucket.redTeam ? 'red' : 'blue';
			}
		}

		this.ball.load(obj);

		this.time = obj.time;
		this.timeStep = obj.timeStep;
	}

	override getSize() {
		return {width: WIDTH, height: HEIGHT};
	}

	override evalMouseCoords(x: number, y: number, playerIdx: number) {
		const player = this.players[playerIdx];
		return {
			x: x + player.x - WIDTH/2,
			y: y + player.y - HEIGHT/2
		};
	}

	private produceFinish(): FinishGame {
		const redTeam: number[] = [];
		const blueTeam: number[] = [];
		const playerEqualities: number[] = [];

		// Fill teams
		for (const [idx, player] of this.players.entries()) {
			if (player.team === 'red') {
				redTeam.push(idx);
			} else {
				blueTeam.push(idx);
			}
		}

		// Internal sort
		for (const team of [redTeam, blueTeam]) {
			// Sort
			team.sort((a, b) => this.players[b].score - this.players[a].score);

			// Detect equalities
			for (let i = 0; i < team.length - 2; i++) {
				const a = this.players[team[i]].score;
				const b = this.players[team[i+1]].score;
				if (a === b) {
					playerEqualities.push(team[i]);
				}
			}
		}


		// Sort teams
		let teams: number[][];
		const teamEqualities: number[] = [];

		if (this.redScore >= this.blueScore) {
			teams = [redTeam, blueTeam];
			if (this.redScore === this.blueScore) {
				teamEqualities.push(0);
			}
		} else {
			teams = [blueTeam, redTeam];
		}

		return {
			results: teams,
			teamEqualities,
			playerEqualities
		};
	}
}


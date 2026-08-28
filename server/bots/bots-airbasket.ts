import { Fields } from "../../commons/Fields";
import { GMAirBasket } from "../../commons/gamemods/GMAirBasket";
import { getBestInArray } from "../../commons/util/getBestInArray";
import { appendBots, botActionNodeHelper } from "../Bot";
import { getLogger } from "../Logger";

const logger = getLogger('bots-airbasket');
// logger.setLevel('debug');

const {all, first, loop, runner} = botActionNodeHelper<GMAirBasket, Data>();

const TYPES = GMAirBasket.types;
type Player = InstanceType<typeof GMAirBasket.types.Player>;

const INPUTS = {
	jump: {jump: {}, action: 'jump'},
	downOn: {downOn: {}, action: 'downOn'},
	downOff: {downOff: {}, action: 'downOff'},
	left: {left: {}, action: 'left'},
	right: {right: {}, action: 'right'},
	stop: {stop: {}, action: 'stop'},
};

const STATS = {
	FAR: 400,
	FOCUS_Y: 200,
	JUMP_DELAY: 0.3,
	JUMP_VY: 600
};


class Data {	
	private lastAvoidOOBTick = 0;
	private dir = 0;
	private pushDownStates: Record<number, boolean> = {};
	bucketTarget: number | 'empty' | 'cancel' = 'empty';

	avoidOOB(game: GMAirBasket, player: Player, inputs: Fields[]) {
		if (game.internalFrameTick === this.lastAvoidOOBTick)
			return; // already called

		const LIMIT = 150;
	
	
		if (player.y <= -GMAirBasket.DATA.Y_LIMIT + LIMIT) {
			this.pushDown(true, 0, inputs);
		} else {
			this.pushDown(false, 0, inputs);
		}
	
		if (player.y >= GMAirBasket.DATA.Y_LIMIT - LIMIT) {
			inputs.push(INPUTS.jump);
		}

		this.lastAvoidOOBTick = game.internalFrameTick;
	}

	isFar(game: GMAirBasket, player: Player) {
		const dx = game.ball.x - player.x;
		const dy = game.ball.y - player.y;
		const dist2 = norm2(dx,dy);
		return dist2 > STATS.FAR*STATS.FAR;
	}

	pushDown(active: boolean, idx: number, inputs: Fields[]) {
		if (active) {
			const all = Object.values(this.pushDownStates).every(value => !value);
			this.pushDownStates[idx] = true;
			if (all) {
				logger.debug("Dash on");
				inputs.push(INPUTS.downOn);
			}

		} else if (this.pushDownStates[idx]) {
			this.pushDownStates[idx] = false;
			if (Object.values(this.pushDownStates).every(value => !value)) {
				logger.debug("Dash off");
				inputs.push(INPUTS.downOff);
			}
		}
	}

	goLeft(inputs: Fields[]) {
		if (this.dir === -1) {
			return;
		}

		this.dir = -1;
		inputs.push(INPUTS.left);
	}

	goRight(inputs: Fields[]) {
		if (this.dir === +1) {
			return;
		}

		this.dir = +1;
		inputs.push(INPUTS.right);
	}

	goStop(inputs: Fields[]) {
		if (this.dir === 0) {
			return;
		}

		this.dir = 0;
		inputs.push(INPUTS.stop);
	}

	reach(
		game: GMAirBasket,
		player: Player,
		target: {x: number, y: number, vx: number, vy: number},
		inputs: Fields[]
	) {
		/// TODO: improve this algorithm
		const dx = target.x - player.x
		const dy = target.y - player.y;


		// Horizontal movement resolution
		if (dx < 0) {
			this.goLeft(inputs);
		} else if (dx > 0) {
			this.goRight(inputs);
		} else {
			this.goStop(inputs);
		}

		// Vertical movement and dash resolution
		if (dy < 0) {
			if (player.vy > -STATS.JUMP_VY)
				inputs.push(INPUTS.jump);

			this.pushDown(false, 1, inputs);
		} else if (dy > STATS.FOCUS_Y) {
			this.pushDown(true, 1, inputs);
		} else {
			this.pushDown(false, 1, inputs);
		}
	}

	reachBucket(
		game: GMAirBasket,
		player: Player,
		bucketIdx: number,
		inputs: Fields[]
	) {
		/// TODO: improve this algorithm
		const target = game.buckets[bucketIdx];
		const dx = target.x - player.x;

		logger.debug(`reachBucket ${player.x.toFixed(1)} -> ${target.x.toFixed(1)}`);

		// Horizontal movement resolution
		if (dx < 0) {
			this.goLeft(inputs);
		} else if (dx > 0) {
			this.goRight(inputs);
		} else {
			this.goStop(inputs);
		}

		this.pushDown(false, 1, inputs);
	}

	getBestBucket(game: GMAirBasket, player: Player) {
		const u = getBestInArray(game.buckets, b => {
			if (b.team !== null) return -Infinity;
			return -norm2(b.x - player.x, b.y - player.y);
		});

		if (!Number.isFinite(u.score))
			return 'cancel';

		return u.index;
	}

	getBestMate(game: GMAirBasket, player: Player): Player | null {
		return null;
	}
}

function dataConstructor(): Data {
	return new Data();
}

function norm2(dx: number, dy: number) {
	return dx*dx + dy*dy;
}


// Refactored single bot loop combining all behaviors
const method = runner((game, data, playerIdx) => {
	const inputs: Fields[] = [];
	const player = game.players[playerIdx];

	// Avoid OOB
	data.avoidOOB(game, player, inputs)

	
	// Empty bucketTarget
	if (game.ball.grabber !== playerIdx) {
		data.bucketTarget = 'empty';
	}


	if (data.isFar(game, player)) {
		// Join action
		if (game.ball.grabber >= 0) {
			data.reach(game, player, game.players[game.ball.grabber], inputs);
		} else {
			data.reach(game, player, game.ball, inputs);
		}

	} else if (game.ball.grabber === playerIdx) {
		// Select bucketTarget
		if (data.bucketTarget === 'empty') {
			data.bucketTarget = data.getBestBucket(game, player)
			logger.debug(`Grab ${data.bucketTarget}`);
		}

		if (typeof data.bucketTarget !== 'string') {
			data.reachBucket(game, player, data.bucketTarget, inputs);
		} else {
			const mate = data.getBestMate(game, player);
			if (mate !== null) {
				if (player.vy >= 0) {
					/// TODO: when throw?
					inputs.push({throwTarget: {
						x: mate.x,
						y: mate.y
					}});
				}
				
			} else if (player.vy >= 0) {
				/// TODO: follow player side
				inputs.push({throwTarget: {
					x: 2*GMAirBasket.DATA.WIDTH,
					y: 1*GMAirBasket.DATA.HEIGHT
				}});
			}
		}

	} else if (game.ball.grabber >= 0) {
		data.reach(game, player, game.players[game.ball.grabber], inputs);
	} else {
		data.reach(game, player, game.ball, inputs);
	}


	// Fallback in case no strategy matches
	return [inputs, 'success'];
});


const root = (function() {
	return all([method]);
})();

appendBots('airbasket', [
	{root, data: dataConstructor}
]);

logger.info("Bot loaded!");

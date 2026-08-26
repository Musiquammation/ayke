import { Fields } from "../../commons/Fields";
import { GMAirBasket } from "../../commons/gamemods/GMAirBasket";
import { appendBots, botActionNodeHelper } from "../Bot";
import { getLogger } from "../Logger";

const logger = getLogger('bots-airbasket');
logger.setLevel('debug');

const TYPES = GMAirBasket.types;
type Player = typeof TYPES.Player;




const INPUTS = {
	jump: {jump: {}, action: 'jump'},
	dashOn: {dashOn: {}, action: 'dashOn'},
	dashOff: {dashOff: {}, action: 'dashOff'},
	left: {left: {}, action: 'left'},
	right: {right: {}, action: 'right'},
	stop: {stop: {}, action: 'stop'},
};

class Data {	
	private lastAvoidOOBTick = 0;
	private dir = 0;
	private _pushDown = false;

	avoidOOB(game: GMAirBasket, playerIdx: number) {
		if (game.internalFrameTick === this.lastAvoidOOBTick)
			return []; // already called

		const player = game.players[playerIdx];
		const LIMIT = 150;
		const inputs: Fields[] = [];
	
		logger.debug(`At ${player.x.toFixed(2)} ${player.y.toFixed(2)}`);
	
		if (player.y <= -GMAirBasket.DATA.Y_LIMIT + LIMIT) {
			inputs.push(...this.pushDown(true));
		} else {
			inputs.push(...this.pushDown(false));
		}
	
		if (player.y >= GMAirBasket.DATA.Y_LIMIT - LIMIT) {
			inputs.push(INPUTS.jump);
		}

		this.lastAvoidOOBTick = game.internalFrameTick;
		return inputs;
	}

	pushDown(active: boolean) {
		if (this._pushDown === active) return [];

		this._pushDown = active;
		return [active ? INPUTS.dashOn : INPUTS.dashOff];
	}

	goLeft() {
		if (this.dir === -1) {
			return [];
		}

		this.dir = -1;
		return [INPUTS.left];
	}

	goRight() {
		if (this.dir === +1) {
			return [];
		}

		this.dir = +1;
		return [INPUTS.right];
	}

	goStop() {
		if (this.dir === 0) {
			return [];
		}

		this.dir = 0;
		return [INPUTS.stop];
	}
}

function dataConstructor(): Data {
	return new Data();
}

function norm2(dx: number, dy: number) {
	return dx*dx + dy*dy;
}



const {all, first, loop, runner} = botActionNodeHelper<GMAirBasket, Data>();

const STATS = {
	FAR: 400
};

const methods = {
	avoidOOB: runner((game, data, playerIdx) => {
		return [data.avoidOOB(game, playerIdx), 'success'];
	}),

	success: runner(() => [[], 'success']),

	isNear: runner((game, data, playerIdx) => {
		const player = game.players[playerIdx];
		const dx = game.ball.x - player.x;
		const dy = game.ball.y - player.y;
		const dist2 = norm2(dx,dy);

		return [[], dist2 <= STATS.FAR*STATS.FAR ? 'success' : 'failed'];
	}),

	joinAction: runner((game, data, playerIdx) => {
		const inputs = data.avoidOOB(game, playerIdx);
		const player = game.players[playerIdx];
		const dx = game.ball.x - player.x;
		const dy = game.ball.y - player.y;

		if (norm2(dx,dy) <= STATS.FAR*STATS.FAR)
			return [inputs, 'success'];

		if (dx < 0) {
			inputs.push(...data.goLeft());
		} else if (dx > 0) {
			inputs.push(...data.goRight());
		} else {
			inputs.push(...data.goStop());
		}

		return [inputs, 'pending'];

	}),

	empty: runner((game, data, playerIdx) => {
		const inputs: Fields[] = [];
		return [inputs, 'success'];
	})
};

const survive = all([methods.avoidOOB])

const far = all([methods.joinAction]);

const root_far = first([methods.isNear, far, methods.success]);


const testBot = (function() {
	return all([survive, root_far]);
})();

appendBots('airbasket', [
	{root: testBot, data: dataConstructor}
]);


logger.info("Bot loaded!");


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
	downOn: {downOn: {}, action: 'downOn'},
	downOff: {downOff: {}, action: 'downOff'},
	left: {left: {}, action: 'left'},
	right: {right: {}, action: 'right'},
	stop: {stop: {}, action: 'stop'},
};

class Data {	
	private lastAvoidOOBTick = 0;
	private dir = 0;
	private pushDownStates: Record<number, boolean> = {};

	avoidOOB(game: GMAirBasket, playerIdx: number) {
		if (game.internalFrameTick === this.lastAvoidOOBTick)
			return []; // already called

		const player = game.players[playerIdx];
		const LIMIT = 150;
		const inputs: Fields[] = [];
	
		logger.debug(`At ${player.x.toFixed(2)} ${player.y.toFixed(2)}`);
	
		if (player.y <= -GMAirBasket.DATA.Y_LIMIT + LIMIT) {
			inputs.push(...this.pushDown(true, 0));
		} else {
			inputs.push(...this.pushDown(false, 0));
		}
	
		if (player.y >= GMAirBasket.DATA.Y_LIMIT - LIMIT) {
			inputs.push(INPUTS.jump);
		}

		this.lastAvoidOOBTick = game.internalFrameTick;
		return inputs;
	}

	pushDown(active: boolean, idx: number) {
		if (active) {
			const all = Object.values(this.pushDownStates).every(value => !value);
			this.pushDownStates[idx] = true;
			if (all) {
				logger.debug("Dash on");
				return [INPUTS.downOn];
			}

		} else if (this.pushDownStates[idx]) {
			this.pushDownStates[idx] = false;
			if (Object.values(this.pushDownStates).every(value => !value)) {
				logger.debug("Dash off");
				return [INPUTS.downOff];
			}
		}

		return [];
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
	FAR: 400,
	FOCUS_Y: 150
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


		logger.debug(`Join action ${dx.toFixed(2)} ${dy.toFixed(2)} ${player.pushDown}`);

		if (dx < 0) {
			// inputs.push(...data.goLeft());
		} else if (dx > 0) {
			// inputs.push(...data.goRight());
		} else {
			inputs.push(...data.goStop());
		}


		if (dy < 0) {
			inputs.push(INPUTS.jump);
			inputs.push(...data.pushDown(false, 1));
		} else if (dy > STATS.FOCUS_Y) {
			inputs.push(...data.pushDown(true, 1));
		} else {
			inputs.push(...data.pushDown(false, 1));
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


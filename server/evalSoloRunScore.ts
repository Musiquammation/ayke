import Prando from "prando";
import { getSoloGmFactory } from "../commons/gamemods";
import { getProtocol } from "../commons/protocolLoader";
import { decodeFullMessage } from "../commons/util/decodeFullMessage";

export async function evalSoloRunScore(
	gamemodeId: string,
	category: string,
	seed: number,
	inputs: Uint8Array[]
) {
	const MAX_DURATION_WITHOUT_INPUTS = 30;
	const game = getSoloGmFactory(gamemodeId).create();
	game.init(category, new Prando(seed), false);
	
	const protocols = getProtocol(gamemodeId, 'solo')
	await protocols.load();
	const Input = protocols.get().Input;

	let clock = 0;
	let score = null;
	for (const rawInput of inputs) {
		const input = decodeFullMessage(Input.decode(rawInput));
		const timestamp = input.timestamp;
		score = game.quickEmulate(timestamp - clock, clock);
		if (score !== null)
			break;

		game.runInput(input);
		clock = timestamp;
	}

	if (score === null) {
		score = game.quickEmulate(MAX_DURATION_WITHOUT_INPUTS, clock);
	}

	return score;

}
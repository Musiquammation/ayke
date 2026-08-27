import { FinishGame } from "../commons/GameMode";

const TEAM_RATIO = 0.65;

export function evalWonTrophees(data: FinishGame) {
	const playerCount = data.results.reduce((val, array) => val + array.length, 0);

	const trophees = Array.from({length: playerCount}, ()=>0);

	// Team trophees (require at least 2 teams)
	const teamCount = data.results.length;
	if (teamCount >= 2) {
		const base = TEAM_RATIO;
		const unit = 2*base / (teamCount-1);

		const eqIterator = data.teamEqualities[Symbol.iterator]();
		let nextEqualityRank = eqIterator.next().value;

		for (let rank = 0; rank < teamCount; rank++) {
			// Get equality pool
			let subRank = rank;
			while (subRank === nextEqualityRank) {
				nextEqualityRank = eqIterator.next().value;
				subRank++;
			}


			const high = base - rank*unit;
			const low = base - subRank*unit;
			const avg = .5 * (high+low);

			for (let i = rank; i <= subRank; i++)
				for (let j of data.results[i])
					trophees[j] = avg;

			// Move
			rank = subRank;
		}
	}

	// Personal trophees
	const personalRatio = teamCount === 1 ? 1 : (1 - TEAM_RATIO);
	for (const team of data.results) {
		if (team.length <= 1)
			continue; // no extra points if player was lonely

		const base = personalRatio;
		const unit = 2*base / (team.length-1);

		for (let rank = 0; rank < team.length; rank++) {
			// Get equality pool
			let subRank = rank;
			while (data.playerEqualities.includes(team[subRank])) {
				subRank++;
			}

			const high = base - rank*unit;
			const low = base - subRank*unit;
			const avg = .5 * (high+low);

			for (let i = rank; i <= subRank; i++) {
				trophees[team[i]] += avg;
			}

			// Move
			rank = subRank;
		}
	}


	return trophees;
}

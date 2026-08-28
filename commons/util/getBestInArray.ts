export function getBestInArray<T>(
	items: T[],
	score: (item: T) => number
): { index: number; score: number } {
	let bestIndex = -1;
	let bestScore = -Infinity;

	for (let i = 0; i < items.length; i++) {
		const s = score(items[i]);

		if (s > bestScore) {
			bestScore = s;
			bestIndex = i;
		}
	}

	return {
		index: bestIndex,
		score: bestScore
	};
}

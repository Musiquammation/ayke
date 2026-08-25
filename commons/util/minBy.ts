export function minBy<T>(array: T[], score: (value: T) => number) {
	if (array.length === 0)
		return -1;

	let min = array[0];
	let minScore = score(min);
	let minIdx = 0;

	for (let i = 1; i < array.length; i++) {
		if (score(array[i]) < minScore) {
			min = array[i];
			minScore = score(min);
			minIdx = i;
		}
	}

	return minIdx;
}


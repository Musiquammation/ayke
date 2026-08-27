export function flattenArrays(arrays: number[][], forbidden=-0x80000000): number[] {
	const result: number[] = [];

	for (let i = 0; i < arrays.length; i++) {
		if (i > 0)
			result.push(forbidden);

		result.push(...arrays[i]);
	}

	return result;
}

export function unflattenPositiveArrays(values: number[], forbidden=-0x80000000): number[][] {
	const result: number[][] = [[]];

	for (const value of values) {
		if (value === forbidden) {
			result.push([]);
		} else {
			result[result.length - 1].push(value);
		}
	}

	return result;
}

export function mergeSortedArrays<T>(
	a: T[],
	b: T[],
	compare: (a: T, b: T) => number
): T[] {
	const result: T[] = [];

	let i = 0;
	let j = 0;

	while (i < a.length && j < b.length) {
		if (compare(a[i], b[j]) <= 0) {
			result.push(a[i++]);
		} else {
			result.push(b[j++]);
		}
	}

	while (i < a.length) {
		result.push(a[i++]);
	}

	while (j < b.length) {
		result.push(b[j++]);
	}

	return result;
}

export function produceMergedSortedArrays<T, U>(
	a: T[],
	b: U[],
	compare: (a: T, b: U) => number,
	produce: (x: U) => T
): T[] {
	const result: T[] = [];

	let i = 0;
	let j = 0;

	while (i < a.length && j < b.length) {
		if (compare(a[i], b[j]) <= 0) {
			result.push(a[i++]);
		} else {
			result.push(produce(b[j++]));
		}
	}

	while (i < a.length) {
		result.push(a[i++]);
	}

	while (j < b.length) {
		result.push(produce(b[j++]));
	}

	return result;
}

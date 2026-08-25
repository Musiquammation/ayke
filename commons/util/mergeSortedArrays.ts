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

export function pushSortedArrays<T>(
	main: T[],
	added: T[],
	compare: (a: T, b: T) => number
) {
	let i = main.length - 1;
	let j = added.length - 1;

	main.length += added.length;

	let k = main.length - 1;

	while (j >= 0) {
		if (i >= 0 && compare(main[i], added[j]) > 0) {
			main[k--] = main[i--];
		} else {
			main[k--] = added[j--];
		}
	}
}

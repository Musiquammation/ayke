interface IMobile {
	setScreenOrientation(o: 'landscape' | 'portrait'): Promise<void>;
}




let mobile: IMobile | null = null;

let resolveMobile: ((mobile: IMobile | null) => void);

let mobilePromise = new Promise<IMobile | null>(resolve => {
	resolveMobile = resolve;
});

export function getMobile(): Promise<IMobile | null> {
	if (mobile !== null) {
		return Promise.resolve(mobile);
	}

	return mobilePromise;
}

export function resolveMobileInterface(_mobile: IMobile | null): void {
	if (mobile !== null) {
		return;
	}

	mobile = _mobile;
	resolveMobile(_mobile);
}

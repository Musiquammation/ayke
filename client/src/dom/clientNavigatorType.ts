export function hasNavigatorMobile(): boolean {
	return navigator.maxTouchPoints > 0;
}

export function hasNavigatorMouse(): boolean {
	return window.matchMedia('(any-pointer: fine)').matches;
}

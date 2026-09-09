import { StatusBar } from '@capacitor/status-bar';

class IMobile {
	async setScreenOrientation(o: 'landscape' | 'portrait') {
		console.log("Orientation: " + o);
	}
}


const mobile = new IMobile();

export async function initMobile() {
	await StatusBar.hide();

	console.log("Mobile initialized!");
	return mobile;
}
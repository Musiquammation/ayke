import { StatusBar } from '@capacitor/status-bar';

class IMobile {
	async setScreenOrientation(o: 'landscape' | 'portrait') {
		console.log(o);
	}
}


const mobile = new IMobile();

export async function initMobile() {
	await StatusBar.hide();
	return mobile;
}
import { StatusBar } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';


class IMobile {
	setScreenOrientation(o: 'landscape' | 'portrait') {
		return ScreenOrientation.lock({
			orientation: o === 'landscape'
				? 'landscape'
				: 'portrait'
		});
	}
}


const mobile = new IMobile();

export async function initMobile() {
	await StatusBar.hide();

	console.log("Mobile initialized!");
	return mobile;
}
import { StatusBar } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { App } from "@capacitor/app";

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

	
	App.addListener("backButton", ({ canGoBack }) => {
		if (window.location.hash) {
			window.history.back();
			return;
		}

		if (canGoBack) {
			window.history.back();
			return;
		}

		App.exitApp();
	});


	return mobile;
}
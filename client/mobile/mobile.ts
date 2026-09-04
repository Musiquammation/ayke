import { StatusBar } from '@capacitor/status-bar';

export async function initMobile() {
	await StatusBar.hide();
}
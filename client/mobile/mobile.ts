import { StatusBar } from '@capacitor/status-bar';

export async function initMobile() {
	alert("Hello from mobile.ts");
	await StatusBar.hide();
}
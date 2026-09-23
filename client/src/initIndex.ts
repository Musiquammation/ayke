import protobuf from "protobufjs";
import { initProtocols } from "../../commons/protocolLoader";
import { dom, initDom } from "./dom/dom";
import { sendMessage } from "./messages/sendMessage";
import { hasNavigatorMobile, hasNavigatorMouse } from "./dom/clientNavigatorType";
import { resolveMobileInterface } from "./getMobile";


declare global {
	interface Window {
		PROTOCOLS_FOLDER: string;
		Capacitor: any;
	}
}


export default function() {
	initProtocols(async name => {
		const response = await fetch(window.PROTOCOLS_FOLDER + name + ".proto");
		const protoText = await response.text();
		return protobuf.parse(protoText).root;
	});
	

	initDom();

	dom.tryLoginWithKey();
	
	resolveMobileInterface(null);

	initImages();
}

function initImages() {
	// Set "Rye" font
	{
		const font = new FontFace(
			"Rye",
			`url(${window.IMG_ROOT_PATH}/fonts/Rye-Regular.ttf) format('truetype')`
		);

		font.load().then(
			() => document.fonts.add(font)
		);
	}

	document.getElementById("home-page")!.style.setProperty(
		'--home-background',
		`url("${window.IMG_ROOT_PATH}/assets/home-background.svg")`
	);
}

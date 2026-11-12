import protobuf from "protobufjs";
import { initProtocols } from "../../commons/protocolLoader";
import { dom, initDom } from "./dom/dom";
import { resolveMobileInterface } from "./getMobile";
import { gamemods } from "../../commons/gamemods";


declare global {
	interface Window {
		PROTOCOLS_FOLDER: string;
		Capacitor: any;
	}
}


export default function() {
	initProtocols(
		async name => {
			const response = await fetch(window.PROTOCOLS_FOLDER + name + ".proto");
			const protoText = await response.text();
			return protobuf.parse(protoText).root;
		},
		
		Object.entries(gamemods)
			.filter((entry): entry is [string, Exclude<typeof entry[1], { type: 'ui-separator' }>] => entry[1].type !== 'ui-separator')
			.map(([name, i]) => ({ type: i.type, name, protoFields: 'protoFields' in i ? i.protoFields : undefined }))
	);
	

	initDom();

	dom.tryLoginWithKey();
	
	import("../mobile/mobile").then(async m => {
		resolveMobileInterface(await m.initMobile());
	});

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

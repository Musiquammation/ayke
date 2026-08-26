import Alpine from "alpinejs";
import { gamemods } from "../../../commons/gamemods";
import { TemplateLoader } from "./TemplateLoader";
import { sendMessage } from "../messages/sendMessage";

declare global {
	interface Window {
		Alpine: any;
		dom: MainComponent;
	}
}

interface GamePanelData {
	produce: () => Uint8Array<ArrayBufferLike>;
}

class MainComponent {
	private currentPage = "index";
	private templateLoader = new TemplateLoader();

	protected gamePanel: GamePanelComponent | null = null;

	gamePanelHtml = "";

	// test data
	y0 = 0;
	y1 = 0;

	uses(page: string) {
		return this.currentPage === page;
	}

	openIndex() {
		this.currentPage = "index";
	}

	openTest() {
		this.currentPage = "test";
	}

	async openGamePanel(gamemode: string) {
		this.currentPage = "loading";

		const factory = gamemods[gamemode];

		if (!factory) {
			throw new Error(`Invalid gamemode '${gamemode}'`);
		}

		const data = factory.dom();
		this.gamePanel = new GamePanelComponent(gamemode, data);
		this.gamePanelHtml = await this.templateLoader.load(gamemode);
		this.currentPage = "game-panel";
	}

	openPlay() {
		this.currentPage = "play";
	}
}

class GamePanelComponent {
	constructor(
		public readonly gamemode: string,
		public readonly data: GamePanelData
	) {
		
	}

	uses(gamemode: string) {
		return this.gamemode === gamemode;
	}

	play() {
		sendMessage({
			startGame: {
				gamemode: "test",
				data: this.data.produce()
			}
		});

		/// TODO: remove
		setTimeout(() => {
			sendMessage({
				allowBotsOrder: true
			})	
		}, 1000);

	}
}

export const dom = Alpine.reactive(new MainComponent());

export function initDom() {
	document.addEventListener("alpine:init", () => {
		Alpine.data("main", () => dom);
	});

	window.Alpine = Alpine;
	window.dom = dom;

	Alpine.start();
}
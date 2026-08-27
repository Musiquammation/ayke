import Alpine from "alpinejs";
import { gamemods } from "../../../commons/gamemods";
import { TemplateLoader } from "./TemplateLoader";
import { sendMessage } from "../messages/sendMessage";
import { escapeHTML } from "../../../commons/util/escapeHTML";
import { deleteGameHandler } from "../handlers/GameHandler";
import { deleteWaitingPlayHandler, WaitingPlayHandlerUser } from "../handlers/WaitingPlayHandler";
import { imageLoader } from "../handlers/imageLoader";

declare global {
	interface Window {
		Alpine: any;
		dom: MainComponent;
	}
}

interface GamePanelData {
	produce: () => Uint8Array<ArrayBufferLike>;
}

interface PlayResults {
	results: number[][];
	teamEqualities: number[];
	playerEqualities: number[];
	scores: {
		delta: number;
		result: number;
		identifier: number;
	}[];
}

class MainComponent {
	private currentPage = "home";
	private templateLoader = new TemplateLoader();
	private loadingContext = "home";

	panel: (
		GamePanelComponent |
		WaitPlayPanelComponent |
		PlayResultsComponent |
		PlayComponent |
		null
	) = null;

	// test data
	y0 = 0;
	y1 = 0;

	startLoading() {
		this.loadingContext = this.currentPage;
		this.currentPage = "loading";
	}

	stopLoading() {
		this.currentPage = this.loadingContext;
	}

	uses(page: string) {
		return this.currentPage === page;
	}

	openHome() {
		this.panel = null;
		this.currentPage = "home";
	}

	openTest() {
		this.panel = null;
		this.currentPage = "test";
	}

	async openGamePanel(gamemode: string) {
		this.currentPage = "loading";

		const factory = gamemods[gamemode];
		if (!factory) {
			throw new Error(`Invalid gamemode '${gamemode}'`);
		}

		const data = factory.dom();
		const html = await this.templateLoader.load(gamemode);
		this.panel = new GamePanelComponent(gamemode, data, html);
		this.currentPage = "game-panel";
	}

	async openWaitPlayPanel(gamemode: string) {
		this.panel = new WaitPlayPanelComponent(gamemode);
		this.currentPage = "wait-play";
	}

	openPlay() {
		const panel = this.getWaitPlayPanel();
		this.panel = panel.createPlay();
		this.currentPage = "play";
		deleteWaitingPlayHandler();
	}

	/**
	 * Transition to the play-results page using the current PlayComponent 
	 * context to preserve pseudos and player metadata.
	 */
	openPlayResults(results: PlayResults) {
		const playPanel = this.getPanel(PlayComponent);
		this.panel = playPanel.createPlayResults(results);
		this.currentPage = "play-results";
		deleteGameHandler();
	}







	getPanel<T>(type: new (...args: any[]) => T): T {
		if (this.panel instanceof type) {
			return this.panel;
		}

		throw new Error("Invalid type for panel");
	}

	getWaitPlayPanel() {
		return this.getPanel(WaitPlayPanelComponent);
	}
}

class GamePanelComponent {
	constructor(
		public readonly gamemode: string,
		public readonly data: GamePanelData,
		public readonly htmlContent: string
	) {}

	uses(gamemode: string) {
		return this.gamemode === gamemode;
	}

	async play() {
		const factory = gamemods[this.gamemode];
		if (!factory) {
			throw new Error(`Invalid gamemode '${this.gamemode}'`);
		}

		dom.startLoading();
		await imageLoader.load(factory.textures);
		dom.stopLoading();

		dom.openWaitPlayPanel(this.gamemode);

		sendMessage({
			startGame: {
				gamemode: this.gamemode,
				data: this.data.produce()
			}
		});
	}
}

class WaitPlayPanelComponent {
	users: Record<number, WaitingPlayHandlerUser> = {};
	private allowBots = false;
	private logs: string[] = [];
	private me = -1;

	constructor(private readonly gamemode: string) {}

	initComponent(me: number) {
		this.me = me;
	}

	add(user: WaitingPlayHandlerUser, identifier: number) {
		// Creating a shallow clone forces Alpine.js to notice object additions
		this.users = {
			...this.users,
			[identifier]: user
		};
		this.notify(`${this.showPseudo(user.pseudo)} joined the room`);
	}

	remove(identifier: number) {
		if (this.users[identifier]) {
			this.notify(`${this.showPseudo(this.users[identifier].pseudo)} left the room`);
			const updated = { ...this.users };
			delete updated[identifier];
			this.users = updated;
		}
	}

	updateBotAllow(user: WaitingPlayHandlerUser, identifier: number, allow: boolean) {
		this.users = {
			...this.users,
			[identifier]: {
				...user,
				allowBots: allow
			}
		};

		this.notify(`${
			this.showPseudo(user.pseudo)
		} ${
			allow ? "accepts" : "refuses"
		} bots`);
	}

	listUsers() {
		console.log("call", this.users);
		return Object.values(this.users);
	}

	showPseudo(pseudo: string | undefined | null) {
		if (pseudo) return escapeHTML(pseudo);
		return "<i>(anonymous)</i>";
	}

	private notify(msg: string) {
		console.log(msg);
		this.logs.push(msg);
	}

	private onAllowBotsChange() {
		sendMessage({
			allowBotsOrder: this.allowBots
		});
	}

	/**
	 * Creates a PlayComponent instance using the current connected users mapping.
	 */
	createPlay() {
		const pseudos: Record<number, string | null> = {};
		for (const [id, user] of Object.entries(this.users)) {
			pseudos[Number(id)] = user.pseudo ?? null;
		}
		return new PlayComponent(pseudos, this.me);
	}
}

class PlayComponent {
	constructor(
		readonly pseudos: Record<number, string | null>,
		readonly me: number
	) {}

	/**
	 * Creates a PlayResultsComponent instance carrying over player pseudos and the me identifier.
	 */
	createPlayResults(results: PlayResults) {
		return new PlayResultsComponent(results, this.pseudos, this.me);
	}
}

class PlayResultsComponent {
	constructor(
		readonly results: PlayResults,
		readonly pseudos: Record<number, string | null>,
		readonly me: number
	) {}

	/**
	 * Helper method to render pseudo HTML safely within the Alpine component view.
	 */
	showPseudo(pseudo: string | undefined | null) {
		if (pseudo) return escapeHTML(pseudo);
		return "<i>(anonymous)</i>";
	}

	returnHome() {
		dom.openHome();
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
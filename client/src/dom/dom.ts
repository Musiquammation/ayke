import Alpine from "alpinejs";
import { gamemods, getGmFactory, getMultiGmFactory, getSoloGmFactory } from "../../../commons/gamemods";
import { TemplateLoader } from "./TemplateLoader";
import { sendMessage } from "../messages/sendMessage";
import { escapeHTML } from "../../../commons/util/escapeHTML";
import { deleteGameHandler } from "../handlers/GameHandler";
import { deleteWaitingPlayHandler, WaitingPlayHandlerUser } from "../handlers/WaitingPlayHandler";
import { imageLoader } from "../handlers/imageLoader";
import { LocalGameHandler } from "../handlers/LocalGameHandler";
import { hasNavigatorMobile, hasNavigatorMouse } from "./clientNavigatorType";
import { SoloGameMode } from "../../../commons/SoloGameMode";
import { SoloGameHandler } from "../handlers/SoloGameHandler";
import { waitSkinsResponsePromise } from "../messages/recvMessage";

declare global {
	interface Window {
		Alpine: any;
		dom: MainComponent;
		DEBUG: boolean;
	}
}

interface GamePanelData {
	produce: () => Uint8Array<ArrayBufferLike>;
}

interface SoloGamePanelData {
	produce: () => string;
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

const STORAGE_KEY_CONNECTION = "ayke_connectionKey";

class MainComponent {
	private currentPage = "home";
	private templateLoader = new TemplateLoader();
	private loadingContext = "home";

	// Track whether the user is currently authenticated
	isAuthenticated = false;
	pseudo: string | null = null;

	panel: (
		GamePanelComponent |
		SoloGamePanelComponent |
		WaitPlayPanelComponent |
		PlayResultsComponent |
		SoloPlayResultComponent |
		PlayComponent |
		SoloPlayComponent |
		LoginComponent |
		SigninComponent |
		HomeComponent |
		TutorialInplayComponent |
		LeaderboardComponent |
		SoloLeaderboardComponent |
		null
	) = new HomeComponent();

	// Test data
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
		this.panel = new HomeComponent();
		this.currentPage = "home";
	}

	openTest() {
		this.panel = null;
		this.currentPage = "test";
	}

	openLogin() {
		this.panel = new LoginComponent();
		this.currentPage = "login";
	}

	openSignin() {
		this.panel = new SigninComponent();
		this.currentPage = "signin";
	}

	/**
	 * Attempt auto-login using a stored connection key from localStorage.
	 */
	tryLoginWithKey() {
		const key = localStorage.getItem(STORAGE_KEY_CONNECTION);
		if (key) {
			sendMessage({
				loginWithKey: key
			});
		}
	}

	/**
	 * Disconnect the current user, clear local connection state,
	 * and inform the server.
	 */
	disconnect() {
		const key = localStorage.getItem(STORAGE_KEY_CONNECTION);

		if (key) {
			sendMessage({
				deleteConnectionKey: key
			});

			localStorage.removeItem(STORAGE_KEY_CONNECTION);
		}

		this.isAuthenticated = false;
		this.openHome();
	}

	async openGamePanel(gamemode: string) {
		this.currentPage = "loading";

		const factory = getGmFactory(gamemode);
		let unlockedSkins;
		if (factory.type === 'multiplayer') {
			if (factory.skins.length === 0) {
				unlockedSkins = 0;
			} else if (this.pseudo === null) {
				unlockedSkins = [factory.skins[0]];
			} else {
				sendMessage({askSkins: gamemode});
				unlockedSkins = await waitSkinsResponsePromise();
			}

		}

		const html = await this.templateLoader.load(gamemode);
		this.currentPage = "game-panel";


		if (factory.type === 'multiplayer') {
			const data = factory.dom(unlockedSkins);
			this.panel = new GamePanelComponent(gamemode, data, html);
		} else {
			const category = factory.dom();
			this.panel = new SoloGamePanelComponent(gamemode, category, html);
		}

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

	openSoloComponent(result: number) {
		this.panel = new SoloPlayResultComponent(result);
		this.currentPage = "play-solo-results";
	}

	openTutorialInPlay(gamemode: string) {
		this.currentPage = "play";
		this.panel = new TutorialInplayComponent(
			new LocalGameHandler(gamemode)
		);
	}

	openSoloPlayComponent(gamemodeId: string, game: SoloGameMode, category: string) {
		this.panel = new SoloPlayComponent(gamemodeId, game, category);
		this.currentPage = "play";
	}

	openLeaderboard() {
		const panel = new LeaderboardComponent();
		this.panel = panel;
		this.currentPage = "leaderboard";
		panel.fetchLeaderboard();
	}

	openSoloLeaderboard() {
		const panel = new SoloLeaderboardComponent();
		this.panel = panel;
		this.currentPage = "solo-leaderboard";
		panel.fetchRecords();
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

	getLoginPanel() {
		return this.getPanel(LoginComponent);
	}

	getSigninPanel() {
		return this.getPanel(SigninComponent);
	}

	getTutorialInplayComponent() {
		return this.getPanel(TutorialInplayComponent);
	}

	getLeaderboardPanel() {
		return this.getPanel(LeaderboardComponent);
	}

	getSoloLeaderboardPanel() {
		return this.getPanel(SoloLeaderboardComponent);
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
		const factory = getMultiGmFactory(this.gamemode);
		dom.startLoading();
		await imageLoader.load(factory.textures, this.gamemode);
		dom.stopLoading();

		dom.openWaitPlayPanel(this.gamemode);

		sendMessage({
			startGame: {
				gamemode: this.gamemode,
				data: this.data.produce()
			}
		});
	}

	async tutorial() {
		const factory = getMultiGmFactory(this.gamemode);

		dom.startLoading();
		await imageLoader.load(factory.textures, this.gamemode);
		dom.stopLoading();

		dom.openTutorialInPlay(this.gamemode);
	}
}

class SoloGamePanelComponent {
	constructor(
		public readonly gamemode: string,
		public readonly data: SoloGamePanelData,
		public readonly htmlContent: string
	) {}

	uses(gamemode: string) {
		return this.gamemode === gamemode;
	}

	async play() {
		const factory = getSoloGmFactory(this.gamemode);
		dom.startLoading();
		await imageLoader.load(factory.textures);
		dom.stopLoading();
		dom.openSoloPlayComponent(
			this.gamemode,
			factory.create(),
			this.data.produce()
		)
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

class SoloPlayComponent {
	public readonly game;
	private readonly text = "";

	constructor(gamemodeId: string, game: SoloGameMode, category: string) {
		this.game = new SoloGameHandler(gamemodeId, game, category);
		this.game.start();
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

class SoloPlayResultComponent {
	constructor(
		readonly result: number
	) {

	}

	returnHome() {
		dom.openHome();
	}
}

// Component handling the login form logic
class LoginComponent {
	pseudo = "";
	password = "";
	errorMessage = "";

	submitLogin() {
		this.errorMessage = "";
		sendMessage({
			login: {
				pseudo: this.pseudo,
				password: this.password
			}
		});
	}
}

// Component handling the account creation form logic
class SigninComponent {
	pseudo = "";
	password = "";
	errorMessage = "";

	submitSignin() {
		this.errorMessage = "";
		sendMessage({
			createAccount: {
				pseudo: this.pseudo,
				password: this.password
			}
		});
	}
}

class HomeComponent {
	private games: { category: string; list: any[]; }[];
	private readonly hasMobile = hasNavigatorMobile();
	private readonly hasMouse = hasNavigatorMouse();

	constructor() {
		this.games = [];

		for (const [key, gamemode] of Object.entries(gamemods)) {
			if ((key === 'test' || key === 'testSolo') && !window.DEBUG) {
				continue;
			}


			if (gamemode.type === 'ui-separator') {
				this.games.push({
					category: gamemode.category,
					list: []
				});

				continue;
			}

			if (this.games.length === 0) {
				continue;
			}

			this.games[this.games.length - 1].list.push({
				key,
				computerOnly: gamemode.computerOnly,
				name: gamemode.name
			});
		}
	}

	isDisabled(gamemode: string) {
		const gm = gamemods[gamemode];
		if (!gm || gm.type === 'ui-separator')
			return false;

		return gm.computerOnly && !this.hasMouse;
	}

	playGame(gamemode: string) {
		if (this.isDisabled(gamemode)) {
			alert("This game is reserved to PC players");
			return
		}

		dom.openGamePanel(gamemode);
	}
}


class TutorialInplayComponent {
	private readonly TUTORIAL_MARKER = true;

	private text = "";

	constructor(public readonly game: LocalGameHandler) {
		dom.startLoading();
		game.start().finally(() => dom.stopLoading());
	}

	setText(text: string) {
		this.text = text;
	}
}

class LeaderboardComponent {
	entries: { pseudo: string; trophees: number }[] = [];
	gamemode: string | null = null;
	page: number = 0;

	// Exposing imported gamemods for the UI dropdown
	gamemods = gamemods;

	/**
	 * Requests the latest leaderboard slice from the server based on current filters.
	 */
	fetchLeaderboard() {
		sendMessage({
			askLeaderboard: {
				gamemode: this.gamemode,
				page: this.page
			}
		});
	}

	/**
	 * Updates the current gamemode category, resets the page, and fetches new data.
	 */
	setGamemode(mode: string | null) {
		this.gamemode = mode;
		this.page = 0;
		this.fetchLeaderboard();
	}

	nextPage() {
		this.page++;
		this.fetchLeaderboard();
	}

	prevPage() {
		if (this.page > 0) {
			this.page--;
			this.fetchLeaderboard();
		}
	}

	rank(index: number): number {
		if (index === 0)
			return this.page * 64 + 1;

		if (this.entries[index].trophees === this.entries[index - 1].trophees)
			return this.rank(index - 1);

		return this.page * 64 + index + 1;
	}
}

class SoloLeaderboardComponent {
	entries: { pseudo: string | null; score: number }[] = [];

	gamemode: string;
	category: string;

	constructor() {
		this.gamemode = "";
		this.category = "";
		for (let key in gamemods) {
			if (gamemods[key].type === 'solo') {
				this.gamemode = key;
				this.category = gamemods[key].categories[0];
			}
		}
	}

	page: number = 0;

	// Expose imported gamemods to the Alpine template.
	gamemods = Object.fromEntries(
		Object.entries(gamemods).filter(([_, factory]) => factory.type === 'solo')
	);;

	// Available categories for the current game mode.
	getCategories() {
		return getSoloGmFactory(this.gamemode).categories
	}

	/**
	 * Request the current solo leaderboard page from the server.
	 */
	fetchRecords() {
		sendMessage({
			askSoloRecords: {
				gamemode: this.gamemode,
				category: this.category,
				page: this.page
			}
		});
	}

	/**
	 * Update the selected game mode and reset the page.
	 */
	setGamemode(mode: string) {
		this.gamemode = mode;
		this.page = 0;
		this.fetchRecords();
	}

	/**
	 * Update the selected category and reset the page.
	 */
	setCategory(category: string) {
		this.category = category;
		this.page = 0;
		this.fetchRecords();
	}

	/**
	 * Go to the next leaderboard page.
	 */
	nextPage() {
		this.page++;
		this.fetchRecords();
	}

	/**
	 * Go to the previous leaderboard page.
	 */
	prevPage() {
		if (this.page > 0) {
			this.page--;
			this.fetchRecords();
		}
	}

	/**
	 * Calculate the rank of an entry, taking ties into account.
	 */
	rank(index: number): number {
		if (index === 0)
			return this.page * 64 + 1;

		if (this.entries[index].score === this.entries[index - 1].score)
			return this.rank(index - 1);

		return this.page * 64 + index + 1;
	}

	/**
	 * Replace the current leaderboard entries with the server response.
	 */
	setSoloRecords(d: {
		entries: {
			pseudo: string | null;
			score: number;
		}[];
	}) {
		this.entries = d.entries;
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
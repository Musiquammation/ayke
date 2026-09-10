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
import { dynamicCssHandler } from "../handlers/DynamicCssHandler";
import { fullScreenHandler } from "../handlers/FullScreenHandler";
import { Collectible } from "../../../commons/Collectible";

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

/* -------------------------------------------------------------------------------------------
 * URL fragment handling.
 *
 * Every time MainComponent switches to a new panel, we mirror that navigation into
 * `window.location.hash` so the URL, the browser's back/forward buttons and page reloads
 * stay in sync with the app.
 *
 * There are two kinds of panels ("markers"):
 *
 *  1. Fragment-savable panels: the component exposes `saveFragment()` (returns a flat set of
 *     simple, string-serializable properties) and a `static openFragment(props)` able to
 *     rebuild an equivalent instance from those properties. These are simple enough to be
 *     fully encoded in the URL, e.g. `#leaderboard?gamemode=foo&page=2`. Opening one of these
 *     clears the in-memory stack (see below) since it's no longer reachable in a meaningful way.
 *
 *  2. Stack-based panels: everything else (panels holding live sockets, handlers, DOM state,
 *     etc. that can't be cheaply serialized). These are kept alive in an in-memory array
 *     (`stack`), and the URL only stores the current index: `#on-stack?position=1`. Pushing a
 *     new stack panel while not at the end of the stack drops everything after the current
 *     position first (the same way browser history works).
 * ---------------------------------------------------------------------------------------- */

/** Union of every possible non-null `MainComponent.panel` value. */
type Panel = NonNullable<MainComponent["panel"]>;

/** Implemented by panels simple enough to be fully described by a few string properties. */
interface FragmentSavable {
	saveFragment(): Record<string, string>;
}

/** The static side that must accompany a `FragmentSavable` panel's class. */
interface FragmentSavableStatics {
	/** Identifier used as the URL fragment name, e.g. "login" -> "#login". */
	fragmentName: string;
	/** Rebuilds an instance from properties previously produced by saveFragment(). */
	openFragment(props: Record<string, string>): Panel;
}

/** Runtime check for the "type 1" marker described above. */
function isFragmentSavable(panel: Panel): panel is Panel & FragmentSavable {
	const ctor = panel.constructor as Partial<FragmentSavableStatics>;
	return (
		typeof (panel as Partial<FragmentSavable>).saveFragment === "function" &&
		typeof ctor.openFragment === "function" &&
		typeof ctor.fragmentName === "string"
	);
}

class MainComponent {
	private _currentPage = "home";
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

	get currentPage() {
		return this._currentPage;
	}

	set currentPage(value: string) {
		this._currentPage = value;
	}

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
		pushUrlStack(this);
	}

	openTest() {
		this.panel = null;
		this.currentPage = "test";
		// Debug-only page: intentionally not reflected in the URL.
	}

	openLogin() {
		this.panel = new LoginComponent();
		this.currentPage = "login";
		pushUrlStack(this);
	}

	openSignin() {
		this.panel = new SigninComponent();
		this.currentPage = "signin";
		pushUrlStack(this);
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
				unlockedSkins = [];
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

		pushUrlStack(this);
	}

	async openWaitPlayPanel(gamemode: string) {
		this.panel = new WaitPlayPanelComponent(gamemode);
		this.currentPage = "wait-play";
		pushUrlStack(this);
	}

	openPlay() {
		const panel = this.getWaitPlayPanel();
		this.panel = panel.createPlay();
		this.currentPage = "play";
		deleteWaitingPlayHandler();
		pushUrlStack(this);
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
		pushUrlStack(this);
	}

	openSoloComponent(result: number) {
		this.panel = new SoloPlayResultComponent(result);
		this.currentPage = "play-solo-results";
		pushUrlStack(this);
	}

	openTutorialInPlay(gamemode: string) {
		this.currentPage = "play";
		this.panel = new TutorialInplayComponent(
			new LocalGameHandler(gamemode, false)
		);
		pushUrlStack(this);
	}

	openVsBotsInPlay(gamemode: string) {
		this.currentPage = "play";
		this.panel = new TutorialInplayComponent(
			new LocalGameHandler(gamemode, true)
		);
		pushUrlStack(this);
	}

	openSoloPlayComponent(gamemodeId: string, game: SoloGameMode, category: string) {
		this.panel = new SoloPlayComponent(gamemodeId, game, category);
		this.currentPage = "play";
		pushUrlStack(this);
	}

	openLeaderboard() {
		const panel = new LeaderboardComponent();
		this.panel = panel;
		this.currentPage = "leaderboard";
		panel.fetchLeaderboard();
		pushUrlStack(this);
	}

	openSoloLeaderboard() {
		const panel = new SoloLeaderboardComponent();
		this.panel = panel;
		this.currentPage = "solo-leaderboard";
		panel.fetchRecords();
		pushUrlStack(this);
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

	getGamePanel() {
		return this.getPanel(GamePanelComponent);
	}

	getHomePanel() {
		return this.getPanel(HomeComponent);
	}

}


interface CollectibleItem {
	id: number,
	name: string,
	trophees: number,
	unlocked: boolean,
	unlockable:  boolean
}

class GamePanelComponent {
	// --- Trophy road state ---
	trophees = 0;
	bestTrophees = 0;
	unlockedCollectibleIds: number[] | null = null;
	collectibleItems: CollectibleItem[] = [];

	// --- Trophy Road Layout Configuration ---
	readonly pixelsPerTrophy;
	readonly paddingStart = 60;     // Initial padding (px) before 0 trophies
	readonly paddingEnd = 120;      // Extra padding (px) extending past the last collectible

	constructor(
		public readonly gamemode: string,
		public readonly data: GamePanelData,
		public readonly htmlContent: string
	) {
		this.pixelsPerTrophy = getMultiGmFactory(gamemode).tropheeRoalPixelsPerTrophy;
	}

	uses(gamemode: string) {
		return this.gamemode === gamemode;
	}

	async play() {
		const factory = getMultiGmFactory(this.gamemode);
		dom.startLoading();
		await imageLoader.load(factory.textures, this.gamemode);
		await dynamicCssHandler.load(this.gamemode);
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
		await dynamicCssHandler.load(this.gamemode);
		dom.stopLoading();

		dom.openTutorialInPlay(this.gamemode);
	}

	async againstBots() {
		const factory = getMultiGmFactory(this.gamemode);

		dom.startLoading();
		await imageLoader.load(factory.textures, this.gamemode);
		await dynamicCssHandler.load(this.gamemode);
		dom.stopLoading();

		dom.openVsBotsInPlay(this.gamemode);
	}

	// Called by x-init when the trophy road mounts (only if authenticated).
	initTrophyRoad() {
		const factory = getMultiGmFactory(this.gamemode);
		if (!factory.collectibles) return;

		if (this.unlockedCollectibleIds === null) {
			sendMessage({ askProgression: { gamemode: this.gamemode } });
			return;
		}

		const unlockedCollectibleIds = this.unlockedCollectibleIds;

		this.collectibleItems = (
			factory.collectibles
			.slice()
			.sort((a, b) => a.trophees - b.trophees)
			.map(c => {
				const unlocked = unlockedCollectibleIds.includes(c.id);

				const unlockable = (
					!unlocked &&
					c.trophees <= this.bestTrophees
				);

				return {
					id: c.id,
					name: c.name,
					trophees: c.trophees,
					unlocked,
					unlockable
				}
			})
		);
		

	}

	// Called from recvMessage.ts when the server answers askProgression.
	onProgressionResult(d: {
		gamemode: string,
		trophees: number,
		bestTrophees: number,
		unlockedCollectibleIds: number[],
	}) {
		if (d.gamemode !== this.gamemode) return;

		// Append trophy road data
		
		this.trophees = d.trophees;
		this.bestTrophees = d.bestTrophees;
		this.unlockedCollectibleIds = d.unlockedCollectibleIds;
		this.initTrophyRoad();

		// Auto-scroll track to center on current progression position
		setTimeout(() => this.scrollToCurrentProgress(), 50);
	}

	get gamemodeName() {
		return getGmFactory(this.gamemode).name;
	}

	// Highest trophy threshold on the road
	get collectiblesTotal() {
		if (this.collectibleItems.length === 0) return 0;
		return this.collectibleItems[this.collectibleItems.length - 1].trophees;
	}

	// Total length of the track in pixels (ends slightly past the last collectible)
	get trackWidth() {
		return (this.collectiblesTotal * this.pixelsPerTrophy) + this.paddingEnd;
	}

	// Pixel offset for current trophies
	get currentPx() {
		return this.trophees * this.pixelsPerTrophy;
	}

	// Pixel offset for best trophies
	get bestPx() {
		return this.bestTrophees * this.pixelsPerTrophy;
	}

	// Calculates horizontal pixel offset for a given trophy count
	getItemLeftPx(trophees: number) {
		return this.paddingStart + (trophees * this.pixelsPerTrophy);
	}

	// Smoothly scrolls the track container to center the current progress
	scrollToCurrentProgress() {
		const track = document.querySelector('.trophee-road-track') as HTMLElement;
		if (!track) return;
		const currentPosition = this.getItemLeftPx(this.trophees);
		const targetScrollLeft = currentPosition - (track.clientWidth / 2);
		track.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' });
	}

	// Draws a collectible's icon on its canvas. Called via x-init on the <canvas>.
	async drawCollectibleIcon(canvas: HTMLCanvasElement, item: CollectibleItem) {
		const factory = getMultiGmFactory(this.gamemode);
		const collectible = factory.collectibles?.find(c => c.id === item.id);
		const ctx = canvas.getContext("2d");
		if (!collectible || !ctx) return;

		if (item.unlockable) {
			ctx.fillStyle = "#f5cc00";
		} else if (item.unlocked) {
			ctx.fillStyle = "#967404";
		} else {
			ctx.fillStyle = "#808080";
		}

		ctx.fillRect(0, 0, canvas.width, canvas.height);
		await collectible.drawIcon(ctx, Math.max(canvas.width, canvas.height));
	}

	// Called from the "Unlock" button.
	unlockCollectible(item: { id: number; name: string; trophees: number; unlocked: boolean }) {
		// Guard condition: must have bestTrophees >= item.trophees to unlock
		if (this.bestTrophees < item.trophees) return;

		sendMessage({ unlockCollectible: { gamemode: this.gamemode, collectibleId: item.id } });
	}

	// Called from recvMessage.ts when the server answers unlockCollectible.
	onUnlockResult(d: { success: boolean; collectibleId: number; gamemode: string }) {
		if (d.gamemode !== this.gamemode || !d.success) return;

		const item = this.collectibleItems.find(i => i.id === d.collectibleId);
		if (!item) return;

		sendMessage({ askProgression: { gamemode: this.gamemode } });

		item.unlocked = true;

		setTimeout(() => {
			alert(`You unlocked "${item.name}"`);
		});
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
		await dynamicCssHandler.load(this.gamemode);
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
	// --- Fragment-savable marker: trivial to rebuild from just the numeric result. ---
	static readonly fragmentName = "play-solo-results";

	saveFragment(): Record<string, string> {
		return { result: String(this.result) };
	}

	static openFragment(props: Record<string, string>) {
		return new SoloPlayResultComponent(Number(props.result));
	}
	// ---------------------------------------------------------------------------------

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
	// --- Fragment-savable marker: nothing to persist besides "we're on the login page". ---
	static readonly fragmentName = "login";

	saveFragment(): Record<string, string> {
		return {};
	}

	static openFragment(_props: Record<string, string>) {
		return new LoginComponent();
	}
	// -----------------------------------------------------------------------------------

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
	// --- Fragment-savable marker. ---
	static readonly fragmentName = "signin";

	saveFragment(): Record<string, string> {
		return {};
	}

	static openFragment(_props: Record<string, string>) {
		return new SigninComponent();
	}
	// --------------------------------

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
	// --- Fragment-savable marker. ---
	static readonly fragmentName = "home";

	saveFragment(): Record<string, string> {
		return {};
	}

	static openFragment(_props: Record<string, string>) {
		return new HomeComponent();
	}
	// --------------------------------

	private games: { category: string; list: any[]; }[];
	private readonly hasMobile = hasNavigatorMobile();
	private readonly hasMouse = hasNavigatorMouse();
	totalTrophees = "(?)";
	coins = "(?)";
	globalRank = "(?)";

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

		this.refreshAccountInfo();
	}

	getImageSrc(gamemode: string) {
		const ext = getGmFactory(gamemode).iconExtension;
		return `${window.IMG_ROOT_PATH}/assets/games/${gamemode}/icon.${ext}`;
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

	refreshAccountInfo() {
		if (_internalDom && !_internalDom.isAuthenticated) return;
		sendMessage({ askAccountInfo: {} });
	}

	// Called from recvMessage.ts when the server answers askAccountInfo.
	onAccountInfo(d: { totalTrophees: number; coins: number; globalRank: number }) {
		this.totalTrophees = String(d.totalTrophees);
		this.coins = String(d.coins);
		this.globalRank = String(d.globalRank);
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
	// --- Fragment-savable marker: gamemode + page fully describe this panel. ---
	static readonly fragmentName = "leaderboard";

	saveFragment(): Record<string, string> {
		const props: Record<string, string> = { page: String(this.page) };
		if (this.gamemode !== null) {
			props.gamemode = this.gamemode;
		}
		return props;
	}

	static openFragment(props: Record<string, string>) {
		const panel = new LeaderboardComponent();
		panel.gamemode = props.gamemode ?? null;
		panel.page = props.page ? Number(props.page) : 0;
		panel.fetchLeaderboard();
		return panel;
	}
	// -----------------------------------------------------------------------------

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
	// --- Fragment-savable marker: gamemode + category + page fully describe this panel. ---
	static readonly fragmentName = "solo-leaderboard";

	saveFragment(): Record<string, string> {
		return {
			gamemode: this.gamemode,
			category: this.category,
			page: String(this.page)
		};
	}

	static openFragment(props: Record<string, string>) {
		const panel = new SoloLeaderboardComponent();
		if (props.gamemode) panel.gamemode = props.gamemode;
		if (props.category) panel.category = props.category;
		panel.page = props.page ? Number(props.page) : 0;
		panel.fetchRecords();
		return panel;
	}
	// -------------------------------------------------------------------------------------

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

/* -------------------------------------------------------------------------------------------
 * Fragment registry: maps a URL fragment name (e.g. "leaderboard") to the page string and the
 * static `openFragment` used to rebuild the matching panel when the app boots on that hash, or
 * when the user navigates back/forward to it.
 * ---------------------------------------------------------------------------------------- */
const fragmentRegistry = new Map<string, {
	page: string;
	openFragment: (props: Record<string, string>) => Panel;
}>();

function registerFragment(name: string, page: string, openFragment: (props: Record<string, string>) => Panel) {
	fragmentRegistry.set(name, { page, openFragment });
}

registerFragment(HomeComponent.fragmentName, "home", HomeComponent.openFragment);
registerFragment(LoginComponent.fragmentName, "login", LoginComponent.openFragment);
registerFragment(SigninComponent.fragmentName, "signin", SigninComponent.openFragment);
registerFragment(SoloPlayResultComponent.fragmentName, "play-solo-results", SoloPlayResultComponent.openFragment);
registerFragment(LeaderboardComponent.fragmentName, "leaderboard", LeaderboardComponent.openFragment);
registerFragment(SoloLeaderboardComponent.fragmentName, "solo-leaderboard", SoloLeaderboardComponent.openFragment);

/** One entry of the in-memory navigation stack (for panels that can't be serialized). */
interface StackEntry {
	page: string;
	panel: Panel;
}

class UrlFragmentManager {
	/** Non-serializable panels kept alive so we can navigate back/forward to them. */
	private stack: StackEntry[] = [];
	/** Index of the entry currently shown; -1 when the stack is empty. */
	private position = -1;
	/**
	 * The last hash value *we* applied ourselves (via push/goToPosition). Lets the
	 * hashchange listener tell our own writes apart from a genuine user-triggered
	 * back/forward navigation.
	 */
	private lastAppliedHash = "";

	init() {
		window.addEventListener("hashchange", () => this.onHashChange());

		const hash = window.location.hash.slice(1);
		if (hash) {
			this.lastAppliedHash = hash;
			this.restore(hash);
		}
	}

	/**
	 * Registers `panel` (now shown on `page`) and updates the URL fragment accordingly.
	 * This is the single entry point called from MainComponent whenever the displayed
	 * panel changes — see `pushUrlStack`.
	 */
	push(panel: Panel, page: string) {
		if (isFragmentSavable(panel)) {
			// Type 1 marker: the panel's state is entirely recoverable from the URL, so the
			// stack (which only exists to let us return to non-serializable panels) is no
			// longer reachable/needed.
			this.stack = [];
			this.position = -1;

			const ctor = panel.constructor as unknown as FragmentSavableStatics;
			const props = panel.saveFragment();
			this.setHash(this.buildFragmentHash(ctor.fragmentName, props));
			return;
		}

		// Type 2 marker: too complex to serialize. Keep the actual instance in memory and
		// remember its position. Anything ahead of the current position becomes unreachable
		// and is dropped first, exactly like a normal browser history stack.
		this.stack = this.stack.slice(0, this.position + 1);
		this.stack.push({ page, panel });
		this.position = this.stack.length - 1;

		this.setHash(`on-stack?position=${this.position}`);
	}

	/** Jump to an arbitrary position within the in-memory stack (e.g. an in-app "back" button). */
	goToPosition(position: number) {
		const entry = this.stack[position];
		if (!entry) return;

		this.position = position;
		dom.panel = entry.panel;
		dom.currentPage = entry.page;
		this.setHash(`on-stack?position=${position}`);
	}

	private buildFragmentHash(name: string, props: Record<string, string>) {
		const query = new URLSearchParams(props).toString();
		return query ? `${name}?${query}` : name;
	}

	private setHash(hash: string) {
		this.lastAppliedHash = hash;
		window.location.hash = hash;
	}

	private onHashChange() {
		const hash = window.location.hash.slice(1);

		if (hash === this.lastAppliedHash) {
			// We caused this change ourselves (via push/goToPosition) — already applied, skip.
			return;
		}

		this.lastAppliedHash = hash;
		this.restore(hash);
	}

	/**
	 * Applies whatever page/panel a given hash describes. Used both for the initial page
	 * load and for real back/forward navigation caught by the hashchange listener.
	 */
	private restore(hash: string) {
		const [name, query] = hash.split("?");
		const props = Object.fromEntries(new URLSearchParams(query ?? ""));

		if (name === "on-stack") {
			const position = Number(props.position);
			const entry = this.stack[position];

			if (entry) {
				this.position = position;
				dom.panel = entry.panel;
				dom.currentPage = entry.page;
			} else {
				// Nothing in memory for this position (e.g. a fresh page reload) — there's
				// nowhere sensible to restore to, so fall back to home.
				dom.openHome();
			}
			return;
		}

		const registered = fragmentRegistry.get(name);
		if (!registered) {
			dom.openHome();
			return;
		}

		this.stack = [];
		this.position = -1;
		dom.panel = registered.openFragment(props);
		dom.currentPage = registered.page;
	}
}

const urlFragmentManager = new UrlFragmentManager();

/**
 * Call this right after switching `dom.panel`/`dom.currentPage` to a new page, e.g.
 * `pushUrlStack(this)` at the end of a MainComponent `open*` method (`this` being the
 * MainComponent instance). Reflects the new panel into the URL fragment.
 */
export function pushUrlStack(main: MainComponent) {
	if (main.panel === null) return;
	urlFragmentManager.push(main.panel, main.currentPage);
}

/** Navigate to an arbitrary position in the in-memory navigation stack. */
export function goToUrlStackPosition(position: number) {
	urlFragmentManager.goToPosition(position);
}

let _internalDom: any = null;


export const dom = Alpine.reactive(new MainComponent());

_internalDom = dom;

export function initDom() {
	document.addEventListener("alpine:init", () => {
		Alpine.data("main", () => dom);
	});

	window.Alpine = Alpine;
	window.dom = dom;

	Alpine.start();

	urlFragmentManager.init();
}
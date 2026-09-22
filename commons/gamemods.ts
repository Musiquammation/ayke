import { ActionNode } from "./Bot";
import { Collectible } from "./Collectible";
import { GameMode, MultiplayerClientEntry } from "./GameMode";
import { GMAirBasket } from "./gamemods/GMAirBasket";
import { GMRoarsOnGlass } from "./gamemods/GMRoarsOnGlass";
import { GMSuperTicTacToe } from "./gamemods/GMSuperTicTacToe";
import { GMTest } from "./gamemods/GMTest";
import { GMTestSolo } from "./gamemods/GMTestSolo";
import { GMTurrets } from "./gamemods/GMTurrets";
import { GMWoodSword } from "./gamemods/GMWoodSword";
import { SoloGameMode } from "./SoloGameMode";
import { GMMoveArmy } from "./gamemods/GMMoveArmy";
import { GMPopit } from "./gamemods/GMPopit";
import { GMLavaBall } from "./gamemods/GMLavaBall";

import bots_test from "./bots/bots-test";
import bots_airbasket from "./bots/bots-airbasket";
import bots_turrets from "./bots/bots-turrets";
import bots_superTicTacToe from "./bots/bots-superTicTacToe";
import bots_roarsOnGlass from "./bots/bots-roarsOnGlass";
import bots_woodSword from "./bots/bots-woodSword";
import bots_moveArmy from "./bots/bots-moveArmy";
import bots_popit from "./bots/bots-popit";
import bots_lavaBall from "./bots/bots-lavaBall";

import collectibles_test from "./collectibles/collectibles_test";
import collectibles_airbasket from "./collectibles/collectibles_airbasket";


interface Player {
	trophees: number;
	data: Uint8Array;
	pseudo: string | null;
}


interface MultiplayerFactory {
	type: 'multiplayer';
	server(
		players: Player[],
		total: number,
		hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
	): Promise<{ game: GameMode, data: Uint8Array }>,
	client(entry: MultiplayerClientEntry, total: number, playerIdx: number): {
		game: GameMode,
		data: any,
		html: HTMLDivElement | null,
		skins: { [key: string]: string },
	},
	dom(unlockedSkins: string[]): {produce: ()=>Uint8Array},
	textures: { [key: string]: string },
	name: string,
	description: string,
	tropheesPerPlayer: number,
	skins: string[],
	collectibles: Collectible[] | null;
	explainationSlides: string[] | null;
	computerOnly: boolean,
	iconExtension: string,
	defaultPlayerCount: number,
	tropheeRoalPixelsPerTrophy: number,
	nodes: {
		root: ActionNode<GameMode, any>,
		data: (()=>any)
	}[]
}

interface SoloFactory {
	type: 'solo';
	name: string;
	description: string;
	computerOnly: boolean;
	textures: { [key: string]: string },
	explainationSlides: string[] | null;
	categories: string[],
	minFirst: boolean,
	iconExtension: string,
	dom(): {produce: ()=>string},
	create: ()=>SoloGameMode
}

interface UiSeparator {
	type: 'ui-separator',
	category: string
}



export const gamemods: Record<
	string,
	MultiplayerFactory | SoloFactory | UiSeparator
> = {
	separator_competitive: {
		type: 'ui-separator',
		category: "Competitive games"
	},

	test: {
		type: 'multiplayer',
		server: GMTest.createServ,
		client: GMTest.createClient,
		dom: GMTest.generateClientDom,
		textures: GMTest.TEXTURES,
		name: "Test",
		description: "A test game mode.",
		explainationSlides: null,
		computerOnly: false,
		tropheesPerPlayer: 2,
		skins: [],
		collectibles: collectibles_test,
		tropheeRoalPixelsPerTrophy: 8,
		iconExtension: 'png',
		defaultPlayerCount: 4,
		nodes: bots_test
	},

	airbasket: {
		type: 'multiplayer',
		server: GMAirBasket.createServ,
		client: GMAirBasket.createClient,
		dom: GMAirBasket.generateClientDom,
		textures: GMAirBasket.TEXTURES,
		name: "Air Basket",
		description: "Throw the ball into the basket and score more points than your opponents.",
		tropheesPerPlayer: 20,
		explainationSlides: ["0.gif", "1.png", "2.png", "3.png", "4.png"],
		computerOnly: true,
		skins: GMAirBasket.SKINS_IDS,
		collectibles: collectibles_airbasket,
		tropheeRoalPixelsPerTrophy: 3.5,
		iconExtension: 'png',
		defaultPlayerCount: 4,
		nodes: bots_airbasket
	},

	turrets: {
		type: 'multiplayer',
		server: GMTurrets.createServ,
		client: GMTurrets.createClient,
		dom: GMTurrets.generateClientDom,
		textures: GMTurrets.TEXTURES,
		name: "Turrets",
		description: "Build and defend your turret while trying to destroy your opponents using items.",
		tropheesPerPlayer: 20,
		explainationSlides: null,
		computerOnly: false,
		skins: [],
		collectibles: null,
		tropheeRoalPixelsPerTrophy: 3.5,
		iconExtension: 'svg',
		defaultPlayerCount: 4,
		nodes: bots_turrets
	},

	separator_mobile: {
		type: 'ui-separator',
		category: "Mobile games"
	},

	superTicTacToe: {
		type: 'multiplayer',
		server: GMSuperTicTacToe.createServ,
		client: GMSuperTicTacToe.createClient,
		dom: GMSuperTicTacToe.generateClientDom,
		textures: GMSuperTicTacToe.TEXTURES,
		name: "Super Tic Tac Toe",
		description: "Your move determines the board your opponent must play in next. Win 3 boards in a row to win.",
		tropheesPerPlayer: 3,
		explainationSlides: null,
		computerOnly: false,
		skins: [],
		collectibles: null,
		tropheeRoalPixelsPerTrophy: 3.5,
		iconExtension: 'png',
		defaultPlayerCount: 2,
		nodes: bots_superTicTacToe

	},

	roarsOnGlass: {
		type: 'multiplayer',
		server: GMRoarsOnGlass.createServ,
		client: GMRoarsOnGlass.createClient,
		dom: GMRoarsOnGlass.generateClientDom,
		textures: GMRoarsOnGlass.TEXTURES,
		name: "Roars on Glass",
		description: "Stay on the glass and don't fall! Roar to push your opponents off.",
		tropheesPerPlayer: 3,
		explainationSlides: null,
		computerOnly: false,
		skins: [],
		collectibles: null,
		tropheeRoalPixelsPerTrophy: 3.5,
		iconExtension: 'png',
		defaultPlayerCount: 4,
		nodes: bots_roarsOnGlass
	},

	woodSword: {
		type: 'multiplayer',
		server: GMWoodSword.createServ,
		client: GMWoodSword.createClient,
		dom: GMWoodSword.generateClientDom,
		textures: GMWoodSword.TEXTURES,
		name: "Wood Sword",
		description: "Throw all your on the log",
		tropheesPerPlayer: 3,
		explainationSlides: null,
		computerOnly: false,
		skins: [],
		collectibles: null,
		tropheeRoalPixelsPerTrophy: 3.5,
		iconExtension: 'png',
		defaultPlayerCount: 2,
		nodes: bots_woodSword
	},

	popit: {
		type: 'multiplayer',
		server: GMPopit.createServ,
		client: GMPopit.createClient,
		dom: GMPopit.generateClientDom,
		textures: GMPopit.TEXTURES,
		name: "Pop It",
		description: "",
		tropheesPerPlayer: 3,
		explainationSlides: null,
		computerOnly: false,
		skins: [],
		collectibles: null,
		tropheeRoalPixelsPerTrophy: 3.5,
		iconExtension: 'png',
		defaultPlayerCount: 2,
		nodes: bots_popit
	},

	lavaBall: {
		type: 'multiplayer',
		server: GMLavaBall.createServ,
		client: GMLavaBall.createClient,
		dom: GMLavaBall.generateClientDom,
		textures: GMLavaBall.TEXTURES,
		name: "Lava Ball",
		description: "",
		tropheesPerPlayer: 3,
		explainationSlides: null,
		computerOnly: false,
		skins: [],
		collectibles: null,
		tropheeRoalPixelsPerTrophy: 3.5,
		iconExtension: 'png',
		defaultPlayerCount: 4,
		nodes: bots_lavaBall
	},

	separator_comingSoon: {
		type: 'ui-separator',
		category: "Coming soon..."
	},

	moveArmy: {
		type: 'multiplayer',
		server: GMMoveArmy.createServ,
		client: GMMoveArmy.createClient,
		dom: GMMoveArmy.generateClientDom,
		textures: GMMoveArmy.TEXTURES,
		name: "Move Army",
		description: "Command your army, destroy enemy towers, and lead your team to victory.",
		tropheesPerPlayer: 0,
		explainationSlides: null,
		computerOnly: true,
		skins: [],
		collectibles: null,
		tropheeRoalPixelsPerTrophy: 3.5,
		iconExtension: 'png',
		defaultPlayerCount: 4,
		nodes: bots_moveArmy
	},

	separator_solo: {
		type: 'ui-separator',
		category: "Solo games"
	},

	testSolo: {
		type: 'solo',
		name: "Test Solo",
		description: "A test solo game mode.",
		explainationSlides: null,
		computerOnly: false,
		dom: GMTestSolo.generateClientDom,
		textures: GMTestSolo.TEXTURES,
		categories: GMTestSolo.CATEGORIES,
		minFirst: GMTestSolo.MIN_FIRST,
		iconExtension: 'png',
		create: GMTestSolo.create
	}
};




export function getMultiGmFactory(gamemode: string) {
	const factory = gamemods[gamemode];
	if (!factory || factory.type !== 'multiplayer') {
		throw new Error(`Invalid gamemode '${gamemode}'`);
	}

	return factory;
}

export function getSoloGmFactory(gamemode: string) {
	const factory = gamemods[gamemode];
	if (!factory || factory.type !== 'solo') {
		throw new Error(`Invalid gamemode '${gamemode}'`);
	}

	return factory;
}

export function getGmFactory(gamemode: string) {
	const factory = gamemods[gamemode];
	if (!factory || (factory.type !== 'solo' && factory.type !== 'multiplayer')) {
		throw new Error(`Invalid gamemode '${gamemode}'`);
	}

	return factory;
}

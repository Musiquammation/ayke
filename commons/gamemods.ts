import { ActionNode } from "./Bot";
import { Collectible } from "./Collectible";
import { GameMode } from "./GameMode";
import { GMAirBasket } from "./gamemods/GMAirBasket";
import { GMRoarsOnGlass } from "./gamemods/GMRoarsOnGlass";
import { GMSuperTicTacToe } from "./gamemods/GMSuperTicTacToe";
import { GMTest } from "./gamemods/GMTest";
import { GMTestSolo } from "./gamemods/GMTestSolo";
import { GMTurrets } from "./gamemods/GMTurrets";
import { GMWoodSword } from "./gamemods/GMWoodSword";
import { SoloGameMode } from "./SoloGameMode";

import bots_test from "./bots/bots-test";
import bots_airbasket from "./bots/bots-airbasket";
import bots_turrets from "./bots/bots-turrets";
import bots_superTicTacToe from "./bots/bots-superTicTacToe";
import bots_roarsOnGlass from "./bots/bots-roarsOnGlass";
import bots_woodSword from "./bots/bots-woodSword";

import collectibles_test from "./collectibles/collectibles_test";


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
	client(entry: Uint8Array | null, total: number, playerIdx: number): {
		game: GameMode,
		data: any,
		html: HTMLDivElement | null,
		skins: { [key: string]: string },
	},
	dom(unlockedSkins: string[]): {produce: ()=>Uint8Array},
	textures: { [key: string]: string },
	name: string,
	tropheesPerPlayer: number,
	skins: string[],
	collectibles: Collectible[] | null;
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
	computerOnly: boolean;
	textures: { [key: string]: string },
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
		tropheesPerPlayer: 20,
		computerOnly: true,
		skins: GMAirBasket.SKINS_IDS,
		collectibles: null,
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
		tropheesPerPlayer: 20,
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
		name: "Super tic tac toe",
		tropheesPerPlayer: 3,
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
		name: "Roars on glass",
		tropheesPerPlayer: 3,
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
		tropheesPerPlayer: 3,
		computerOnly: false,
		skins: [],
		collectibles: null,
		tropheeRoalPixelsPerTrophy: 3.5,
		iconExtension: 'png',
		defaultPlayerCount: 2,
		nodes: bots_woodSword
	},

	separator_solo: {
		type: 'ui-separator',
		category: "Solo games"
	},

	testSolo: {
		type: 'solo',
		name: "Test Solo",
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

import * as protobuf from 'protobufjs';
import { getLogger } from '../server/Logger';
import { gamemods } from './gamemods';

// Type alias for the loader function
type ProtocolLoaderFn = (name: string) => Promise<protobuf.Root>;

// Interface defining the expected message types for a game
export interface ProtocolTypes {
	type: 'multiplayer';
	ServerMessage: protobuf.Type;
	ClientMessage: protobuf.Type;
	StartData: protobuf.Type;
	StartDataClient: protobuf.Type;
	State: protobuf.Type;
	Input: protobuf.Type;
}

export interface SoloProtocolTypes {
	type: 'solo';
	Input: protobuf.Type;
}

// Internal state
let protocolLoader: ProtocolLoaderFn | null = null;
// The cache now stores the resolved types directly for maximum performance on get()
const loadedProtocols = new Map<string, ProtocolTypes | SoloProtocolTypes>();

/**
 * Initializes the protocol loader mechanism.
 * @param loader A function that asynchronously fetches and returns a protobuf.Root
 */
export function initProtocols(loader: ProtocolLoaderFn): void {
	protocolLoader = loader;

	for (const name in gamemods) {
		const type = gamemods[name].type;
		getProtocol(name, type).load();
	}
}

export function getProtocol(name: string, type: 'multiplayer'): {
	load(): Promise<void>;
	get(): ProtocolTypes;
};

export function getProtocol(name: string, type: 'solo'): {
	load(): Promise<void>;
	get(): SoloProtocolTypes;
};

export function getProtocol(name: string, type: 'solo' | 'multiplayer'): {
	load(): Promise<void>;
	get(): ProtocolTypes | SoloProtocolTypes;
};

export function getProtocol(name: string, type: 'solo' | 'multiplayer') {
	return {
		async load(): Promise<void> {
			if (!protocolLoader) {
				throw new Error(
					'Protocol loader is not initialized. Call initProtocols first.'
				);
			}

			if (loadedProtocols.has(name)) {
				return;
			}

			const root = await protocolLoader(name);
			const namespace = `game_${name}`;

			let resolvedTypes: ProtocolTypes | SoloProtocolTypes;

			if (type === 'multiplayer') {
				resolvedTypes = {
					type: 'multiplayer',
					ServerMessage: root.lookupType(`${namespace}.ServerMessage`),
					ClientMessage: root.lookupType(`${namespace}.ClientMessage`),
					StartData: root.lookupType(`${namespace}.StartData`),
					StartDataClient: root.lookupType(`${namespace}.StartDataClient`),
					State: root.lookupType(`${namespace}.State`),
					Input: root.lookupType(`${namespace}.Input`),
				};
			} else {
				resolvedTypes = {
					type: 'solo',
					Input: root.lookupType(`${namespace}.Input`),
				};
			}

			loadedProtocols.set(name, resolvedTypes);
		},

		get() {
			const types = loadedProtocols.get(name);

			if (!types) {
				throw new Error(
					`Protocol '${name}' is not loaded. Make sure to await load() before calling get().`
				);
			}

			return types;
		}
	};
}

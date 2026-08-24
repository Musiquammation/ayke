import * as protobuf from 'protobufjs';
import { getLogger } from '../server/Logger';
import { gamemods } from './gamemods';

// Type alias for the loader function
type ProtocolLoaderFn = (name: string) => Promise<protobuf.Root>;

// Interface defining the expected message types for a game
export interface ProtocolTypes {
	ServerMessage: protobuf.Type;
	ClientMessage: protobuf.Type;
	State: protobuf.Type;
	Input: protobuf.Type;
}

// Internal state
let protocolLoader: ProtocolLoaderFn | null = null;
// The cache now stores the resolved types directly for maximum performance on get()
const loadedProtocols = new Map<string, ProtocolTypes>();

/**
 * Initializes the protocol loader mechanism.
 * @param loader A function that asynchronously fetches and returns a protobuf.Root
 */
export function initProtocols(loader: ProtocolLoaderFn): void {
	protocolLoader = loader;

	for (const name in gamemods) {
		getProtocol(name).load();
	}
}

/**
 * Returns a protocol manager for a specific game name.
 * @param name The name of the game/protocol
 */
export function getProtocol(name: string) {
	return {
		/**
		 * Asynchronously loads the protocol and caches the resolved types.
		 * Should be called once during game initialization.
		 */
		async load(): Promise<void> {
			if (!protocolLoader) {
				throw new Error('Protocol loader is not initialized. Call initProtocols first.');
			}
			
			if (loadedProtocols.has(name)) {
				return; // Types are already loaded and cached
			}
			
			try {
				const root = await protocolLoader(name);
				const namespace = `game_${name}`;
				
				// Perform lookupType operations ONCE during load
				const resolvedTypes: ProtocolTypes = {
					ServerMessage: root.lookupType(`${namespace}.ServerMessage`),
					ClientMessage: root.lookupType(`${namespace}.ClientMessage`),
					State: root.lookupType(`${namespace}.State`),
					Input: root.lookupType(`${namespace}.Input`),
				};
				
				loadedProtocols.set(name, resolvedTypes);
			} catch (error) {
				throw error;
			}
		},

		/**
		 * Synchronously retrieves the cached protobuf message types.
		 * Super fast, safe to call frequently in a hot path (e.g., game loop).
		 * Throws an error if the protocol has not been loaded yet.
		 */
		get(): ProtocolTypes {
			const types = loadedProtocols.get(name);
			
			if (!types) {
				const errMsg = `Protocol '${name}' is not loaded. Make sure to await load() before calling get().`;
				throw new Error(errMsg);
			}

			return types;
		}
	};
}

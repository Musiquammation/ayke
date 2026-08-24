import * as protobuf from 'protobufjs';
import { getLogger } from '../server/Logger';
import { gamemods } from './gamemods';

// Provided logger (assuming getLogger is imported or globally available)
const logger = getLogger('protocol-loader');

// Type alias for the loader function
type ProtocolLoaderFn = (name: string) => Promise<protobuf.Root>;

// Interface defining the expected message types for a game
export interface ProtocolTypes {
	ServerMessage: protobuf.Type;
	ClientMessage: protobuf.Type;
	State: protobuf.Type;
	Input: protobuf.Type;
	PlayerInputs: protobuf.Type;
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
	logger.info('Protocol loading system initialized.');

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
					PlayerInputs: root.lookupType(`${namespace}.PlayerInputs`),
				};
				
				loadedProtocols.set(name, resolvedTypes);
				logger.info(`Protocol '${name}' types loaded and cached successfully.`);
			} catch (error) {
				// Catches network errors from loader OR missing types from lookupType
				logger.error(`Failed to load or parse protocol '${name}'\n${String(error)}`);
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
				logger.error(errMsg);
				throw new Error(errMsg);
			}

			return types;
		}
	};
}

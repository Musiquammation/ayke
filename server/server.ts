import "dotenv/config";

import protobuf from "protobufjs";
import fs from "fs";
import http from "http";
import https from "https";
import { WebSocketServer } from "ws";
import { initSendMessage } from "./sendMessage";
import { database, initDb } from "./Database";
import { getLogger } from "./Logger";
import { initProtocols } from "../commons/protocolLoader";
import { setGameModeLoggerGenerator } from "../commons/GameMode";
import { gamemods } from "../commons/gamemods";

const PORT = Number(process.env.PORT);
const PROTOCOL_PATH = process.env.PROTOCOL_PATH;
const DB_FILE = process.env.DB_FILE;
const PROTOCOLS_FOLDER = process.env.PROTOCOLS_FOLDER;

if (!PORT) { throw new Error("PORT is not defined or invalid"); }
if (!PROTOCOL_PATH) { throw new Error("PROTOCOL_PATH is not defined or invalid"); }
if (!DB_FILE) { throw new Error("DB_FILE is not defined or invalid"); }
if (!PROTOCOLS_FOLDER) { throw new Error("PROTOCOLS_FOLDER is not defined or invalid"); }

const logger = getLogger("main");

let server;


if (Number(process.env.USE_HTTPS)) {
	if (process.env.SSL_KEY_PATH === undefined || process.env.SSL_CERT_PATH === undefined) {
		throw new Error("SSL_KEY_PATH and/or SSL_CERT_PATH are not defined");
	}

	const options = {
		key: fs.readFileSync(process.env.SSL_KEY_PATH),
		cert: fs.readFileSync(process.env.SSL_CERT_PATH)
	};
	
	server = https.createServer(options, (req, res) => {
		res.writeHead(200);
	});
} else {
	server = http.createServer((req, res) => {
		res.writeHead(200);
	});
}


const wss = new WebSocketServer({ server });


initSendMessage(PROTOCOL_PATH, wss).then(() => {
	server.listen(PORT, () => {
		logger.info(`Server running on port ${PORT}`);
	});
});


initProtocols(name => protobuf.load(PROTOCOLS_FOLDER + name + ".proto"));

initDb(DB_FILE);

setGameModeLoggerGenerator((name, level) => {
	const l = getLogger(name);
	l.setLevel(level);
	return l;
})

// Put gamemods in database
database.then(db => {
	for (const key of Object.keys(gamemods)) {
		db.enshureGamemode(key, gamemods[key].name);
	}
})





import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Load bots
(async function() {
	const directory = "server/bots";
	const files = await readdir(directory);

	for (const file of files) {
		if (!file.endsWith(".ts")) {
			continue;
		}

		const filePath = path.resolve(directory, file);

		await import(pathToFileURL(filePath).href);
	}
})();
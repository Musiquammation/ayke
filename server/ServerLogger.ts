import "dotenv/config";
import fs from "fs";
import path from "path";
import { ILogger, LoggerLevel } from "../commons/ILogger";

const LEVELS: Record<LoggerLevel, number> = {
	debug: 0,
	info: 1,
	waring: 2,
	error: 3,
};


const logPath = process.env.LOGS_PATH ?? "dist/logs.log";

const logDir = path.dirname(logPath);
fs.mkdirSync(logDir, { recursive: true });

export class ServerLogger implements ILogger {
	constructor(
		private readonly name: string,
		private level: LoggerLevel = "info",
	) {}

	setLevel(level: LoggerLevel): void {
		this.level = level;
	}

	private write(level: LoggerLevel, text: string): void {
		if (LEVELS[level] < LEVELS[this.level]) {
			return;
		}

		const timestamp = new Date().toISOString();
		const message = `[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${text}`;

		// Console
		switch (level) {
			case "debug":
				console.debug(message);
				break;
			case "info":
				console.info(message);
				break;
			case "waring":
				console.warn(message);
				break;
			case "error":
				console.error(message);
				break;
		}

		// File
		fs.appendFileSync(logPath, message + "\n", "utf8");
	}

	debug(text: string): void {
		this.write("debug", text);
	}

	info(text: string): void {
		this.write("info", text);
	}

	warning(text: string): void {
		this.write("waring", text);
	}

	error(text: string): void {
		this.write("error", text);
	}
}
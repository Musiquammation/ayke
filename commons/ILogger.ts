export type LoggerLevel = "debug" | "info" | "waring" | "error";


const LEVELS: Record<LoggerLevel, number> = {
    debug: 0,
    info: 1,
    waring: 2,
    error: 3,
};

export interface ILogger {
	debug(text: string): void;
	info(text: string): void;
	warning(text: string): void;
	error(text: string): void;
    setLevel(level: LoggerLevel): void;
}


export class ConsoleLogger implements ILogger {
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


const loggers = new Map<string, ILogger>();


let loggerConstructor: ((name: string)=>ILogger) | null = null;

export function setLoggerConstructor(
    _loggerConstructor: ((name: string)=>ILogger)
) {
    loggerConstructor = _loggerConstructor;
}


export function getLogger(name: string): ILogger {
	let logger = loggers.get(name);

	if (!logger) {
        if (loggerConstructor === null) {
            throw new Error("loggerConstructor has not be called");
        }
		logger = loggerConstructor(name);
		loggers.set(name, logger);
	}

	return logger;
}

export function setLoggerLevel(
	name: string,
	level: LoggerLevel,
): void {
	getLogger(name).setLevel(level);
}

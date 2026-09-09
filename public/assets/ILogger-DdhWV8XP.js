//#region commons/ILogger.ts
var LEVELS = {
	debug: 0,
	info: 1,
	waring: 2,
	error: 3
};
var ConsoleLogger = class {
	name;
	level;
	constructor(name, level = "info") {
		this.name = name;
		this.level = level;
	}
	setLevel(level) {
		this.level = level;
	}
	write(level, text) {
		if (LEVELS[level] < LEVELS[this.level]) return;
		const message = `[${(/* @__PURE__ */ new Date()).toISOString()}] [${level.toUpperCase()}] [${this.name}] ${text}`;
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
			case "error": console.error(message);
		}
	}
	debug(text) {
		this.write("debug", text);
	}
	info(text) {
		this.write("info", text);
	}
	warning(text) {
		this.write("waring", text);
	}
	error(text) {
		this.write("error", text);
	}
};
var loggers = /* @__PURE__ */ new Map();
var loggerConstructor = null;
function setLoggerConstructor(_loggerConstructor) {
	loggerConstructor = _loggerConstructor;
}
function getLogger(name) {
	let logger = loggers.get(name);
	if (!logger) {
		if (loggerConstructor === null) throw new Error("loggerConstructor has not be called");
		logger = loggerConstructor(name);
		loggers.set(name, logger);
	}
	return logger;
}
//#endregion
export { getLogger as n, setLoggerConstructor as r, ConsoleLogger as t };

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
//#region \0vite/preload-helper.js
var scriptRel = "modulepreload";
var assetsURL = function(dep) {
	return "/" + dep;
};
var seen = {};
var __vitePreload = function preload(baseModule, deps, importerUrl) {
	let promise = Promise.resolve();
	if (deps && deps.length > 0) {
		const links = document.getElementsByTagName("link");
		const cspNonceMeta = document.querySelector("meta[property=csp-nonce]");
		const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
		function allSettled(promises) {
			return Promise.all(promises.map((p) => Promise.resolve(p).then((value) => ({
				status: "fulfilled",
				value
			}), (reason) => ({
				status: "rejected",
				reason
			}))));
		}
		function importMetaResolve(specifier) {
			if (import.meta.resolve) return import.meta.resolve(specifier);
			return new URL(
				specifier,
				/** #__KEEP__ */
				import.meta.url
			).href;
		}
		promise = allSettled(deps.map((dep) => {
			dep = assetsURL(dep, importerUrl);
			dep = importMetaResolve(dep);
			if (dep in seen) return;
			seen[dep] = true;
			const isCss = dep.endsWith(".css");
			for (let i = links.length - 1; i >= 0; i--) {
				const link = links[i];
				if (link.href === dep && (!isCss || link.rel === "stylesheet")) return;
			}
			const link = document.createElement("link");
			link.rel = isCss ? "stylesheet" : scriptRel;
			if (!isCss) link.as = "script";
			link.crossOrigin = "";
			link.href = dep;
			if (cspNonce) link.setAttribute("nonce", cspNonce);
			document.head.appendChild(link);
			if (isCss) return new Promise((res, rej) => {
				link.addEventListener("load", res);
				link.addEventListener("error", () => rej(/* @__PURE__ */ new Error(`Unable to preload CSS for ${dep}`)));
			});
		}));
	}
	function handlePreloadError(err) {
		const e = new Event("vite:preloadError", { cancelable: true });
		e.payload = err;
		window.dispatchEvent(e);
		if (!e.defaultPrevented) throw err;
	}
	return promise.then((res) => {
		for (const item of res || []) {
			if (item.status !== "rejected") continue;
			handlePreloadError(item.reason);
		}
		return baseModule().catch(handlePreloadError);
	});
};
//#endregion
export { setLoggerConstructor as i, ConsoleLogger as n, getLogger as r, __vitePreload as t };

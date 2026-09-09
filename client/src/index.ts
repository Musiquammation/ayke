import { ConsoleLogger, setLoggerConstructor } from "../../commons/ILogger";
setLoggerConstructor((name) => new ConsoleLogger(name));


export function init() {
	import("./initIndex").then(m => m.default());
}

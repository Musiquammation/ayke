import "dotenv/config";
import { ConsoleLogger, getLogger, setLoggerConstructor } from "../commons/ILogger";
setLoggerConstructor((name) => new ConsoleLogger(name));

await import("./video");

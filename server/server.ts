import "dotenv/config";
import { getLogger, setLoggerConstructor } from "../commons/ILogger";
import { ServerLogger } from "./ServerLogger";
setLoggerConstructor((name) => new ServerLogger(name));

await import("./startServer")
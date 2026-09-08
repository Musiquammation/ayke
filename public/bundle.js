const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/initIndex-C7ZSTj-f.js","assets/preload-helper-CADJiwsn.js"])))=>i.map(i=>d[i]);
import { i as setLoggerConstructor, n as ConsoleLogger, t as __vitePreload } from "./assets/preload-helper-CADJiwsn.js";
//#region client/src/index.ts
setLoggerConstructor((name) => new ConsoleLogger(name));
function init() {
	__vitePreload(() => import("./assets/initIndex-C7ZSTj-f.js").then((m) => m.default()), __vite__mapDeps([0,1]));
}
//#endregion
export { init };

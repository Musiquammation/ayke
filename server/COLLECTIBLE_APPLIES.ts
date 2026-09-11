import { CollectibleApplyKey } from "../commons/Collectible";
import { getLogger } from "../commons/ILogger";
import { Database } from "./Database"

const logger = getLogger('collectible');

export const COLLECTIBLE_APPLIES: Record<
	CollectibleApplyKey,
	(pseudo: string, db: Database, arg: any) => Promise<void>
> = {
	async test(pseudo, db, arg: any) {
		console.log("Hello world", pseudo, arg);
	},

	async giveSkin(pseudo, db, arg: any) {
		const r = await db.giveSkin(arg.gamemode, arg.skin, pseudo);
		
		if (r) {
			logger.info(`Give skin ${arg.skin} to ${pseudo} in ${arg.gamemode}`);
		} else {
			logger.error(`Failed to give skin ${arg.skin} to ${arg.skin} in ${arg.gamemode}`);
		}
	},

	async giveCoins(pseudo, db, arg: any) {
		const fcoins = await db.addCoins(pseudo, arg);
		
		logger.info(
			`Give coins +${arg.coins} to ${pseudo} ; now at ${fcoins}`
		);
	}
};

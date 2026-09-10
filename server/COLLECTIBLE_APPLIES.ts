import { CollectibleApplyKey } from "../commons/Collectible";
import { Database } from "./Database"

export const COLLECTIBLE_APPLIES: Record<
	CollectibleApplyKey,
	(pseudo: string, db: Database) => Promise<void>
> = {
	async test(pseudo, db) {
		console.log("Hello world", pseudo);
	}
};
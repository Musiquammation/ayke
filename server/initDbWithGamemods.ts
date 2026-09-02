import { readFile } from "node:fs";
import { gamemods } from "../commons/gamemods";
import { Database } from "./Database";

export async function initDbWithGamemods(db: Database) {
	for (const key of Object.keys(gamemods)) {
		const gm = gamemods[key];

		if (gm.type === 'multiplayer') {
			const defaultSkin = gm.skins.length > 0 ? gm.skins[0] : null;
	
			// Enshure gamemode
			await db.enshureGamemode(key, gm.name, defaultSkin);
	
			// Enshure skins
			await db.enshureSkins(key, gm.skins);
		}
	}
}

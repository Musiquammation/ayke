import { Fields } from "../../../Fields";
import { KILL_FEED_TIME } from "../constants";
import { Serializable } from "./Entity";

/** One line of the kill feed (shared data, but not an entity: it is not on the map). */
export class KillEvent implements Serializable {
	constructor(
		public killer = -1,
		public victim = 0,
		public remaining = KILL_FEED_TIME,
	) {}

	save(): Fields {
		return { killer: this.killer, victim: this.victim, remaining: this.remaining };
	}

	load(obj: Fields) {
		this.killer = obj.killer ?? -1;
		this.victim = obj.victim ?? 0;
		this.remaining = obj.remaining ?? 0;
	}
}

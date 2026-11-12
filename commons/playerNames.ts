/**
 * Builds the names array given to the game modes at game start.
 *
 * Human players come first (their pseudo, or null when anonymous),
 * then bots fill the remaining slots up to `total`: "Bot 1", "Bot 2", ...
 */
export function getPlayerNames(
	humanPseudos: (string | null)[],
	total: number
): (string | null)[] {
	const names: (string | null)[] = humanPseudos.slice(0, total);
	for (let i = 1; names.length < total; i++) {
		names.push(`Bot ${i}`);
	}
	return names;
}

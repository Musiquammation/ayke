export type CollectibleApplyKey = (
	'test' |
	'giveSkin' |
	'giveCoins'
)

export interface Collectible {
	id: number;
	name: string;
	// Draws the icon on the given canvas 2D context (client-side only).
	drawIcon(ctx: CanvasRenderingContext2D, size: number): Promise<void>;
	// Key into COLLECTIBLE_APPLIES, resolved server-side when unlocking.
	apply: CollectibleApplyKey;
	trophees: number;
	arg: any;
}


export function collectibleBuilder(gamemode: string) {
	return {
		skin(
			id: number,
			trophees: number,
			skin: string,
		): Collectible {
			return {
				id,
				name: "skin-" + skin,
				async drawIcon(ctx, size) {
					
				},
				apply: 'giveSkin',
				arg: {gamemode, skin},
				trophees
			};
		},

		coin(
			id: number,
			trophees: number,
			coins: number
		): Collectible {
			return {
				id,
				name: (
					"coin-" +
					coins.toString().padStart(4, "0")
				),
				async drawIcon(ctx, size) {
					
				},
				apply: 'giveCoins',
				arg: {gamemode, coins},
				trophees
			};
		}


	};
}

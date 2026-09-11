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
				name: `Skin '${skin}'`,
				async drawIcon(ctx, size) {
					const res = await fetch(
						`${window.IMG_ROOT_PATH}/assets/games/${gamemode}/skins/${skin}/icon.png`
					);

					if (!res.ok)
						throw new Error(`Failed to load icon: ${res.status}`);

					const blob = await res.blob();
					const url = URL.createObjectURL(blob);

					try {
						const image = new Image();

						await new Promise<void>((resolve, reject) => {
							image.onload = () => resolve();
							image.onerror = reject;
							image.src = url;
						});

						ctx.drawImage(
							image,
							0,
							0,
							size,
							size
						);
					} finally {
						URL.revokeObjectURL(url);
					}

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
					"Coin " +
					coins.toString().padStart(4, "0")
				),
				async drawIcon(ctx, size) {
					const center = size / 2;
					const hexRadius = size * 0.5;

					ctx.save();

					// Hexagon
					ctx.beginPath();

					for (let i = 0; i < 6; i++) {
						const angle = Math.PI / 3 * i - Math.PI / 2;
						const x = center + Math.cos(angle) * hexRadius;
						const y = center + Math.sin(angle) * hexRadius;

						if (i === 0)
							ctx.moveTo(x, y);
						else
							ctx.lineTo(x, y);
					}

					ctx.closePath();

					ctx.fillStyle = "#2196f3";
					ctx.fill();

					// Number
					ctx.fillStyle = "#ffffff";
					ctx.font = `bold ${size * 0.38}px monospace`;
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";

					ctx.fillText(coins.toString(), center, center);

					ctx.restore();
				},
				apply: 'giveCoins',
				arg: {gamemode, coins},
				trophees
			};
		}


	};
}

export type CollectibleApplyKey = (
	'test'
)

export interface Collectible {
	id: number;
	name: string;
	// Draws the icon on the given canvas 2D context (client-side only).
	drawIcon(ctx: CanvasRenderingContext2D, size: number): Promise<void>;
	// Key into COLLECTIBLE_APPLIES, resolved server-side when unlocking.
	apply: CollectibleApplyKey;
	trophees: number;
}

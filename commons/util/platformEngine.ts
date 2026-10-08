import RAPIER from '@dimforge/rapier2d-compat';


export namespace platformEngine {
	/* -------------------------------------------------------------------------- */
	/* Image loader                                                               */
	/* -------------------------------------------------------------------------- */

	interface ColorRule {
		prev: string;
		next: string;
	}

	export interface ImageLoaderFolder {
		get: (
			name: string | null,
			colorId?: number | undefined,
		) => HTMLCanvasElement | HTMLImageElement;

		setColorRule: (
			name: string,
			id: number,
			rules: ColorRule[],
		) => void;
	}

	export class ImageLoader {
		private loadedCount = 0;
		private totalCount = 0;

		private readonly placeholder:
			HTMLCanvasElement;

		private readonly pathRoot: string;

		private baseImages: {
			[folder: string]: {
				[imageName: string]: HTMLImageElement;
			};
		} = {};

		private coloredImages: {
			[folder: string]: {
				[imageName: string]: {
					[colorId: number]: HTMLCanvasElement;
				};
			};
		} = {};

		private colorRules: {
			[folder: string]: {
				[imageName: string]: {
					[colorId: number]: ColorRule[];
				};
			};
		} = {};

		constructor(pathRoot: string) {
			this.pathRoot = pathRoot;

			const size = 2;
			const canvas =
				document.createElement('canvas');

			canvas.width = size;
			canvas.height = size;

			const ctx =
				canvas.getContext('2d')!;

			ctx.imageSmoothingEnabled = false;

			ctx.fillStyle = 'violet';
			ctx.fillRect(
				0,
				0,
				size / 2,
				size / 2,
			);

			ctx.fillRect(
				size / 2,
				size / 2,
				size / 2,
				size / 2,
			);

			ctx.fillStyle = 'white';

			ctx.fillRect(
				size / 2,
				0,
				size / 2,
				size / 2,
			);

			ctx.fillRect(
				0,
				size / 2,
				size / 2,
				size / 2,
			);

			this.placeholder = canvas;
		}

		private hexToRgb(
			hex: string,
		): [number, number, number] {
			const clean =
				hex.replace('#', '');

			const r =
				parseInt(
					clean.substring(0, 2),
					16,
				);

			const g =
				parseInt(
					clean.substring(2, 4),
					16,
				);

			const b =
				parseInt(
					clean.substring(4, 6),
					16,
				);

			return [r, g, b];
		}

		private recolorImage(
			img: HTMLImageElement,
			rules: ColorRule[],
		): HTMLCanvasElement {
			const canvas =
				document.createElement('canvas');

			canvas.width = img.width;
			canvas.height = img.height;

			const ctx =
				canvas.getContext('2d')!;

			ctx.imageSmoothingEnabled = false;

			ctx.drawImage(
				img,
				0,
				0,
			);

			const parsedRules =
				rules.map(rule => ({
					prev:
						this.hexToRgb(
							rule.prev,
						),

					next:
						this.hexToRgb(
							rule.next,
						),
				}));

			const imageData =
				ctx.getImageData(
					0,
					0,
					canvas.width,
					canvas.height,
				);

			const data =
				imageData.data;

			for (
				let i = 0;
				i < data.length;
				i += 4
			) {
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];

				for (
					const rule
					of parsedRules
				) {
					if (
						r === rule.prev[0]
						&& g === rule.prev[1]
						&& b === rule.prev[2]
					) {
						data[i] =
							rule.next[0];

						data[i + 1] =
							rule.next[1];

						data[i + 2] =
							rule.next[2];

						break;
					}
				}
			}

			ctx.putImageData(
				imageData,
				0,
				0,
			);

			return canvas;
		}

		private generateColoredVersion(
			name: string,
			id: number,
			folderKey: string,
		): void {
			const img =
				this.baseImages[
					folderKey
				]?.[name];

			const rules =
				this.colorRules[
					folderKey
				]?.[name]?.[id];

			if (!img || !rules) {
				return;
			}

			const canvas =
				this.recolorImage(
					img,
					rules,
				);

			if (!this.coloredImages[folderKey]) {
				this.coloredImages[
					folderKey
				] = {};
			}

			if (
				!this.coloredImages[
					folderKey
				][name]
			) {
				this.coloredImages[
					folderKey
				][name] = {};
			}

			this.coloredImages[
				folderKey
			][name][id] = canvas;
		}

		setColorRule(
			name: string,
			id: number,
			rules: ColorRule[],
			folder: string | null = null,
		): void {
			const folderKey =
				folder ?? 'root';

			if (!this.colorRules[folderKey]) {
				this.colorRules[
					folderKey
				] = {};
			}

			if (
				!this.colorRules[
					folderKey
				][name]
			) {
				this.colorRules[
					folderKey
				][name] = {};
			}

			this.colorRules[
				folderKey
			][name][id] = rules;

			if (
				this.baseImages[
					folderKey
				]?.[name]
			) {
				this.generateColoredVersion(
					name,
					id,
					folderKey,
				);
			}
		}

		async load(
			list: {
				[key: string]: string;
			},
			folder: string | null = null,
		): Promise<void> {
			const folderKey =
				folder ?? 'root';

			this.totalCount +=
				Object.keys(list).length;

			if (!this.baseImages[folderKey]) {
				this.baseImages[
					folderKey
				] = {};
			}

			const promises:
				Promise<void>[] = [];

			for (
				const [name, path]
				of Object.entries(list)
			) {
				const promise =
					(async (): Promise<void> => {
						let objectUrl:
							string | null = null;

						try {
							const response =
								await fetch(
									this.pathRoot + path,
								);

							if (!response.ok) {
								throw new Error(
									'Failed to fetch ' +
									path,
								);
							}

							const blob =
								await response.blob();

							objectUrl =
								URL.createObjectURL(
									blob,
								);

							const img =
								await new Promise<
									HTMLImageElement
								>(
									(resolve, reject) => {
										const image =
											new Image();

										image.onload =
											() => {
												resolve(
													image,
												);
											};

										image.onerror =
											error => {
												reject(
													error,
												);
											};

										image.src =
											objectUrl!;
									},
								);

							this.baseImages[
								folderKey
							][name] = img;

							if (
								this.colorRules[
									folderKey
								]?.[name]
							) {
								for (
									const idStr
									of Object.keys(
										this
											.colorRules[
											folderKey
										][name],
									)
								) {
									const id =
										parseInt(
											idStr,
											10,
										);

									this.generateColoredVersion(
										name,
										id,
										folderKey,
									);
								}
							}
						} catch (error) {
							console.warn(
								'Error with:',
								path,
							);

							console.error(
								error,
							);
						} finally {
							if (objectUrl) {
								URL.revokeObjectURL(
									objectUrl,
								);
							}

							this.loadedCount++;
						}
					})();

				promises.push(
					promise,
				);
			}

			await Promise.all(
				promises,
			);
		}

		isLoaded(): boolean {
			return (
				this.loadedCount
					=== this.totalCount
				&& this.totalCount > 0
			);
		}

		get(
			name: string | null,
			colorId?: number,
			folder?: string | null,
		): HTMLCanvasElement | HTMLImageElement {
			if (name === null) {
				return this.placeholder;
			}

			const folderKey =
				folder ?? 'root';

			if (colorId !== undefined) {
				const colored =
					this.coloredImages[
						folderKey
					]?.[name]?.[colorId];

				if (colored) {
					return colored;
				}

				return this.placeholder;
			}

			const base =
				this.baseImages[
					folderKey
				]?.[name];

			if (base) {
				return base;
			}

			return this.placeholder;
		}

		getFolder(
			folder: string,
		): ImageLoaderFolder {
			return {
				get: (
					name: string | null,
					colorId?: number,
				):
					HTMLCanvasElement
					| HTMLImageElement => {
					return this.get(
						name,
						colorId,
						folder,
					);
				},

				setColorRule: (
					name: string,
					id: number,
					rules: ColorRule[],
				): void => {
					this.setColorRule(
						name,
						id,
						rules,
						folder,
					);
				},
			};
		}

		getFolders() {
			return {
				default:
					this.baseImages,

				colored:
					this.coloredImages,
			};
		}
	}


	/* -------------------------------------------------------------------------- */
	/* Constants                                                                  */
	/* -------------------------------------------------------------------------- */

	export const MAX_FALL_SPEED =
		1400;

	export const EFFECT_REDUCTION =
		100;

	export const MAX_FRAME_DT =
		1 / 20;

	/**
	 * Physical separation maintained by the Rapier character controller.
	 */
	export const COLLISION_SKIN =
		0.01;

	/*
	* Kept as exported compatibility constants.
	*
	* Collision detection itself is now performed by Rapier.
	*/
	export const PENETRATION_EPSILON =
		0.001;

	export const MAX_COLLISION_ITERATIONS =
		8;

	export const CONTACT_PROBE_DISTANCE =
		0.05;

	export const BROAD_PHASE_MARGIN =
		2;

	export const PARALLEL_EPSILON =
		1e-9;

	export const MIN_REMAINING_DISTANCE_SQ =
		1e-12;

	export const ANIMATION_FPS =
		10;

	export const JUMP_START_DURATION =
		0.1;

	export const LANDING_DURATION =
		0.12;

	export const WALL_HANG_DURATION =
		0.15;

	export const WALL_JUMP_DURATION =
		0.15;

	export const IDLE_SPEED_EPSILON =
		1;


	/* -------------------------------------------------------------------------- */
	/* Basic types                                                                */
	/* -------------------------------------------------------------------------- */

	export type BlockId =
		number;

	export type BlockCategory =
		string;

	export type Side =
		| 'floor'
		| 'ceiling'
		| 'left'
		| 'right';

	const SIDES:
		readonly Side[] = [
			'floor',
			'ceiling',
			'left',
			'right',
		];

	const OPPOSITE_SIDE:
		Record<Side, Side> = {
			floor: 'ceiling',
			ceiling: 'floor',
			left: 'right',
			right: 'left',
		};

	const SIDE_DIRECTION:
		Record<Side, Point> = {
			floor: {
				x: 0,
				y: 1,
			},

			ceiling: {
				x: 0,
				y: -1,
			},

			left: {
				x: -1,
				y: 0,
			},

			right: {
				x: 1,
				y: 0,
			},
		};


	/* -------------------------------------------------------------------------- */
	/* Engine data                                                                */
	/* -------------------------------------------------------------------------- */

	export interface EngineData {
		Game: unknown;
		Storage: unknown;
	}


	/* -------------------------------------------------------------------------- */
	/* Geometry                                                                   */
	/* -------------------------------------------------------------------------- */

	export interface Size {
		width: number;
		height: number;
	}

	export interface Point {
		x: number;
		y: number;
	}

	export interface Polygon {
		/**
		 * Polygon coordinates normalized in [0, 1] * [0, 1].
		 *
		 * The polygon may be convex or concave.
		 *
		 * It must be a simple polygon:
		 * - no self-intersections;
		 * - no holes;
		 * - at least three vertices.
		 */
		sides: Point[];
	}


	/* -------------------------------------------------------------------------- */
	/* Geometry -> Rapier conversion                                              */
	/* -------------------------------------------------------------------------- */

	/**
	 * Removes invalid duplicate polygon points.
	 */
	function cleanPolygon(
		polygon: Polygon,
	): Point[] {
		const result: Point[] = [];

		for (
			const point
			of polygon.sides
		) {
			if (
				!Number.isFinite(point.x)
				|| !Number.isFinite(point.y)
			) {
				throw new Error(
					'Polygon contains a non-finite vertex.',
				);
			}

			const previous =
				result[result.length - 1];

			if (
				previous
				&& Math.hypot(
					point.x - previous.x,
					point.y - previous.y,
				) <= PARALLEL_EPSILON
			) {
				continue;
			}

			result.push({
				x: point.x,
				y: point.y,
			});
		}

		if (result.length >= 2) {
			const first =
				result[0];

			const last =
				result[result.length - 1];

			if (
				Math.hypot(
					first.x - last.x,
					first.y - last.y,
				) <= PARALLEL_EPSILON
			) {
				result.pop();
			}
		}

		if (result.length < 3) {
			throw new Error(
				'A polygon requires at least three distinct vertices.',
			);
		}

		return result;
	}

		/**
	 * Converts polygon coordinates into coordinates relative to the center
	 * of the Block.
	 *
	 * Polygon coordinates are expressed in [-0.5, 0.5] relative to the
	 * Block center.
	 *
	 * For example:
	 *   (-0.5, -0.5) = top-left
	 *   ( 0.5, -0.5) = top-right
	 *   ( 0.5,  0.5) = bottom-right
	 *   (-0.5,  0.5) = bottom-left
	 */
	function createPolygonColliderDesc(
		polygon: Polygon,
		size: Size,
	): RAPIER.ColliderDesc {
		const points =
			cleanPolygon(
				polygon,
			);

		const vertices =
			new Float32Array(
				points.length * 2,
			);

		for (
			let i = 0;
			i < points.length;
			i++
		) {
			const point =
				points[i];

			/*
			* Polygon coordinates are normalized in [0, 1].
			*
			* The Block position is its center, so convert the polygon
			* coordinates into coordinates relative to that center.
			*
			* (0, 0) -> top-left
			* (0.5, 0.5) -> center
			* (1, 1) -> bottom-right
			*/
			vertices[i * 2] =
				(point.x - 0.5)
				* size.width;

			vertices[
				i * 2 + 1
			] =
				(point.y - 0.5)
				* size.height;
		}

		/*
		* The indices form a closed polygon:
		*   0 -> 1
		*   1 -> 2
		*   ...
		*   n -> 0
		*/
		const indices =
			new Uint32Array(
				points.length * 2,
			);

		for (
			let i = 0;
			i < points.length;
			i++
		) {
			indices[i * 2] =
				i;

			indices[
				i * 2 + 1
			] =
				(i + 1)
				% points.length;
		}

		const descriptor =
			RAPIER.ColliderDesc
				.convexDecomposition(
					vertices,
					indices,
					undefined,
					RAPIER.CompoundFlags
						.FIX_INTERNAL_EDGES,
				);

		if (!descriptor) {
			throw new Error(
				'Rapier could not decompose the polygon.',
			);
		}

		return descriptor;
	}

	/**
	 * Creates the Rapier collider corresponding to a Block.
	 */
	function createColliderDesc<
		TEngineData extends EngineData,
	>(
		block: Block<any, TEngineData>,
	): RAPIER.ColliderDesc {
		const size =
			block.getSize();

		if (
			!Number.isFinite(size.width)
			|| !Number.isFinite(size.height)
			|| size.width <= 0
			|| size.height <= 0
		) {
			throw new Error(
				`Invalid block size: ${size.width} x ${size.height}`,
			);
		}

		const polygon =
			block.getPolygon();

		if (!polygon) {
			return RAPIER.ColliderDesc
				.cuboid(
					size.width / 2,
					size.height / 2,
				);
		}

		return createPolygonColliderDesc(
			polygon,
			size,
		);
	}


	/* -------------------------------------------------------------------------- */
	/* Physics                                                                    */
	/* -------------------------------------------------------------------------- */

	export interface Velocity {
		x: number;
		y: number;
	}

	export interface Direction {
		dir: number;
		acc: number;
		softDec: number;
		hardDec: number;
	}

	function approachSpeed(
		vx: number,
		direction: Direction,
		dt: number,
	): number {
		const target =
			direction.dir;

		if (vx === target) {
			return vx;
		}

		let rate: number;

		if (
			vx * target < 0
		) {
			rate =
				direction.hardDec;
		} else if (
			Math.abs(vx)
			> Math.abs(target)
		) {
			rate =
				direction.softDec;
		} else {
			rate =
				direction.acc;
		}

		const step =
			rate * dt;

		return vx < target
			? Math.min(
				target,
				vx + step,
			)
			: Math.max(
				target,
				vx - step,
			);
	}


	export interface VelocityEffect {
		vx: number;
		vy: number;
	}

	function shrinkTowardZero(
		value: number,
		amount: number,
	): number {
		if (value > 0) {
			return Math.max(
				0,
				value - amount,
			);
		}

		if (value < 0) {
			return Math.min(
				0,
				value + amount,
			);
		}

		return 0;
	}

	export class VelocityEffectHandler {
		private effects:
			VelocityEffect[] = [];

		append(
			vx: number,
			vy: number,
		): void {
			if (
				vx === 0
				&& vy === 0
			) {
				return;
			}

			this.effects.push({
				vx,
				vy,
			});
		}

		total(): Point {
			let x = 0;
			let y = 0;

			for (
				const effect
				of this.effects
			) {
				x += effect.vx;
				y += effect.vy;
			}

			return {
				x,
				y,
			};
		}

		reduced(
			dt: number,
		): VelocityEffect[] {
			const amount =
				EFFECT_REDUCTION * dt;

			const result:
				VelocityEffect[] = [];

			for (
				const effect
				of this.effects
			) {
				const vx =
					shrinkTowardZero(
						effect.vx,
						amount,
					);

				const vy =
					shrinkTowardZero(
						effect.vy,
						amount,
					);

				if (
					vx !== 0
					|| vy !== 0
				) {
					result.push({
						vx,
						vy,
					});
				}
			}

			return result;
		}

		replace(
			effects: VelocityEffect[],
		): void {
			this.effects =
				effects.filter(
					effect =>
						effect.vx !== 0
						|| effect.vy !== 0,
				);
		}
	}


	/* -------------------------------------------------------------------------- */
	/* Walker                                                                     */
	/* -------------------------------------------------------------------------- */

	export class Walker {
		private readonly contacts:
			Record<
				Side,
				BlockId | null
			> = {
				floor: null,
				ceiling: null,
				left: null,
				right: null,
			};

		carrierId:
			BlockId | null = null;

		clear(): void {
			for (
				const side
				of SIDES
			) {
				this.contacts[side] =
					null;
			}
		}

		setContact(
			side: Side,
			id: BlockId,
		): void {
			this.contacts[side] =
				id;
		}

		getContact(
			side: Side,
		): BlockId | null {
			return this.contacts[side];
		}

		onLeft(): boolean {
			return (
				this.contacts.left
				!== null
			);
		}

		onRight(): boolean {
			return (
				this.contacts.right
				!== null
			);
		}

		onFloor(): boolean {
			return (
				this.contacts.floor
				!== null
			);
		}

		onCeiling(): boolean {
			return (
				this.contacts.ceiling
				!== null
			);
		}
	}


	interface LineDescriptor {
		delay: number;
		count: number;
	}

	export type StateReturn = (
		{type: 'loop'} |
		{type: 'switch', state: number} |
		{type: 'next', state: number}
	);

	export abstract class Animator {
		private state = 0;
		private index = 0;
		private tick;
		private facingLeft = false;

		constructor(
			public readonly width: number,
			public readonly height: number,
			private readonly texture: string,
			private readonly textureMode: number | null,
			public readonly linesDescriptors: Record<number, LineDescriptor>,
			public readonly runningSpeed: number = Infinity,
		) {
			this.tick = linesDescriptors[0].delay;
		}

		abstract update(
			block: Block<any, any>,
			walker: Walker,
			direction: Direction,
			current: number
		): StateReturn;

		getVisualZoom() {
			return 1;
		}

		frame(
			block: Block<any, any>,
			walker: Walker,
			direction: Direction,
			dt: number
		) {
			const u = this.update(
				block,
				walker,
				direction,
				this.state
			);

			if (u.type === 'loop') {
				this.tick -= dt;
				if (this.tick > 0) {
					return;
				}

				this.index++;
				const count = this.linesDescriptors[this.state].count;
				this.tick += this.linesDescriptors[this.state].delay;
				if (this.index < count) {
					return;
				}

				this.index = 0;
				return;
			}


			if (u.type === 'switch') {
				this.state = u.state;
				this.tick = this.linesDescriptors[u.state].delay;
				this.index = 0;
				return;
			}

			this.tick -= dt;
			if (this.tick > 0) {
				return;
			}

			this.state = u.state;
			this.tick += this.linesDescriptors[u.state].delay;
		}

		draw(
			block: Block<any, any>,
			ctx: CanvasRenderingContext2D,
			imageLoader: ImageLoaderFolder
		): void {
			const image = imageLoader.get(
				this.texture,
				this.textureMode ?? undefined,
			);

			const {width, height} = block.getSize();
			const visualZoom = this.getVisualZoom();

			ctx.save();
			ctx.imageSmoothingEnabled = false;

			ctx.translate(block.x, block.y);

			const velocity = block.getVelocity();
			if (velocity) {
				if (velocity.x < 0) {
					this.facingLeft = true;
				} else if (velocity.x > 0) {
					this.facingLeft = false;
				}
			}

			if (this.facingLeft) {
				ctx.scale(-1, 1);
			}

			// Move the origin to the feet.
			ctx.translate(0, height / 2);

			// Zoom around the feet.
			ctx.scale(visualZoom, visualZoom);

			// Move back so the feet are at the origin.
			ctx.translate(0, -height / 2);

			ctx.drawImage(
				image,

				this.index * this.width,
				this.state * this.height,

				this.width,
				this.height,

				-width / 2,
				-height / 2,

				width,
				height,
			);

			ctx.restore();
		}
	}


	/* -------------------------------------------------------------------------- */
	/* Block                                                                      */
	/* -------------------------------------------------------------------------- */

	export function getSingleton<
		K,
		V,
	>(
		map: Map<K, V>,
	): V {
		if (map.size !== 1) {
			throw new Error(
				`Expected a map with exactly one entry, got ${map.size}`,
			);
		}

		return map.values().next().value!;
	}

	export abstract class Block<
		Data,
		TEngineData extends EngineData,
	> {
		/*
		* Before the block is added to an engine, these are the authoritative
		* coordinates.
		*
		* After a collider has been bound, x/y are exposed through the collider
		* position and setters keep the collider synchronized.
		*/
		private _x = 0;
		private _y = 0;

		private physicsCollider:
			RAPIER.Collider | null = null;

		/**
		 * The horizontal center coordinate of the block.
		 */
		get x(): number {
			if (!this.physicsCollider) {
				return this._x;
			}

			return this.physicsCollider.translation().x;
		}

		/**
		 * Sets the horizontal center coordinate of the block.
		 */
		set x(value: number) {
			if (!Number.isFinite(value)) {
				throw new Error(
					'Block.x must be finite.',
				);
			}

			this._x = value;

			this.syncPhysicsPosition();
		}

		/**
		 * The vertical center coordinate of the block.
		 */
		get y(): number {
			if (!this.physicsCollider) {
				return this._y;
			}

			return this.physicsCollider.translation().y;
		}

		/**
		 * Sets the vertical center coordinate of the block.
		 */
		set y(value: number) {
			if (!Number.isFinite(value)) {
				throw new Error(
					'Block.y must be finite.',
				);
			}

			this._y = value;

			this.syncPhysicsPosition();
		}

		abstract getSize(): Size;

		/**
		 * Collision polygon.
		 *
		 * null means an axis-aligned rectangle with the block size.
		 *
		 * A polygon may be convex or concave.
		 */
		getPolygon(): Polygon | null {
			return null;
		}

		getWalker(): Walker | null {
			return null;
		}

		/**
		 * Returns the animator used by this block on the client.
		 *
		 * The platform engine only calls this method when isClient is true.
		 * Server-side engines therefore never instantiate or load animators.
		 */
		createAnimator(): Animator | null {
			return null;
		}

		getDirection(): Direction | null {
			return null;
		}

		getVelocity(): Velocity | null {
			return null;
		}

		/**
		 * Returns a velocity that is controlled entirely by the block.
		 *
		 * A forced velocity cannot be modified by collision resolution,
		 * direction input or velocity effects.
		 *
		 * This is intended primarily for moving platforms.
		 */
		getForcedVelocity(): Velocity | null {
			return null;
		}

		getVelocityEffects():
			VelocityEffectHandler | null {
			return null;
		}

		mustBeDestroyed(): boolean {
			return false;
		}

		/**
		 * Returns the Rapier collider attached to this block.
		 *
		 * This is mostly useful for advanced engine integrations and debugging.
		 */
		getPhysicsCollider():
			RAPIER.Collider | null {
			return this.physicsCollider;
		}

		/**
		 * Called by PlatformerEngine when the block receives its Rapier collider.
		 *
		 * The collider is intentionally parentless:
		 * the engine owns its translation directly.
		 */
		bindPhysicsCollider(
			collider: RAPIER.Collider,
		): void {
			if (this.physicsCollider) {
				throw new Error(
					'The block already has a Rapier collider.',
				);
			}

			this.physicsCollider =
				collider;

			this.syncPhysicsPosition();
		}

		/**
		 * Called when the block is removed from its engine.
		 */
		unbindPhysicsCollider(): void {
			this.physicsCollider = null;
		}

		private syncPhysicsPosition(): void {
			if (!this.physicsCollider) {
				return;
			}

			this.physicsCollider.setTranslation({
				x: this._x,
				y: this._y,
			});
		}

		processBeforeEngine(
			id: BlockId,
			dt: number,
			engine:
				IBlockEngine<TEngineData>,
			clientData: Data | null,
		): void {
		}

		processAfterEngine(
			id: BlockId,
			dt: number,
			engine:
				IBlockEngine<TEngineData>,
			clientData: Data | null,
		): void {
		}

		applyCollision(
			id: BlockId,
			clientData: Data | null,
			block:
				BlockEntry<TEngineData>,
		): boolean {
			return true;
		}

		detectCollision(
			id: BlockId,
			other:
				BlockEntry<TEngineData>,
			entrySide: Side,
			engine:
				IBlockEngine<TEngineData>,
			clientData: Data | null,
		): void {
		}
	}


	/* -------------------------------------------------------------------------- */
	/* Storage                                                                    */
	/* -------------------------------------------------------------------------- */

	export type BlockTypes =
		Record<
			string,
			Block<any, any>
		>;

	export type BlockStorage<
		T extends BlockTypes,
	> = {
		[K in keyof T]:
			Map<BlockId, T[K]>;
	};

	export type AnyBlock<
		TEngineData extends EngineData,
	> =
		Block<any, TEngineData>;


	/* -------------------------------------------------------------------------- */
	/* Engine entries                                                             */
	/* -------------------------------------------------------------------------- */

	export interface BlockEntry<
		TEngineData extends EngineData,
	> {
		readonly id:
			BlockId;

		readonly block:
			AnyBlock<TEngineData>;

		readonly category:
			BlockCategory | null;

		readonly data:
			unknown;
	}


	/* -------------------------------------------------------------------------- */
	/* Engine interface                                                           */
	/* -------------------------------------------------------------------------- */

	export interface IBlockEngine<
		TEngineData extends EngineData,
	> {
		readonly isClient:
			boolean;

		readonly storage:
			TEngineData['Storage'];

		readonly game:
			TEngineData['Game'];

		readonly world:
			RAPIER.World;

		addBlock(
			block:
				AnyBlock<TEngineData>,
			category?:
				BlockCategory | null,
			data?:
				unknown,
		): BlockId;

		removeBlock(
			id: BlockId,
		): boolean;

		getBlock(
			id: BlockId,
		): AnyBlock<TEngineData> | null;

		getEntry(
			id: BlockId,
		): BlockEntry<TEngineData> | null;

		getBlocks():
			Generator<
				BlockEntry<TEngineData>
			>;

		addVelocityEffect(
			id: BlockId,
			vx: number,
			vy: number,
		): boolean;

		update(
			dt: number,
		): void;

		getGame():
			TEngineData['Game'];

		getAnimator(key: BlockId): Animator | null;
		

	}


	/* -------------------------------------------------------------------------- */
	/* Internal state                                                             */
	/* -------------------------------------------------------------------------- */

	interface MoverState<
		TEngineData extends EngineData,
	> {
		entry:
			BlockEntry<TEngineData>;

		collider:
			RAPIER.Collider;

		velocity:
			Velocity | null;

		forcedVelocity:
			Velocity | null;

		effects:
			VelocityEffectHandler | null;

		direction:
			Direction | null;

		nextVx: number;
		nextVy: number;

		nextEffects:
			VelocityEffect[];

		/**
		 * Requested velocity before Rapier collision resolution.
		 */
		speedX: number;
		speedY: number;

		/**
		 * Actual intended final position after the primary movement pass.
		 */
		nextX: number;
		nextY: number;

		startX: number;
		startY: number;
	}

	interface CollisionNote {
		aId:
			BlockId;

		bId:
			BlockId;

		sideA:
			Side;
	}


	/* -------------------------------------------------------------------------- */
	/* Utility functions                                                          */
	/* -------------------------------------------------------------------------- */

	/**
	 * Returns the velocity of a state for relative shape casts.
	 */
	function getStateSpeed(
		states:
			Map<
				BlockId,
				MoverState<any>
			>,
		id: BlockId,
	): Velocity {
		const state =
			states.get(id);

		if (!state) {
			return {
				x: 0,
				y: 0,
			};
		}

		return {
			x:
				state.speedX,

			y:
				state.speedY,
		};
	}

	/**
	 * Projects velocity out of a surface normal.
	 *
	 * The normal points from the obstacle toward the moving block.
	 */
	function removeVelocityIntoNormal(
		vx: number,
		vy: number,
		nx: number,
		ny: number,
	): Velocity {
		const dot =
			vx * nx
			+ vy * ny;

		if (
			dot >= 0
		) {
			return {
				x: vx,
				y: vy,
			};
		}

		return {
			x:
				vx
				- dot * nx,

			y:
				vy
				- dot * ny,
		};
	}


	/* -------------------------------------------------------------------------- */
	/* Platformer engine                                                          */
	/* -------------------------------------------------------------------------- */

	class PlatformerEngine<
		TEngineData extends EngineData,
	> implements IBlockEngine<TEngineData> {
		private nextId = 0;

		private readonly entries =
			new Map<
				BlockId,
				BlockEntry<TEngineData>
			>();

		/*
		 * Animators are client-only state. Keeping them outside BlockEntry also
		 * guarantees that server-side engine instances never instantiate them.
		 */
		private readonly animators =
			new Map<BlockId, Animator>();

		private readonly colliderToId =
			new Map<
				number,
				BlockId
			>();

		private readonly pendingEffects:
			{
				id: BlockId;
				vx: number;
				vy: number;
			}[] = [];

		private readonly characterController:
			RAPIER.KinematicCharacterController;

		private updating = false;

		private disposed = false;

		readonly world:
			RAPIER.World;

		constructor(
			public readonly isClient:
				boolean,

			public readonly storage:
				TEngineData['Storage'],

			public readonly game:
				TEngineData['Game'],

			gravity:
				Point = {
					x: 0,
					y: 0,
				},
		) {
			/*
			* initRapier() must have completed before this constructor is called.
			*/
			this.world =
				new RAPIER.World(
					gravity,
				);

			/*
			* Y points down in this engine, therefore the world-space up vector
			* points toward negative Y.
			*/
			this.characterController =
				this.world.createCharacterController(
					COLLISION_SKIN,
				);

			this.characterController.setUp({
				x: 0,
				y: -1,
			});

			this.characterController.setSlideEnabled(
				true,
			);

			this.characterController.disableAutostep();

			this.characterController.disableSnapToGround();
		}

		addBlock(
			block:
				AnyBlock<TEngineData>,
			category:
				| BlockCategory
				| null = null,
			data: unknown = null,
		): BlockId {
			this.assertNotDisposed();

			if (
				block.getPhysicsCollider()
			) {
				throw new Error(
					'The block is already attached to a physics engine.',
				);
			}

			const id =
				this.nextId++;


			const descriptor =
				createColliderDesc(
					block,
				);

			const collider =
				this.world.createCollider(
					descriptor,
				);

			/*
			* Disable rotation indirectly by never exposing rotation and by keeping
			* all movement translational.
			*/
			collider.setRotation(0);

			/*
			* The collider position is the block center.
			*/
			collider.setTranslation({
				x: block.x,
				y: block.y
			});

			block.bindPhysicsCollider(
				collider,
			);

			this.colliderToId.set(
				collider.handle,
				id,
			);

			this.entries.set(
				id,
				{
					id,
					block,
					category,
					data,
				},
			);

			/*
			 * Animators are loaded only on the client. The block remains entirely
			 * usable on the server without importing or constructing its animator.
			 */
			if (this.isClient) {
				const animator = block.createAnimator();

				if (animator) {
					this.animators.set(
						id,
						animator,
					);
				}
			}

			return id;
		}

		removeBlock(
			id: BlockId,
		): boolean {
			const entry =
				this.entries.get(id);

			if (!entry) {
				return false;
			}

			const collider =
				entry.block.getPhysicsCollider();

			if (collider) {
				this.colliderToId.delete(
					collider.handle,
				);

				this.world.removeCollider(
					collider,
					false,
				);

				entry.block.unbindPhysicsCollider();
			}

			this.animators.delete(id);

			return this.entries.delete(
				id,
			);
		}

		getBlock(
			id: BlockId,
		):
			AnyBlock<TEngineData> | null {
			return (
				this.entries
					.get(id)
					?.block
				?? null
			);
		}

		getEntry(
			id: BlockId,
		):
			BlockEntry<TEngineData> | null {
			return (
				this.entries.get(id)
				?? null
			);
		}

		*getBlocks():
			Generator<
				BlockEntry<TEngineData>
			> {
			for (
				const entry
				of this.entries.values()
			) {
				yield entry;
			}
		}

		addVelocityEffect(
			id: BlockId,
			vx: number,
			vy: number,
		): boolean {
			const handler =
				this.entries
					.get(id)
					?.block
					.getVelocityEffects();

			if (!handler) {
				return false;
			}

			if (this.updating) {
				this.pendingEffects.push({
					id,
					vx,
					vy,
				});
			} else {
				handler.append(
					vx,
					vy,
				);
			}

			return true;
		}

		getGame():
			TEngineData['Game'] {
			return this.game;
		}

		getAnimator(key: BlockId) {
			return this.animators.get(key) ?? null;
		}

		/**
		 * Releases the Rapier resources owned by this engine.
		 */
		dispose(): void {
			if (this.disposed) {
				return;
			}

			this.disposed = true;

			for (
				const entry
				of this.entries.values()
			) {
				entry.block
					.unbindPhysicsCollider();
			}

			this.entries.clear();
			this.animators.clear();
			this.colliderToId.clear();

			this.world.removeCharacterController(
				this.characterController,
			);

			this.world.free();
		}

		update(
			dt: number,
		): void {
			this.assertNotDisposed();

			dt = Math.min(
				dt,
				MAX_FRAME_DT,
			);

			if (!(dt > 0)) {
				return;
			}

			this.updating = true;

			try {
				/*
				* The timestep used by Rapier is updated once per engine update.
				*/
				this.world.timestep =
					dt;

				/* ------------------------------------------------------------------ */
				/* 1. Pre-engine processing                                             */
				/* ------------------------------------------------------------------ */

				for (
					const entry
					of Array.from(
						this.entries.values(),
					)
				) {
					if (
						!this.entries.has(
							entry.id,
						)
					) {
						continue;
					}

					entry.block.processBeforeEngine(
						entry.id,
						dt,
						this,
						entry.data as any,
					);
				}

				/* ------------------------------------------------------------------ */
				/* 2. Build movement states                                              */
				/* ------------------------------------------------------------------ */

				const states =
					new Map<
						BlockId,
						MoverState<TEngineData>
					>();

				for (
					const entry
					of this.entries.values()
				) {
					const state =
						this.computeNextState(
							entry,
							dt,
						);

					if (state) {
						states.set(
							entry.id,
							state,
						);
					}
				}

				/* ------------------------------------------------------------------ */
				/* 3. Resolve all primary movement                                       */
				/* ------------------------------------------------------------------ */

				const notes:
					CollisionNote[] = [];

				const seenPairs =
					new Set<string>();

				for (
					const state
					of states.values()
				) {
					if (
						!this.entries.has(
							state.entry.id,
						)
					) {
						continue;
					}

					this.resolvePrimaryMovement(
						state,
						states,
						notes,
						seenPairs,
						dt,
					);
				}

				/* ------------------------------------------------------------------ */
				/* 4. Collision callbacks                                                */
				/* ------------------------------------------------------------------ */

				for (
					const note
					of notes
				) {
					this.dispatchNote(
						note,
					);
				}

				/* ------------------------------------------------------------------ */
				/* 5. Commit primary positions                                           */
				/* ------------------------------------------------------------------ */

				for (
					const state
					of states.values()
				) {
					if (
						!this.entries.has(
							state.entry.id,
						)
					) {
						continue;
					}

					state.entry.block.x =
						state.nextX;

					state.entry.block.y =
						state.nextY;
				}

				/* ------------------------------------------------------------------ */
				/* 6. Resolve walkers and moving-platform carrying                      */
				/* ------------------------------------------------------------------ */

				for (
					const state
					of states.values()
				) {
					if (
						!this.entries.has(
							state.entry.id,
						)
					) {
						continue;
					}

					this.resolveWalker(
						state,
						states,
						dt,
					);
				}

				/* ------------------------------------------------------------------ */
				/* 7. Commit walker carrying movement                                   */
				/* ------------------------------------------------------------------ */

				for (
					const state
					of states.values()
				) {
					if (
						!this.entries.has(
							state.entry.id,
						)
					) {
						continue;
					}

					state.entry.block.x =
						state.nextX;

					state.entry.block.y =
						state.nextY;

					/*
					* Forced velocity is immutable.
					*
					* Normal velocity is updated with the collision-resolved result.
					*/
					if (
						state.velocity
						&& !state.forcedVelocity
					) {
						state.velocity.x =
							state.nextVx;

						state.velocity.y =
							state.nextVy;
					}

					state.effects?.replace(
						state.nextEffects,
					);
				}

				/* ------------------------------------------------------------------ */
				/* 8. Update Rapier's narrow/broad phase                                 */
				/* ------------------------------------------------------------------ */

				this.world.step();

				/* ------------------------------------------------------------------ */
				/* 9. Apply effects generated during callbacks                           */
				/* ------------------------------------------------------------------ */

				for (
					const effect
					of this.pendingEffects
				) {
					this.entries
						.get(effect.id)
						?.block
						.getVelocityEffects()
						?.append(
							effect.vx,
							effect.vy,
						);
				}

				this.pendingEffects.length =
					0;

				/* ------------------------------------------------------------------ */
				/* 10. Post-engine processing                                           */
				/* ------------------------------------------------------------------ */

				for (
					const entry
					of Array.from(
						this.entries.values(),
					)
				) {
					if (
						!this.entries.has(
							entry.id,
						)
					) {
						continue;
					}

					entry.block.processAfterEngine(
						entry.id,
						dt,
						this,
						entry.data as any,
					);
				}

				/* ------------------------------------------------------------------ */
				/* 11. Animation                                                       */
				/* ------------------------------------------------------------------ */

				if (this.isClient) {
					for (
						const [id, animator]
						of this.animators
					) {
						const entry =
							this.entries.get(id);

						if (!entry) {
							continue;
						}

						const walker =
							entry.block.getWalker();

						const direction =
							entry.block.getDirection();

						if (!walker || !direction) {
							continue;
						}

						/*
						 * frame() drives the animator state and calls animator.update()
						 * with the current animation state.
						 */
						animator.frame(
							entry.block,
							walker,
							direction,
							dt,
						);
					}
				}

				/* ------------------------------------------------------------------ */
				/* 12. Destruction                                                     */
				/* ------------------------------------------------------------------ */

				for (
					const entry
					of Array.from(
						this.entries.values(),
					)
				) {
					if (
						entry.block.mustBeDestroyed()
					) {
						this.removeBlock(
							entry.id,
						);
					}
				}
			} finally {
				this.updating = false;
			}
		}


		/* ---------------------------------------------------------------------- */
		/* State generation                                                       */
		/* ---------------------------------------------------------------------- */

		private computeNextState(
			entry:
				BlockEntry<TEngineData>,
			dt: number,
		):
			| MoverState<TEngineData>
			| null {
			const block =
				entry.block;

			const collider =
				block.getPhysicsCollider();

			if (!collider) {
				throw new Error(
					'Every engine block must have a Rapier collider.',
				);
			}

			const velocity =
				block.getVelocity();

			const forcedVelocity =
				block.getForcedVelocity();

			const effects =
				block.getVelocityEffects();

			const direction =
				block.getDirection();

			const walker =
				block.getWalker();

			if (
				!velocity
				&& !forcedVelocity
				&& !effects
				&& !direction
				&& !walker
			) {
				return null;
			}

			let vx =
				velocity?.x ?? 0;

			let vy =
				velocity?.y ?? 0;

			/*
			* Forced velocity has absolute priority.
			*/
			if (forcedVelocity) {
				vx =
					forcedVelocity.x;

				vy =
					forcedVelocity.y;
			} else if (direction) {
				vx =
					approachSpeed(
						vx,
						direction,
						dt,
					);
			}

			const nextEffects =
				effects
					? effects.reduced(dt)
					: [];

			let effectX = 0;
			let effectY = 0;

			/*
			* A forced velocity is absolute.
			* Effects are therefore intentionally not added to it.
			*/
			if (!forcedVelocity) {
				for (
					const effect
					of nextEffects
				) {
					effectX +=
						effect.vx;

					effectY +=
						effect.vy;
				}
			}

			const state: MoverState<TEngineData> = {
				entry,
				collider,

				velocity,
				forcedVelocity,
				effects,
				direction,

				nextVx: vx,
				nextVy: vy,

				nextEffects,

				speedX: vx + effectX,
				speedY: vy + effectY,

				nextX:
					block.x
					+ (vx + effectX) * dt,

				nextY:
					block.y
					+ (vy + effectY) * dt,

				startX:
					block.x,

				startY:
					block.y,
			};

			/*
			 * Refresh contacts at the START of the frame. The previous
			 * implementation only refreshed them after movement, which leaves
			 * one frame where gravity/input can request movement into a surface.
			 */
			this.refreshWalkerContacts(
				state,
			);

			/*
			 * A persistent contact blocks the corresponding component before the
			 * movement is submitted to Rapier. This makes the gameplay velocity
			 * exactly zero on the blocked axis instead of correcting one frame late.
			 */
			this.stabilizeVelocityAgainstContacts(
				state,
			);

			state.speedX =
				state.nextVx;

			for (
				const effect
				of state.nextEffects
			) {
				state.speedX +=
					effect.vx;
			}

			state.speedY =
				state.nextVy;

			for (
				const effect
				of state.nextEffects
			) {
				state.speedY +=
					effect.vy;
			}

			state.nextX =
				state.startX
				+ state.speedX * dt;

			state.nextY =
				state.startY
				+ state.speedY * dt;

			return state;
		}


		/* ---------------------------------------------------------------------- */
		/* Collision filtering                                                    */
		/* ---------------------------------------------------------------------- */

		private shouldCollide(
			self:
				MoverState<TEngineData>,
			otherCollider:
				RAPIER.Collider,
		): boolean {
			const otherId =
				this.colliderToId.get(
					otherCollider.handle,
				);

			if (
				otherId === undefined
				|| otherId === self.entry.id
			) {
				return false;
			}

			const other =
				this.entries.get(
					otherId,
				);

			if (!other) {
				return false;
			}

			return self.entry.block
				.applyCollision(
					self.entry.id,
					self.entry.data as any,
					other,
				);
		}

		private isGhost(
			self:
				MoverState<TEngineData>,
			otherCollider:
				RAPIER.Collider,
		): boolean {
			const otherId =
				this.colliderToId.get(
					otherCollider.handle,
				);

			if (
				otherId === undefined
				|| otherId === self.entry.id
			) {
				return false;
			}

			const other =
				this.entries.get(
					otherId,
				);

			if (!other) {
				return false;
			}

			return !self.entry.block
				.applyCollision(
					self.entry.id,
					self.entry.data as any,
					other,
				);
		}


		/* ---------------------------------------------------------------------- */
		/* Collision note management                                              */
		/* ---------------------------------------------------------------------- */

		private addNote(
			notes:
				CollisionNote[],
			seenPairs:
				Set<string>,
			aId: BlockId,
			bId: BlockId,
			sideA: Side,
		): void {
			const key =
				aId < bId
					? `${aId}:${bId}`
					: `${bId}:${aId}`;

			if (
				seenPairs.has(key)
			) {
				return;
			}

			seenPairs.add(key);

			notes.push({
				aId,
				bId,
				sideA,
			});
		}

		private dispatchNote(
			note:
				CollisionNote,
		): void {
			const a =
				this.entries.get(
					note.aId,
				);

			const b =
				this.entries.get(
					note.bId,
				);

			if (!a || !b) {
				return;
			}

			a.block.detectCollision(
				a.id,
				b,
				note.sideA,
				this,
				a.data as any,
			);

			/*
			* A may destroy B during its callback.
			*/
			if (
				this.entries.has(
					b.id,
				)
			) {
				b.block.detectCollision(
					b.id,
					a,
					OPPOSITE_SIDE[
						note.sideA
					],
					this,
					b.data as any,
				);
			}
		}


		/* ---------------------------------------------------------------------- */
		/* Primary movement                                                       */
		/* ---------------------------------------------------------------------- */

		private resolvePrimaryMovement(
			state:
				MoverState<TEngineData>,
			states:
				Map<
					BlockId,
					MoverState<TEngineData>
				>,
			notes:
				CollisionNote[],
			seenPairs:
				Set<string>,
			dt: number,
		): void {
			/*
			* A forced velocity is deliberately not passed through the character
			* controller. This is the important semantic difference for moving
			* platforms: their trajectory cannot be modified by a collision.
			*/
			if (state.forcedVelocity) {
				this.collectForcedVelocityCollisions(
					state,
					states,
					notes,
					seenPairs,
					dt,
				);

				return;
			}

			const desiredTranslation = {
				x:
					state.speedX * dt,

				y:
					state.speedY * dt,
			};

			this.characterController
				.computeColliderMovement(
					state.collider,
					desiredTranslation,
					undefined,
					undefined,
					otherCollider =>
						this.shouldCollide(
							state,
							otherCollider,
						),
				);

			const corrected =
				this.characterController
					.computedMovement();

			state.nextX =
				state.startX
				+ corrected.x;

			state.nextY =
				state.startY
				+ corrected.y;

			/*
			* The character controller is the source of truth for the movement
			* that actually happened. Rebuild the gameplay velocity from that
			* movement before processing the collision notes below.
			*
			* This is important when the character is already within the
			* controller's collision offset: in that case relying only on a
			* reported contact can leave a small downward/upward velocity alive
			* (for example gravity's ~33 px/s contribution).
			*
			* Effects are kept separately, so only the base velocity is rebuilt.
			* The sum of base velocity + surviving effects therefore exactly
			* matches the movement accepted by Rapier.
			*/
			this.syncVelocityWithCorrectedMovement(
				state,
				corrected.x,
				corrected.y,
				dt,
			);

			/*
			* Rapier reports collisions chronologically.
			*/
			for (
				let i = 0;
				i <
					this.characterController
						.numComputedCollisions();
				i++
			) {
				const collision =
					this.characterController
						.computedCollision(i);

				if (
					!collision
					|| !collision.collider
				) {
					continue;
				}

				const otherId =
					this.colliderToId.get(
						collision
							.collider
							.handle,
					);

				if (
					otherId === undefined
				) {
					continue;
				}

				const normal =
					collision.normal1;

				/*
				* normal1 is the obstacle's outward world-space normal.
				*/
				const side =
					sideFromNormal(
						normal.x,
						normal.y,
					);

				/*
				* Collision resolution is performed by Rapier.
				*
				* The gameplay velocity is adjusted separately so that the next
				* frame does not immediately request movement into the same wall.
				*/
				this.cancelVelocityIntoNormal(
					state,
					normal.x,
					normal.y,
				);

				this.addNote(
					notes,
					seenPairs,
					state.entry.id,
					otherId,
					side,
				);
			}

			/*
			* Traversable blocks are not fed to the character controller.
			*
			* We still perform continuous shape casts against them so that
			* detectCollision() retains the old "ghost collision" semantics.
			*/
			this.collectGhostCollisions(
				state,
				states,
				notes,
				seenPairs,
				dt,
			);
		}


		/* ---------------------------------------------------------------------- */
		/* Forced-velocity collision callbacks                                    */
		/* ---------------------------------------------------------------------- */

		private collectForcedVelocityCollisions(
			state:
				MoverState<TEngineData>,
			states:
				Map<
					BlockId,
					MoverState<TEngineData>
				>,
			notes:
				CollisionNote[],
			seenPairs:
				Set<string>,
			dt: number,
		): void {
			const velocity = {
				x:
					state.speedX,

				y:
					state.speedY,
			};

			for (
				const other
				of this.entries.values()
			) {
				if (
					other.id
					=== state.entry.id
				) {
					continue;
				}

				const otherCollider =
					other.block
						.getPhysicsCollider();

				if (!otherCollider) {
					continue;
				}

				const otherVelocity =
					getStateSpeed(
						states,
						other.id,
					);

				const hit =
					state.collider.castCollider(
						velocity,
						otherCollider,
						otherVelocity,
						0,
						dt,
						true,
					);

				if (!hit) {
					continue;
				}

				const normal =
					hit.normal2;

				this.addNote(
					notes,
					seenPairs,
					state.entry.id,
					other.id,
					sideFromNormal(
						normal.x,
						normal.y,
					),
				);
			}
		}


		/* ---------------------------------------------------------------------- */
		/* Ghost collision callbacks                                               */
		/* ---------------------------------------------------------------------- */

		private collectGhostCollisions(
			state:
				MoverState<TEngineData>,
			states:
				Map<
					BlockId,
					MoverState<TEngineData>
				>,
			notes:
				CollisionNote[],
			seenPairs:
				Set<string>,
			dt: number,
		): void {
			const movementX =
				state.nextX
				- state.startX;

			const movementY =
				state.nextY
				- state.startY;

			/*
			* The cast follows the actual movement that survived Rapier's
			* character-controller resolution.
			*/
			const velocity =
				dt > 0
					? {
						x:
							movementX / dt,

						y:
							movementY / dt,
					}
					: {
						x: 0,
						y: 0,
					};

			for (
				const other
				of this.entries.values()
			) {
				if (
					other.id
					=== state.entry.id
				) {
					continue;
				}

				const otherCollider =
					other.block
						.getPhysicsCollider();

				if (!otherCollider) {
					continue;
				}

				if (
					!this.isGhost(
						state,
						otherCollider,
					)
				) {
					continue;
				}

				const otherVelocity =
					getStateSpeed(
						states,
						other.id,
					);

				const hit =
					state.collider.castCollider(
						velocity,
						otherCollider,
						otherVelocity,
						0,
						dt,
						true,
					);

				if (!hit) {
					continue;
				}

				const normal =
					hit.normal2;

				this.addNote(
					notes,
					seenPairs,
					state.entry.id,
					other.id,
					sideFromNormal(
						normal.x,
						normal.y,
					),
				);
			}
		}


		/* ---------------------------------------------------------------------- */
		/* Persistent contact stabilization                                        */
		/* ---------------------------------------------------------------------- */

		private stabilizeVelocityAgainstContacts(
			state:
				MoverState<TEngineData>,
		): void {
			if (
				state.forcedVelocity
			) {
				return;
			}

			const walker =
				state.entry.block.getWalker();

			if (!walker) {
				return;
			}

			const speedX =
				state.nextVx
				+ state.nextEffects.reduce(
						(total, effect) =>
							total + effect.vx,
						0,
					);

			const speedY =
				state.nextVy
				+ state.nextEffects.reduce(
						(total, effect) =>
							total + effect.vy,
						0,
					);

			/*
			 * Floor / ceiling. Y points down.
			 */
			if (walker.onFloor() && speedY > 0) {
				state.nextVy = 0;
				for (const effect of state.nextEffects) {
					effect.vy =
						Math.min(effect.vy, 0);
				}
			}

			if (walker.onCeiling() && speedY < 0) {
				state.nextVy = 0;
				for (const effect of state.nextEffects) {
					effect.vy =
						Math.max(effect.vy, 0);
				}
			}

			/*
			 * Walls. Only the component pointing INTO the wall is cancelled.
			 */
			if (walker.onLeft() && speedX < 0) {
				state.nextVx = 0;
				for (const effect of state.nextEffects) {
					effect.vx =
						Math.max(effect.vx, 0);
				}
			}

			if (walker.onRight() && speedX > 0) {
				state.nextVx = 0;
				for (const effect of state.nextEffects) {
					effect.vx =
						Math.min(effect.vx, 0);
				}
			}
		}

		private refreshWalkerContacts(
			state:
				MoverState<TEngineData>,
		): void {
			const walker =
				state.entry.block.getWalker();

			if (!walker) {
				return;
			}

			walker.clear();

			for (const side of SIDES) {
				const direction =
					SIDE_DIRECTION[side];

				this.characterController
					.computeColliderMovement(
						state.collider,
						{
							x:
							direction.x
							* CONTACT_PROBE_DISTANCE,
							y:
							direction.y
							* CONTACT_PROBE_DISTANCE,
						},
						undefined,
						undefined,
						otherCollider =>
							this.shouldCollide(
								state,
								otherCollider,
							),
					);

				for (
					let i = 0;
					i <
						this.characterController
							.numComputedCollisions();
					i++
				) {
					const collision =
						this.characterController
							.computedCollision(i);

					if (
						!collision
						|| !collision.collider
					) {
						continue;
					}

					const normal =
						collision.normal1;

					const opposing =
						normal.x * direction.x
						+ normal.y * direction.y;

					if (opposing >= -0.5) {
						continue;
					}

					const otherId =
						this.colliderToId.get(
							collision.collider.handle,
						);

					if (otherId === undefined) {
						continue;
					}

					walker.setContact(
						side,
						otherId,
					);

					break;
				}
			}
		}


		/* ---------------------------------------------------------------------- */
		/* Velocity collision resolution                                          */
		/* ---------------------------------------------------------------------- */

		private syncVelocityWithCorrectedMovement(
			state:
				MoverState<TEngineData>,
			movementX: number,
			movementY: number,
			dt: number,
		): void {
			if (
				state.forcedVelocity
				|| !(dt > 0)
			) {
				return;
			}

			const resolvedVx =
				movementX / dt;

			const resolvedVy =
				movementY / dt;

			let effectX = 0;
			let effectY = 0;

			for (
				const effect
				of state.nextEffects
			) {
				effectX += effect.vx;
				effectY += effect.vy;
			}

			state.nextVx =
				this.cleanResolvedVelocity(
					resolvedVx - effectX,
				);

			state.nextVy =
				this.cleanResolvedVelocity(
					resolvedVy - effectY,
				);
		}

		private cleanResolvedVelocity(
			value: number,
		): number {
			return Math.abs(value) <= 1e-7
				? 0
				: value;
		}


		private cancelVelocityIntoNormal(
			state:
				MoverState<TEngineData>,
			nx: number,
			ny: number,
		): void {
			if (
				state.forcedVelocity
			) {
				/*
				* Forced velocity is explicitly immutable.
				*/
				return;
			}

			const velocity =
				removeVelocityIntoNormal(
					state.nextVx,
					state.nextVy,
					nx,
					ny,
				);

			state.nextVx =
				this.cleanResolvedVelocity(
					velocity.x,
				);

			state.nextVy =
				this.cleanResolvedVelocity(
					velocity.y,
				);

			/*
			* Rapier keeps a small collision skin around the character. As a
			* result, the corrected translation can contain a tiny velocity in
			* the direction opposite to the surface (for example -0.006 while
			* standing on the floor). That is not gameplay motion and must not
			* leak into the Block velocity.
			*
			* For axis-aligned gameplay contacts, force the blocked axis to the
			* exact mathematical zero. The tangential component is preserved.
			*/
			if (
				Math.abs(ny)
				>= Math.abs(nx)
			) {
				state.nextVy = 0;
			} else {
				state.nextVx = 0;
			}

			/*
			* Velocity effects are velocities as well, so remove their component
			* going into the same surface.
			*/
			for (
				const effect
				of state.nextEffects
			) {
				const result =
					removeVelocityIntoNormal(
						effect.vx,
						effect.vy,
						nx,
						ny,
					);

				effect.vx =
					result.x;

				effect.vy =
					result.y;
			}
		}


		/* ---------------------------------------------------------------------- */
		/* Walker contacts                                                        */
		/* ---------------------------------------------------------------------- */

		private resolveWalker(
			state:
				MoverState<TEngineData>,
			states:
				Map<
					BlockId,
					MoverState<TEngineData>
				>,
			dt: number,
		): void {
			const walker =
				state.entry.block.getWalker();

			if (!walker) {
				return;
			}

			const previousCarrier =
				walker.carrierId;

			walker.clear();

			/*
			* State positions have already been committed before this function.
			*
			* The Rapier collider therefore represents the block's final primary
			* position for this frame.
			*/
			for (
				const side
				of SIDES
			) {
				const direction =
					SIDE_DIRECTION[side];

				const probe = {
					x:
						direction.x
						* CONTACT_PROBE_DISTANCE,

					y:
						direction.y
						* CONTACT_PROBE_DISTANCE,
				};

				this.characterController
					.computeColliderMovement(
						state.collider,
						probe,
						undefined,
						undefined,
						otherCollider =>
							this.shouldCollide(
								state,
								otherCollider,
							),
					);

				for (
					let i = 0;
					i <
						this
							.characterController
							.numComputedCollisions();
					i++
				) {
					const collision =
						this
							.characterController
							.computedCollision(i);

					if (
						!collision
						|| !collision.collider
					) {
						continue;
					}

					const normal =
						collision.normal1;

					/*
					* The obstacle normal must oppose the probe direction.
					*
					* This prevents a floor probe from accidentally accepting a
					* nearly vertical wall, for example.
					*/
					const opposing =
						normal.x * direction.x
						+ normal.y * direction.y;

					if (
						opposing >=
						-0.5
					) {
						continue;
					}

					const otherId =
						this.colliderToId.get(
							collision
								.collider
								.handle,
						);

					if (
						otherId === undefined
					) {
						continue;
					}

					walker.setContact(
						side,
						otherId,
					);

					break;
				}
			}

			/*
			* A floor, left wall, or right wall can carry the walker.
			* A ceiling cannot.
			*/
			const carrierId =
				walker.getContact('floor')
				?? walker.getContact('left')
				?? walker.getContact('right');

			walker.carrierId =
				carrierId;

			if (
				carrierId !== null
			) {
				const carrierState =
					states.get(
						carrierId,
					);

				if (!carrierState) {
					return;
				}

				const carrierDx =
					carrierState.nextX
					- carrierState.startX;

				const carrierDy =
					carrierState.nextY
					- carrierState.startY;

				if (
					carrierDx === 0
					&& carrierDy === 0
				) {
					return;
				}

				/*
				* Move the walker by the carrier displacement.
				*
				* The carrier itself is excluded from the obstacle set because it
				* is intentionally the object doing the carrying.
				*/
				this.characterController
					.computeColliderMovement(
						state.collider,
						{
							x: carrierDx,
							y: carrierDy,
						},
						undefined,
						undefined,
						otherCollider => {
							const otherId =
								this.colliderToId.get(
									otherCollider.handle,
								);

							if (
								otherId ===
								state.entry.id
							) {
								return false;
							}

							if (
								otherId ===
								carrierId
							) {
								return false;
							}

							return this.shouldCollide(
								state,
								otherCollider,
							);
						},
					);

				const corrected =
					this
						.characterController
						.computedMovement();

				state.nextX +=
					corrected.x;

				state.nextY +=
					corrected.y;

				for (
					let i = 0;
					i <
						this
							.characterController
							.numComputedCollisions();
					i++
				) {
					const collision =
						this
							.characterController
							.computedCollision(i);

					if (
						!collision
						|| !collision.collider
					) {
						continue;
					}

					const normal =
						collision.normal1;

					this.cancelVelocityIntoNormal(
						state,
						normal.x,
						normal.y,
					);
				}

				return;
			}

			/*
			* If the walker has just left a moving platform, preserve that
			* platform's velocity as a temporary effect.
			*/
			if (
				previousCarrier !== null
				&& !state.forcedVelocity
			) {
				const previousCarrierState =
					states.get(
						previousCarrier,
					);

				if (
					previousCarrierState
					&& (
						previousCarrierState.speedX
						!== 0
						|| previousCarrierState.speedY
						!== 0
					)
				) {
					this.pendingEffects.push({
						id:
							state.entry.id,

						vx:
							previousCarrierState.speedX,

						vy:
							previousCarrierState.speedY,
					});
				}
			}
		}


		/* ---------------------------------------------------------------------- */
		/* Miscellaneous                                                          */
		/* ---------------------------------------------------------------------- */

		private assertNotDisposed():
			void {
			if (this.disposed) {
				throw new Error(
					'PlatformerEngine has been disposed.',
				);
			}
		}
	}


	let rapierInitialization:
		Promise<void> | null = null;

	function initRapier(): Promise<void> {
		if (!rapierInitialization) {
			rapierInitialization =
				RAPIER.init();
		}

		return rapierInitialization;
	}

	export async function createPlatformerEngine<
		TEngineData extends EngineData,
	>(
		isClient: boolean,
		storage: TEngineData['Storage'],
		game: TEngineData['Game'],
		gravity: Point = {
			x: 0,
			y: 0,
		},
	): Promise<
		PlatformerEngine<TEngineData>
	> {
		await initRapier();

		return new PlatformerEngine(
			isClient,
			storage,
			game,
			gravity,
		);
	}

	/* -------------------------------------------------------------------------- */
	/* Side classification                                                        */
	/* -------------------------------------------------------------------------- */

	/**
	 * Converts an obstacle normal into the gameplay side seen by the block.
	 *
	 * The normal points from the obstacle toward the block.
	 *
	 * Since Y points down:
	 *   negative Y = floor normal
	 *   positive Y = ceiling normal
	 */
	function sideFromNormal(
		nx: number,
		ny: number,
	): Side {
		if (
			Math.abs(ny)
			>= Math.abs(nx)
		) {
			return ny < 0
				? 'floor'
				: 'ceiling';
		}

		return nx > 0
			? 'left'
			: 'right';
	}


}

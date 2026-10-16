import RAPIER from '@dimforge/rapier2d-compat';
import { ImageLoaderFolder } from './ImageLoader';


export namespace platformEngine {
	/* -------------------------------------------------------------------------- */
	/* Constants                                                                  */
	/* -------------------------------------------------------------------------- */

	export const MAX_FALL_SPEED =
		1400;

	/**
	 * Approximate size (in world units, i.e. pixels) of "one meter" for Rapier.
	 * Rapier scales its internal tolerances (contact skin, prediction distance...)
	 * with this value, so it keeps working well with pixel-sized worlds.
	 */
	const LENGTH_UNIT =
		32;

	/** Surface tolerance (radians) used for blocks that do not have a Walker. */
	const DEFAULT_VERTICAL_TOLERANCE =
		0.1;

	/* -------------------------------------------------------------------------- */
	/* Basic types                                                                */
	/* -------------------------------------------------------------------------- */

	export type BlockId =
		number;

	export type BlockCategory =
		string;

	/**
	 * Which face of a block is touched.
	 *
	 * - left / right: the touched surface is (almost) vertical
	 * - floor / ceiling: the touched surface is (almost) horizontal
	 * - climbing: slope in between, facing upward (the block stands on it)
	 * - sliding: slope in between, facing downward (the block is under it)
	 */
	export type Side =
		| 'floor'
		| 'ceiling'
		| 'left'
		| 'right'
		| 'climbing'
		| 'sliding';

	const SIDES:
		readonly Side[] = [
			'floor',
			'ceiling',
			'left',
			'right',
			'climbing',
			'sliding',
		];


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

	/**
	 * Axis-aligned rectangle, in block-normalized coordinates:
	 * (0, 0) is the top-left corner of the block, (1, 1) the bottom-right one.
	 * (x, y) is the top-left corner of the rectangle.
	 */
	export interface Rectangle {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	/**
	 * Right triangle, in block-normalized coordinates.
	 *
	 * The hypotenuse goes from (x0, y0) to (x1, y1). The right angle is
	 * deduced from the signs of dx = x1 - x0 and dy = y1 - y0: it sits at
	 * (x1, y0), i.e. "go horizontally first, then vertically".
	 *
	 *   dx > 0, dy < 0   "/"  solid below-right   (floor ramp rising to the right)
	 *   dx < 0, dy < 0   "\"  solid below-left    (floor ramp rising to the left)
	 *   dx > 0, dy > 0   "\"  solid above-right   (ceiling ramp)
	 *   dx < 0, dy > 0   "/"  solid above-left    (ceiling ramp)
	 */
	export interface Ramp {
		x0: number;
		y0: number;
		x1: number;
		y1: number;
	}

	/** The three vertices of a ramp, right angle last. Single place to change the convention. */
	function rampVertices(ramp: Ramp): [Point, Point, Point] {
		return [
			{ x: ramp.x0, y: ramp.y0 },
			{ x: ramp.x1, y: ramp.y1 },
			{ x: ramp.x1, y: ramp.y0 },
		];
	}

	function assertUnit(...values: number[]): void {
		for (const value of values) {
			if (!Number.isFinite(value) || value < -1e-9 || value > 1 + 1e-9) {
				throw new Error(`Hitbox coordinates must be within [0, 1], got ${value}.`);
			}
		}
	}

	/** Collision shape of a block: a union of rectangles and ramps, all within [0, 1]. */
	export class Hitbox {
		constructor(
			public readonly rectangles: readonly Rectangle[] = [],
			public readonly ramps: readonly Ramp[] = [],
		) {
			if (rectangles.length + ramps.length === 0) {
				throw new Error('A hitbox needs at least one rectangle or ramp.');
			}
			for (const r of rectangles) {
				assertUnit(r.x, r.y, r.x + r.width, r.y + r.height);
				if (!(r.width > 0) || !(r.height > 0)) {
					throw new Error('Rectangle dimensions must be positive.');
				}
			}
			for (const r of ramps) {
				assertUnit(r.x0, r.y0, r.x1, r.y1);
				if (r.x0 === r.x1 || r.y0 === r.y1) {
					throw new Error('A ramp must have a non-zero area.');
				}
			}
		}

		/** A single rectangle covering the whole block. */
		static full(): Hitbox {
			return new Hitbox([{ x: 0, y: 0, width: 1, height: 1 }]);
		}
	}

	/** Build the Rapier colliders of a hitbox, relative to the block center. */
	function hitboxToColliders(hitbox: Hitbox, size: Size): RAPIER.ColliderDesc[] {
		const toLocal = (x: number, y: number): Point => ({
			x: (x - 0.5) * size.width,
			y: (y - 0.5) * size.height,
		});
		const descs: RAPIER.ColliderDesc[] = [];

		for (const r of hitbox.rectangles) {
			const center = toLocal(r.x + r.width / 2, r.y + r.height / 2);
			descs.push(
				RAPIER.ColliderDesc
					.cuboid(r.width * size.width / 2, r.height * size.height / 2)
					.setTranslation(center.x, center.y),
			);
		}

		for (const ramp of hitbox.ramps) {
			const coordinates: number[] = [];
			for (const vertex of rampVertices(ramp)) {
				const local = toLocal(vertex.x, vertex.y);
				coordinates.push(local.x, local.y);
			}
			const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(coordinates));
			if (!desc) throw new Error('Invalid ramp.');
			descs.push(desc);
		}

		for (const desc of descs) {
			desc
				// No friction anywhere in the engine.
				.setFriction(0)
				.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
				.setRestitution(0)
				// Mass comes from the rigid body (see createBody), not from the shapes.
				.setDensity(0)
				// Lets blocks veto a collision through Block.applyCollision.
				.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS)
				// Also report contacts involving kinematic bodies (moving platforms).
				// FIXED_FIXED is deliberately left out: tiles never need to see each other.
				.setActiveCollisionTypes(
					RAPIER.ActiveCollisionTypes.DEFAULT
					| RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC
					| RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED,
				);
		}
		return descs;
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


	/* -------------------------------------------------------------------------- */
	/* Velocity effects                                                           */
	/* -------------------------------------------------------------------------- */

	export enum EffectId {
		/** Speed inherited from a moving object the block just left. */
		ADDITIONNAL_SPEED,
	}

	export interface Effect {
		id: number;
		vx: number;
		vy: number;
	}

	/** Kept so existing code using the old name keeps compiling. */
	export type VelocityEffect = Effect;

	/**
	 * Called once per update for every effect of the matching id.
	 * It may mutate the effect (e.g. reduce its norm) and returns whether the
	 * effect is still alive (false = remove it).
	 */
	export type EffectUpdater = (effect: Effect, dt: number) => boolean;

	/** Norm lost per second by an ADDITIONNAL_SPEED effect. */
	const ADDITIONAL_SPEED_DECAY =
		100;

	const DEFAULT_EFFECT_UPDATERS: Record<number, EffectUpdater> = {
		[EffectId.ADDITIONNAL_SPEED]: (effect, dt) => {
			const norm = Math.hypot(effect.vx, effect.vy);
			const reduced = Math.max(0, norm - ADDITIONAL_SPEED_DECAY * dt);
			if (reduced === 0) return false;

			const ratio = reduced / norm;
			effect.vx *= ratio;
			effect.vy *= ratio;
			return true;
		},
	};

	export class VelocityEffectHandler {
		private effects:
			Effect[] = [];

		private readonly updaters:
			Record<number, EffectUpdater>;

		/** Extra updaters complete (or override) the default ones. */
		constructor(
			updaters: Record<number, EffectUpdater> = {},
		) {
			this.updaters = {
				...DEFAULT_EFFECT_UPDATERS,
				...updaters,
			};
		}

		append(
			vx: number,
			vy: number,
			id: number = EffectId.ADDITIONNAL_SPEED,
		): void {
			if (
				vx === 0
				&& vy === 0
			) {
				return;
			}

			this.effects.push({
				id,
				vx,
				vy,
			});
		}

		/** Live effects; the engine mutates them when a collision blocks them. */
		getEffects(): Effect[] {
			return this.effects;
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

		/** Run every updater, then drop dead and null effects. Effects without updater never expire. */
		update(
			dt: number,
		): void {
			this.effects =
				this.effects.filter(effect => {
					const updater =
						this.updaters[effect.id];

					const alive =
						updater
							? updater(effect, dt)
							: true;

					return alive
						&& (
							effect.vx !== 0
							|| effect.vy !== 0
						);
				});
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
				climbing: null,
				sliding: null,
			};

		carrierId:
			BlockId | null = null;

		/**
		 * Angle (radians) below which a touched surface is considered
		 * completely vertical (left/right) or completely horizontal
		 * (floor/ceiling). Anything in between is climbing/sliding.
		 */
		getVerticalTolerancy() {
			return 0.1;
		}

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

		onClimbing(): boolean {
			return (
				this.contacts.climbing
				!== null
			);
		}

		onSliding(): boolean {
			return (
				this.contacts.sliding
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

		/** Read-only animation state used by authoritative snapshots. */
		getFrameState() {
			return {
				state: this.state,
				index: this.index,
				facingLeft: this.facingLeft,
			};
		}

		/** Restore an authoritative animation frame without advancing the animation. */
		setFrameState(state: number, index: number, facingLeft: boolean) {
			const targetState = this.linesDescriptors[state] ? state : 0;
			const descriptor = this.linesDescriptors[targetState];
			const requestedIndex = Number.isFinite(index) ? Math.trunc(index) : 0;

			this.state = targetState;
			this.index = Math.max(0, Math.min(Math.max(0, descriptor.count - 1), requestedIndex));
			this.tick = descriptor.delay;
			this.facingLeft = facingLeft;
		}

		/** Update facing during simulation too, even when the server never renders. */
		private updateFacing(block: Block<any, any>) {
			const velocity = block.getVelocity();
			if (!velocity) return;

			if (velocity.x < 0) this.facingLeft = true;
			else if (velocity.x > 0) this.facingLeft = false;
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
			this.updateFacing(block);

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
			// A `next` transition starts a fresh animation row. Keeping the previous
			// frame index can select a frame outside the new row (for example a
			// 5-frame wall-hang animation transitioning to a 4-frame wall-slide).
			this.index = 0;
			this.tick = this.linesDescriptors[u.state].delay;
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

			this.updateFacing(block);

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
		/* Block coordinates stay authoritative for teleports; the Rapier body follows them. */
		private _x = 0;
		private _y = 0;

		private physicsBody: RAPIER.RigidBody | null = null;

		/**
		 * The horizontal center coordinate of the block.
		 */
		get x(): number {
			return this._x;
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
			return this._y;
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
		 * Collision shape of the block. Null means a single rectangle
		 * covering the whole block.
		 */
		getPolygon(): Hitbox | null {
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

		/**
		 * Velocity of the block, mutated in place by the engine.
		 *
		 * Without a velocity (null) the block is never moved by collisions.
		 */
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

		/** Angle in radians, or null if the block has no angle. */
		getAngle(): number | null {
			return null;
		}

		/** Called by the engine when the angle changed during the simulation. */
		setAngle(angle: number): void {
		}

		/**
		 * Angular velocity in rad/s, or null if the block has none.
		 *
		 * Without an angular velocity (null) the block is never rotated by collisions.
		 */
		getAngularVelocity(): number | null {
			return null;
		}

		/** Called by the engine when the angular velocity changed during the simulation. */
		setAngularVelocity(angularVelocity: number): void {
		}

		/** Angular counterpart of getForcedVelocity: never modified by collisions. */
		getForcedAngularVelocity(): number | null {
			return null;
		}

		getVelocityEffects():
			VelocityEffectHandler | null {
			return null;
		}

		mustBeDestroyed(): boolean {
			return false;
		}

		/** Return the Rapier rigid body attached to this block. */
		getPhysicsCollider(): RAPIER.RigidBody | null {
			return this.physicsBody;
		}

		/** Bind the Rapier body created by the engine. */
		bindPhysicsCollider(
			body: RAPIER.RigidBody,
		): void {
			if (this.physicsBody) {
				throw new Error(
					'The block already has a physics body.',
				);
			}

			this.physicsBody = body;
			this.syncPhysicsPosition();
		}

		/**
		 * Called when the block is removed from its engine.
		 */
		unbindPhysicsCollider(): void {
			this.physicsBody = null;
		}

		/** @internal Engine only: store the position computed by Rapier without pushing it back. */
		syncFromPhysics(x: number, y: number): void {
			this._x = x;
			this._y = y;
		}

		private syncPhysicsPosition(): void {
			this.physicsBody?.setTranslation(
				{ x: this._x, y: this._y },
				true,
			);
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

		/**
		 * Whether this block physically collides with `block`.
		 * Both blocks are asked; the pair collides only if both agree.
		 * Called from inside Rapier's step: it must not add or remove blocks.
		 * A refused pair is still reported through detectCollision (overlap).
		 */
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

		readonly world: RAPIER.World;

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
			effectId?: number,
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

	/**
	 * How a block is simulated by Rapier:
	 * - fixed: nothing moves it (no velocity, no angular velocity)
	 * - kinematic: driven by a forced velocity, collisions never alter it
	 * - dynamic: Rapier resolves collisions; locked axes stay locked
	 */
	type BodyKind =
		'fixed' | 'kinematic' | 'dynamic';

	interface BodyMode {
		kind: BodyKind;
		linearLocked: boolean;
		angularLocked: boolean;
	}

	/** Velocity is "blocked" without getVelocity or with a forced velocity (same for angular). */
	function bodyModeOf(block: Block<any, any>): BodyMode {
		const forced = block.getForcedVelocity() !== null;
		const forcedAngular = block.getForcedAngularVelocity() !== null;
		const linearLocked = forced || block.getVelocity() === null;
		const angularLocked = forcedAngular || block.getAngularVelocity() === null;

		const driven = forced || (forcedAngular && linearLocked);
		const kind: BodyKind = driven
			? 'kinematic'
			: linearLocked && angularLocked
				? 'fixed'
				: 'dynamic';

		return { kind, linearLocked, angularLocked };
	}

	function toRapierBodyType(kind: BodyKind): RAPIER.RigidBodyType {
		switch (kind) {
			case 'fixed': return RAPIER.RigidBodyType.Fixed;
			case 'kinematic': return RAPIER.RigidBodyType.KinematicVelocityBased;
			default: return RAPIER.RigidBodyType.Dynamic;
		}
	}

	interface BodyState {
		readonly id: BlockId;
		readonly body: RAPIER.RigidBody;
		readonly colliders: RAPIER.Collider[];
		kind: BodyKind;
		translationsLocked: boolean;
		rotationsLocked: boolean;
		/** Last angle exchanged with Rapier, to detect external changes. */
		angle: number | null;
		/** Velocity of the carrier that was added to this block during the last step. */
		carrierVx: number;
		carrierVy: number;
	}

	/** A pair of blocks in contact. The normal points from b toward a. */
	interface Touch {
		aId: BlockId;
		bId: BlockId;
		nx: number;
		ny: number;
		sideA: Side;
		sideB: Side;
		/** False when a block refused the collision (overlap only). */
		solid: boolean;
	}

	function pairKey(a: BlockId, b: BlockId): string {
		return a < b ? `${a}:${b}` : `${b}:${a}`;
	}

	/**
	 * Converts a contact normal (pointing from the obstacle toward the block)
	 * into the face of the block that is touched. Y points down.
	 */
	function classifySide(
		nx: number,
		ny: number,
		tolerance: number,
	): Side {
		const slack = Math.sin(tolerance);

		if (Math.abs(ny) <= slack) {
			return nx > 0 ? 'left' : 'right';
		}
		if (Math.abs(nx) <= slack) {
			return ny < 0 ? 'floor' : 'ceiling';
		}
		return ny < 0 ? 'climbing' : 'sliding';
	}

	/**
	 * Remove the part of a velocity that pushes into a surface.
	 * Only the dominant axis of the normal is cleared, so the intent of the
	 * other axis (e.g. walking speed on a ramp) is kept: Rapier already
	 * deflects the actual motion along the surface.
	 */
	function removeBlockedComponent(
		vx: number,
		vy: number,
		nx: number,
		ny: number,
	): [number, number] {
		if (Math.abs(ny) >= Math.abs(nx)) {
			return ny * vy < 0 ? [vx, 0] : [vx, vy];
		}
		return nx * vx < 0 ? [0, vy] : [vx, vy];
	}


	/* -------------------------------------------------------------------------- */
	/* Platformer engine                                                          */
	/* -------------------------------------------------------------------------- */

	class PlatformerEngine<TEngineData extends EngineData>
		implements IBlockEngine<TEngineData> {
		private nextId = 0;
		private readonly entries = new Map<BlockId, BlockEntry<TEngineData>>();
		private readonly bodies = new Map<BlockId, BodyState>();
		private readonly bodyToId = new Map<number, BlockId>();
		private readonly animators = new Map<BlockId, Animator>();
		/** Block pairs whose collision was refused during the current step. */
		private readonly passthrough = new Set<string>();
		/** Fallback contact sides for refused pairs Rapier omits from its contact graph. */
		private readonly refusedPairs = new Map<string, {
			aId: BlockId;
			bId: BlockId;
			sideA: Side;
			sideB: Side;
		}>();
		private readonly hooks: RAPIER.PhysicsHooks;
		private disposed = false;
		readonly world: RAPIER.World;
		private readonly eventQueue = new RAPIER.EventQueue(true);

		constructor(
			public readonly isClient: boolean,
			public readonly storage: TEngineData['Storage'],
			public readonly game: TEngineData['Game'],
			gravity: Point = { x: 0, y: 0 },
		) {
			// Gravity is supplied by game logic through block velocities.
			this.world = new RAPIER.World({ x: 0, y: 0 });
			this.world.integrationParameters.lengthUnit = LENGTH_UNIT;
			void gravity;

			this.hooks = {
				filterContactPair: (_collider1, _collider2, body1, body2) => {
					const aId = this.bodyToId.get(body1);
					const bId = this.bodyToId.get(body2);
					const a = aId === undefined ? undefined : this.entries.get(aId);
					const b = bId === undefined ? undefined : this.entries.get(bId);
					if (!a || !b) return RAPIER.SolverFlags.COMPUTE_IMPULSE;

					const solidA = a.block.applyCollision(a.id, a.data as any, b);
					const solidB = b.block.applyCollision(b.id, b.data as any, a);

					if (solidA && solidB) return RAPIER.SolverFlags.COMPUTE_IMPULSE;

					const key = pairKey(a.id, b.id);
					this.passthrough.add(key);
					if (!this.refusedPairs.has(key)) {
						const first = a.id < b.id ? a : b;
						const second = a.id < b.id ? b : a;
						const sides = this.inferOverlapSides(first.block, second.block);
						this.refusedPairs.set(key, {
							aId: first.id,
							bId: second.id,
							sideA: sides.sideA,
							sideB: sides.sideB,
						});
					}
					return RAPIER.SolverFlags.EMPTY;
				},

				filterIntersectionPair: () => true,
			};
		}

		addBlock(
			block: AnyBlock<TEngineData>,
			category: BlockCategory | null = null,
			data: unknown = null,
		): BlockId {
			this.assertNotDisposed();
			if (block.getPhysicsCollider()) {
				throw new Error('The block is already attached to a physics engine.');
			}

			const id = this.nextId++;
			const state = this.createBody(id, block);
			block.bindPhysicsCollider(state.body);
			this.bodies.set(id, state);
			this.bodyToId.set(state.body.handle, id);
			this.entries.set(id, { id, block, category, data });

			if (this.isClient) {
				const animator = block.createAnimator();
				if (animator) this.animators.set(id, animator);
			}
			return id;
		}

		removeBlock(id: BlockId): boolean {
			const entry = this.entries.get(id);
			if (!entry) return false;

			const state = this.bodies.get(id);
			if (state) {
				this.bodyToId.delete(state.body.handle);
				this.world.removeRigidBody(state.body);
				this.bodies.delete(id);
			}
			entry.block.unbindPhysicsCollider();
			this.animators.delete(id);
			return this.entries.delete(id);
		}

		getBlock(id: BlockId): AnyBlock<TEngineData> | null {
			return this.entries.get(id)?.block ?? null;
		}

		getEntry(id: BlockId): BlockEntry<TEngineData> | null {
			return this.entries.get(id) ?? null;
		}

		*getBlocks(): Generator<BlockEntry<TEngineData>> {
			for (const entry of this.entries.values()) yield entry;
		}

		addVelocityEffect(
			id: BlockId,
			vx: number,
			vy: number,
			effectId: number = EffectId.ADDITIONNAL_SPEED,
		): boolean {
			const handler = this.entries.get(id)?.block.getVelocityEffects();
			if (!handler) return false;
			handler.append(vx, vy, effectId);
			return true;
		}

		getGame(): TEngineData['Game'] {
			return this.game;
		}

		getAnimator(id: BlockId): Animator | null {
			return this.animators.get(id) ?? null;
		}

		dispose(): void {
			if (this.disposed) return;
			this.disposed = true;
			for (const entry of this.entries.values()) entry.block.unbindPhysicsCollider();
			this.entries.clear();
			this.bodies.clear();
			this.bodyToId.clear();
			this.animators.clear();
			this.world.free();
			this.eventQueue.free();
		}

		update(dt: number): void {
			this.assertNotDisposed();
			if (!(dt > 0)) return;

			for (const entry of Array.from(this.entries.values())) {
				if (this.entries.has(entry.id)) {
					entry.block.processBeforeEngine(entry.id, dt, this, entry.data as any);
				}
			}

			// 1. Give Rapier the state wanted by the blocks. Carriers are read first
			//    so that the order of the blocks does not matter.
			const states = Array.from(this.bodies.values());
			for (const state of states) this.readCarrierVelocity(state);
			for (const state of states) this.pushToRapier(state, dt);

			// 2. Rapier does all the collision detection and resolution.
			this.passthrough.clear();
			this.refusedPairs.clear();
			this.world.timestep = dt;
			this.world.step(this.eventQueue, this.hooks);

			// 3. Read the result back and react to the contacts.
			for (const state of states) this.pullFromRapier(state);
			this.reactToContacts();

			for (const entry of Array.from(this.entries.values())) {
				if (this.entries.has(entry.id)) {
					entry.block.processAfterEngine(entry.id, dt, this, entry.data as any);
				}
			}

			if (this.isClient) {
				for (const [id, animator] of this.animators) {
					const entry = this.entries.get(id);
					if (!entry) continue;
					const walker = entry.block.getWalker();
					const direction = entry.block.getDirection();
					if (walker && direction) animator.frame(entry.block, walker, direction, dt);
				}
			}

			for (const entry of Array.from(this.entries.values())) {
				if (entry.block.mustBeDestroyed()) this.removeBlock(entry.id);
			}
		}

		/* ---------------------------------------------------------------------- */
		/* Blocks -> Rapier                                                       */
		/* ---------------------------------------------------------------------- */

		private createBody(id: BlockId, block: AnyBlock<TEngineData>): BodyState {
			const size = block.getSize();
			if (
				!Number.isFinite(size.width) || !Number.isFinite(size.height)
				|| size.width <= 0 || size.height <= 0
			) {
				throw new Error(`Invalid block size: ${size.width} x ${size.height}`);
			}

			const kind = bodyModeOf(block).kind;
			const angle = block.getAngle();
			const body = this.world.createRigidBody(
				new RAPIER.RigidBodyDesc(toRapierBodyType(kind))
					.setTranslation(block.x, block.y)
					.setRotation(angle ?? 0)
					.setCanSleep(false)
					.setCcdEnabled(true)
					// The whole mass sits at the block center, so rotations pivot around
					// the block position whatever the hitbox looks like.
					.setAdditionalMassProperties(
						1,
						{ x: 0, y: 0 },
						(size.width * size.width + size.height * size.height) / 12,
					),
			);

			const colliders = (
				hitboxToColliders(block.getPolygon() ?? Hitbox.full(), size)
				.map(desc => {
					desc.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
					desc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
					return this.world.createCollider(desc, body);
				})
			);

			for (const collider of colliders) {
				console.log({
					collider: collider.handle,
					hooks: collider.activeHooks(),
					bodyType: body.bodyType(),
					sensor: collider.isSensor(),
				});
			}

			return {
				id,
				body,
				colliders,
				kind,
				translationsLocked: false,
				rotationsLocked: false,
				angle,
				carrierVx: 0,
				carrierVy: 0,
			};
		}

		/** Remember how fast the platform under (or beside) a walker was moving. */
		private readCarrierVelocity(state: BodyState): void {
			const walker = this.entries.get(state.id)?.block.getWalker();
			const carrier = walker && walker.carrierId !== null
				? this.bodies.get(walker.carrierId)
				: undefined;
			const velocity = carrier?.body.linvel();
			state.carrierVx = velocity?.x ?? 0;
			state.carrierVy = velocity?.y ?? 0;
		}

		private pushToRapier(state: BodyState, dt: number): void {
			const block = this.entries.get(state.id)!.block;
			const body = state.body;
			const mode = bodyModeOf(block);

			if (mode.kind !== state.kind) {
				body.setBodyType(toRapierBodyType(mode.kind), true);
				state.kind = mode.kind;
			}

			// Locked axes only make sense for dynamic bodies; the other kinds are
			// already insensitive to collisions (or do not move at all).
			const lockTranslations = mode.kind === 'dynamic' && mode.linearLocked;
			if (lockTranslations !== state.translationsLocked) {
				body.lockTranslations(lockTranslations, true);
				state.translationsLocked = lockTranslations;
			}
			const lockRotations = mode.kind === 'dynamic' && mode.angularLocked;
			if (lockRotations !== state.rotationsLocked) {
				body.lockRotations(lockRotations, true);
				state.rotationsLocked = lockRotations;
			}

			// Picks up angle changes made by the game since the last update.
			const angle = block.getAngle();
			if (angle !== null && angle !== state.angle) {
				body.setRotation(angle, true);
			}
			state.angle = angle;

			if (mode.kind === 'fixed') return;

			let vx = 0;
			let vy = 0;
			const forced = block.getForcedVelocity();
			const velocity = block.getVelocity();
			if (forced) {
				vx = forced.x;
				vy = forced.y;
			} else if (velocity) {
				const direction = block.getDirection();
				if (direction) velocity.x = approachSpeed(velocity.x, direction, dt);

				const effects = block.getVelocityEffects();
				effects?.update(dt);
				const bonus = effects?.total() ?? { x: 0, y: 0 };

				vx = velocity.x + bonus.x + state.carrierVx;
				vy = velocity.y + bonus.y + state.carrierVy;
			}
			body.setLinvel({ x: vx, y: vy }, true);
			body.setAngvel(
				block.getForcedAngularVelocity() ?? block.getAngularVelocity() ?? 0,
				true,
			);
		}

		/* ---------------------------------------------------------------------- */
		/* Rapier -> blocks                                                       */
		/* ---------------------------------------------------------------------- */

		private pullFromRapier(state: BodyState): void {
			if (state.kind === 'fixed') return;
			const block = this.entries.get(state.id)!.block;
			const position = state.body.translation();
			block.syncFromPhysics(position.x, position.y);

			if (block.getAngle() !== null) {
				state.angle = state.body.rotation();
				block.setAngle(state.angle);
			}
			if (
				block.getAngularVelocity() !== null
				&& block.getForcedAngularVelocity() === null
			) {
				block.setAngularVelocity(state.body.angvel());
			}
		}

		/* ---------------------------------------------------------------------- */
		/* Reactions to collisions                                                */
		/* ---------------------------------------------------------------------- */

		private reactToContacts(): void {
			for (const state of this.bodies.values()) {
				this.entries.get(state.id)?.block.getWalker()?.clear();
			}

			const touches = this.collectTouches();
			for (const touch of touches) {
				if (!touch.solid) continue;
				this.react(touch.aId, touch.bId, touch.sideA, touch.nx, touch.ny);
				this.react(touch.bId, touch.aId, touch.sideB, -touch.nx, -touch.ny);
			}
			this.updateCarriers();

			// Notify both blocks, once per pair and face.
			const reportedPairs = new Set<string>();
			for (const touch of touches) {
				const a = this.entries.get(touch.aId);
				const b = this.entries.get(touch.bId);
				if (!a || !b) continue;
				reportedPairs.add(pairKey(touch.aId, touch.bId));
				a.block.detectCollision(a.id, b, touch.sideA, this, a.data as any);
				if (this.entries.has(b.id)) {
					b.block.detectCollision(b.id, a, touch.sideB, this, b.data as any);
				}
			}

			// Rapier may omit refused pairs from the contact graph entirely. Still
			// report those overlaps, but never run physical contact reactions for them.
			for (const [key, refused] of this.refusedPairs) {
				if (reportedPairs.has(key)) continue;
				const a = this.entries.get(refused.aId);
				const b = this.entries.get(refused.bId);
				if (!a || !b) continue;
				a.block.detectCollision(a.id, b, refused.sideA, this, a.data as any);
				if (this.entries.has(b.id)) {
					b.block.detectCollision(b.id, a, refused.sideB, this, b.data as any);
				}
			}
		}

		/**
		 * Approximate overlap sides for a refused pair that has no Rapier manifold.
		 * The normal contact graph remains the source of exact sides whenever present.
		 */
		private inferOverlapSides(
			a: AnyBlock<TEngineData>,
			b: AnyBlock<TEngineData>,
		): { sideA: Side; sideB: Side } {
			const aSize = a.getSize();
			const bSize = b.getSize();
			const dx = a.x - b.x;
			const dy = a.y - b.y;
			const overlapX = (aSize.width + bSize.width) / 2 - Math.abs(dx);
			const overlapY = (aSize.height + bSize.height) / 2 - Math.abs(dy);
			const horizontal = overlapX < overlapY;
			const sideFor = (x: number, y: number): Side => horizontal
				? (x < 0 ? 'right' : 'left')
				: (y < 0 ? 'floor' : 'ceiling');
			return {
				sideA: sideFor(dx, dy),
				sideB: sideFor(-dx, -dy),
			};
		}

		/** Ask Rapier's contact graph who touches whom, and from which direction. */
		private collectTouches(): Touch[] {
			const touches = new Map<string, Touch>();

			for (const state of this.bodies.values()) {
				// Every contact involves at least one non-fixed body.
				if (state.kind === 'fixed') continue;

				for (const collider of state.colliders) {
					this.world.contactPairsWith(collider, other => {
						const otherBody = other.parent();
						const otherId = otherBody ? this.bodyToId.get(otherBody.handle) : undefined;
						if (otherId === undefined || otherId === state.id) return;

						this.world.contactPair(collider, other, (manifold, flipped) => {
							if (manifold.numContacts() === 0) return;

							// Rapier's normal goes from the manifold's first collider to its
							// second one; flip it so that it points toward this block.
							const normal = manifold.normal();
							const sign = flipped ? 1 : -1;
							this.addTouch(touches, state.id, otherId, sign * normal.x, sign * normal.y);
						});
					});
				}
			}
			return Array.from(touches.values());
		}

		private addTouch(
			touches: Map<string, Touch>,
			selfId: BlockId,
			otherId: BlockId,
			nx: number,
			ny: number,
		): void {
			// (nx, ny) points from other toward self. Store pairs as a < b with the
			// normal pointing toward a, so both bodies of a pair give the same entry.
			const swap = selfId > otherId;
			const aId = swap ? otherId : selfId;
			const bId = swap ? selfId : otherId;
			const ax = swap ? -nx : nx;
			const ay = swap ? -ny : ny;

			const sideA = classifySide(ax, ay, this.toleranceOf(aId));
			const sideB = classifySide(-ax, -ay, this.toleranceOf(bId));
			const key = `${aId}:${bId}:${sideA}:${sideB}`;
			if (touches.has(key)) return;

			touches.set(key, {
				aId, bId, nx: ax, ny: ay, sideA, sideB,
				solid: !this.passthrough.has(pairKey(aId, bId)),
			});
		}

		private toleranceOf(id: BlockId): number {
			return this.entries.get(id)?.block.getWalker()?.getVerticalTolerancy()
				?? DEFAULT_VERTICAL_TOLERANCE;
		}

		/** A solid contact: record it on the walker and stop the motion pushing into it. */
		private react(
			selfId: BlockId,
			otherId: BlockId,
			side: Side,
			nx: number,
			ny: number,
		): void {
			const block = this.entries.get(selfId)?.block;
			if (!block) return;

			const walker = block.getWalker();
			if (walker && walker.getContact(side) === null) walker.setContact(side, otherId);

			// Velocity controlled by the block itself is never altered by collisions.
			if (block.getForcedVelocity()) return;

			const velocity = block.getVelocity();
			if (velocity) {
				[velocity.x, velocity.y] = removeBlockedComponent(velocity.x, velocity.y, nx, ny);
			}
			for (const effect of block.getVelocityEffects()?.getEffects() ?? []) {
				[effect.vx, effect.vy] = removeBlockedComponent(effect.vx, effect.vy, nx, ny);
			}
		}

		/**
		 * A walker is carried by what it stands on (or leans against). When it
		 * loses its carrier it keeps the carrier's speed as an effect.
		 */
		private updateCarriers(): void {
			for (const state of this.bodies.values()) {
				const block = this.entries.get(state.id)?.block;
				const walker = block?.getWalker();
				if (!block || !walker) continue;

				const carrierId = walker.getContact('floor')
					?? walker.getContact('climbing')
					?? walker.getContact('left')
					?? walker.getContact('right');

				if (
					walker.carrierId !== null && carrierId === null
					&& block.getVelocity() && !block.getForcedVelocity()
				) {
					block.getVelocityEffects()?.append(
						state.carrierVx,
						state.carrierVy,
						EffectId.ADDITIONNAL_SPEED,
					);
				}
				walker.carrierId = carrierId;
			}
		}

		private assertNotDisposed(): void {
			if (this.disposed) throw new Error('PlatformerEngine has been disposed.');
		}
	}

	let rapierReady: Promise<void> | null = null;

	export async function createPlatformerEngine<TEngineData extends EngineData>(
		isClient: boolean,
		storage: TEngineData['Storage'],
		game: TEngineData['Game'],
		gravity: Point = { x: 0, y: 0 },
	): Promise<PlatformerEngine<TEngineData>> {
		// Rapier's WASM module is loaded once, then shared by every engine.
		if (!rapierReady) rapierReady = RAPIER.init();
		await rapierReady;
		return new PlatformerEngine(isClient, storage, game, gravity);
	}

}
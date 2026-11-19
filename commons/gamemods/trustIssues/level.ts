import {
	BRANCH_LENGTH_MAX,
	BRANCH_LENGTH_MIN,
	BRANCHES_PER_PATH,
	FALL_DEPTH,
	GAP_MAX,
	GAP_MIN,
	LINK_GAP,
	LINK_UP,
	MAX_GENERATION_ATTEMPTS,
	MAX_PATH_STEPS,
	MAX_ROUTE_HOPS,
	PLACEMENT_TRIES,
	PLATFORM_SIZE_MAX,
	PLATFORM_SIZE_MIN,
	PLATFORM_THICKNESS,
	SEPARATION,
	SEPARATION_HEIGHT,
	SUB_BRANCH_CHANCE,
	TREE_NEIGHBORHOOD,
	SPAWN_SIZE,
	STEP_DOWN_MAX,
	STEP_UP_MAX,
	ZONE_COUNT,
	ZONE_DISTANCE_MAX,
	ZONE_DISTANCE_MIN,
	ZONE_HEIGHT_MAX,
	ZONE_HEIGHT_MIN,
	ZONE_SIZE,
} from "./constants";

/* -------------------------------------------------------------------------- */
/* Level: a visible spawn in the middle, three visible goal zones around it,  */
/* and invisible platforms linking them.                                      */
/*                                                                            */
/* The level only depends on a seed (sent once in the start data), so it is   */
/* never part of the shared state: the server and every client rebuild the    */
/* exact same level from the seed.                                            */
/*                                                                            */
/* Each zone is reached by a winding path (detours on purpose: the straight   */
/* line is never the way), and dead-end branches grow from every path.        */
/* Unlinked platforms are always too far from each other to jump between      */
/* them, so the only ways are the generated ones.                             */
/* -------------------------------------------------------------------------- */

export type PlatformKind = 'spawn' | 'zone' | 'hidden';

/** An axis-aligned box. (x, z) is the center on the ground plane, `top` the altitude of its upper face. */
export interface Platform {
	id: number;
	kind: PlatformKind;
	/** Index of the zone (0, 1 or 2) for a zone, -1 otherwise. */
	zone: number;
	x: number;
	z: number;
	top: number;
	/** Size along x */
	w: number;
	/** Size along z */
	d: number;
	/** Thickness (along y) */
	h: number;
}

export interface Level {
	seed: number;
	platforms: Platform[];
	spawn: Platform;
	zones: Platform[];
	/** links[i] = ids of the platforms reachable by a jump from platform i (used by the bots). */
	links: number[][];
	/** Players falling under this altitude respawn. */
	killY: number;
}


/* ---------------------------- Random ---------------------------- */

/** Small deterministic random generator (mulberry32): same seed, same level everywhere. */
export function createRng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type Rng = () => number;

/** Random float in [min, max). */
function range(rng: Rng, min: number, max: number) {
	return min + rng() * (max - min);
}


/* ---------------------------- Geometry ---------------------------- */

/** Horizontal edge-to-edge distance between two platforms (0 when their footprints overlap). */
export function gapXZ(a: Platform, b: Platform) {
	const gx = Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2);
	const gz = Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2);
	return Math.hypot(gx, gz);
}

/** Horizontal distance from a point to the footprint of a platform (0 inside). */
export function pointGapXZ(p: Platform, x: number, z: number) {
	const gx = Math.max(0, Math.abs(x - p.x) - p.w / 2);
	const gz = Math.max(0, Math.abs(z - p.z) - p.d / 2);
	return Math.hypot(gx, gz);
}

/** 3D distance from a point to a platform box (0 inside). Used to know what an explosion paints. */
export function pointBoxDistance(p: Platform, x: number, y: number, z: number) {
	const gx = Math.max(0, Math.abs(x - p.x) - p.w / 2);
	const gz = Math.max(0, Math.abs(z - p.z) - p.d / 2);
	const cy = p.top - p.h / 2;
	const gy = Math.max(0, Math.abs(y - cy) - p.h / 2);
	return Math.hypot(gx, gy, gz);
}

/** True when the point (x, z) is above the footprint of the platform. */
export function isAbove(p: Platform, x: number, z: number, margin = 0) {
	return Math.abs(x - p.x) <= p.w / 2 + margin && Math.abs(z - p.z) <= p.d / 2 + margin;
}


/* ---------------------------- Generation ---------------------------- */

/**
 * Builds the platforms one by one. Keeps the list of everything already placed,
 * so every new platform can be checked against all the others.
 */
class LevelBuilder {
	readonly platforms: Platform[] = [];
	readonly spawn: Platform;
	readonly zones: Platform[] = [];
	/** Generation tree: tree[i] = platforms placed from platform i, or that platform i was placed from. */
	private readonly tree: number[][] = [];

	constructor(private readonly rng: Rng) {
		this.spawn = this.add('spawn', -1, 0, 0, 0, SPAWN_SIZE, SPAWN_SIZE, 1);
		this.placeZones();
	}

	/** Append a platform to the level. */
	private add(kind: PlatformKind, zone: number, x: number, z: number, top: number, w: number, d: number, h: number) {
		const p: Platform = { id: this.platforms.length, kind, zone, x, z, top, w, d, h };
		this.platforms.push(p);
		this.tree.push([]);
		return p;
	}

	/**
	 * Platforms at most TREE_NEIGHBORHOOD steps from `from` in the generation tree.
	 * A new platform may be within jumping range of them: it only creates a small
	 * local loop, never a real shortcut.
	 */
	private treeNeighborhood(from: Platform) {
		const depth = new Map<number, number>([[from.id, 0]]);
		const queue = [from.id];
		for (let head = 0; head < queue.length; head++) {
			const a = queue[head];
			if (depth.get(a)! >= TREE_NEIGHBORHOOD)
				continue;
			for (const b of this.tree[a]) {
				if (!depth.has(b)) {
					depth.set(b, depth.get(a)! + 1);
					queue.push(b);
				}
			}
		}
		return new Set(depth.keys());
	}

	/** ZONE_COUNT zones evenly spread around the spawn, at various altitudes. */
	private placeZones() {
		const start = this.rng() * Math.PI * 2;
		for (let i = 0; i < ZONE_COUNT; i++) {
			const angle = start + i * Math.PI * 2 / ZONE_COUNT + range(this.rng, -0.25, 0.25);
			const dist = range(this.rng, ZONE_DISTANCE_MIN, ZONE_DISTANCE_MAX);
			const top = range(this.rng, ZONE_HEIGHT_MIN, ZONE_HEIGHT_MAX);
			this.zones.push(this.add('zone', i, Math.cos(angle) * dist, Math.sin(angle) * dist, top, ZONE_SIZE, ZONE_SIZE, 1));
		}
	}

	/**
	 * A new platform next to `from`, in the direction `heading`, `dy` higher,
	 * with a random size and a random (jumpable) gap. The center distance is
	 * found by dichotomy so that the edge-to-edge gap is exactly the chosen one.
	 */
	private candidate(from: Platform, heading: number, dy: number): Platform {
		const w = range(this.rng, PLATFORM_SIZE_MIN, PLATFORM_SIZE_MAX);
		const d = range(this.rng, PLATFORM_SIZE_MIN, PLATFORM_SIZE_MAX);
		const gap = range(this.rng, GAP_MIN, GAP_MAX);
		const ux = Math.cos(heading);
		const uz = Math.sin(heading);
		const p: Platform = {
			id: -1, kind: 'hidden', zone: -1,
			x: from.x, z: from.z, top: from.top + dy,
			w, d, h: PLATFORM_THICKNESS,
		};

		let lo = 0;
		let hi = 40;
		for (let i = 0; i < 24; i++) {
			const mid = (lo + hi) / 2;
			p.x = from.x + ux * mid;
			p.z = from.z + uz * mid;
			if (gapXZ(from, p) < gap)
				lo = mid;
			else
				hi = mid;
		}
		p.x = from.x + ux * hi;
		p.z = from.z + uz * hi;
		return p;
	}

	/**
	 * A candidate is valid when it is jumpable from `from` and its close
	 * neighbors in the generation tree only: every other platform stays out of
	 * jumping range (SEPARATION). `goal` (the zone the path goes to) and the
	 * close neighbors only have to not overlap it.
	 */
	private isValid(p: Platform, from: Platform, goal: Platform | null, near: Set<number>) {
		for (const other of this.platforms) {
			const gap = gapXZ(p, other);
			if (other === goal || near.has(other.id)) {
				if (gap < GAP_MIN * 0.9)
					return false;
				continue;
			}
			if (gap < SEPARATION && Math.abs(other.top - p.top) < SEPARATION_HEIGHT)
				return false;
		}
		return true;
	}

	/** True when the candidate does not overlap (nor touch) any platform but `from`. */
	private isFree(p: Platform, from: Platform) {
		return this.platforms.every(other => other === from
			|| gapXZ(p, other) >= GAP_MIN * 0.9
			|| Math.abs(other.top - p.top) > 3);
	}

	/** Can the zone be reached by a jump from this platform? */
	private reaches(from: Platform, goal: Platform) {
		const dy = goal.top - from.top;
		return gapXZ(from, goal) <= GAP_MAX && dy <= STEP_UP_MAX && dy >= -STEP_DOWN_MAX;
	}

	/**
	 * Height change of the next step: spreads the height difference with the goal
	 * over the remaining steps, plus some noise.
	 */
	private stepHeight(from: Platform, goal: Platform) {
		const remaining = gapXZ(from, goal);
		const steps = Math.max(1, remaining / 4.5);
		const wanted = (goal.top - from.top) / steps + range(this.rng, -0.6, 0.6);
		return Math.max(-STEP_DOWN_MAX, Math.min(STEP_UP_MAX, wanted));
	}

	/** Place a valid platform after `from`, heading around `base`. Returns null when every try failed. */
	private tryPlace(from: Platform, base: number, goal: Platform | null, dy: number, spread: number) {
		const near = this.treeNeighborhood(from);
		for (let t = 0; t < PLACEMENT_TRIES; t++) {
			// The first tries stay close to the wanted heading, the next ones look around
			const width = t < PLACEMENT_TRIES / 2 ? spread : Math.PI * 1.4;
			const heading = base + range(this.rng, -width / 2, width / 2);
			const p = this.candidate(from, heading, dy);
			if (this.isValid(p, from, goal, near))
				return p;
		}
		return null;
	}

	/** Register a candidate (placed from `from`) as a real platform of the level. */
	private commit(p: Platform, from: Platform) {
		const added = this.add(p.kind, p.zone, p.x, p.z, p.top, p.w, p.d, p.h);
		this.tree[from.id].push(added.id);
		this.tree[added.id].push(from.id);
		return added;
	}

	/**
	 * Build the path from the spawn to a zone. It does not head straight to it:
	 * now and then it takes a detour (several steps turned by a large angle).
	 * Returns the platforms of the path, in order.
	 */
	buildPath(goal: Platform) {
		const path: Platform[] = [];
		let cur = this.spawn;
		let detourLeft = 0;
		let detourAngle = 0;

		for (let step = 0; step < MAX_PATH_STEPS && !(path.length > 0 && this.reaches(cur, goal)); step++) {
			const toGoal = Math.atan2(goal.z - cur.z, goal.x - cur.x);

			// Start a detour now and then (never on the first step, the spawn is wide)
			if (detourLeft <= 0 && step > 0 && this.rng() < 0.32) {
				detourLeft = 2 + Math.floor(this.rng() * 3);
				detourAngle = (this.rng() < 0.5 ? -1 : 1) * range(this.rng, 0.8, 1.55);
			}
			const base = toGoal + (detourLeft > 0 ? detourAngle : step === 0 ? range(this.rng, -0.9, 0.9) : 0);
			detourLeft--;

			const next = this.tryPlace(cur, base, goal, this.stepHeight(cur, goal), 0.8);
			if (!next)
				break; // stuck: the straight fallback below finishes the path
			cur = this.commit(next, cur);
			path.push(cur);
		}

		// Fallback (rare): finish with a straight staircase, ignoring the separation
		// rule (but never overlapping another platform)
		let guard = 0;
		while ((path.length === 0 || !this.reaches(cur, goal)) && guard++ < 40) {
			const toGoal = Math.atan2(goal.z - cur.z, goal.x - cur.x);
			let next = this.candidate(cur, toGoal, this.stepHeight(cur, goal));
			for (let t = 0; t < PLACEMENT_TRIES && !this.isFree(next, cur); t++)
				next = this.candidate(cur, toGoal + range(this.rng, -1.2, 1.2), this.stepHeight(cur, goal));
			cur = this.commit(next, cur);
			path.push(cur);
		}

		return path;
	}

	/**
	 * Grow dead ends from a path. A branch starts either from the path (never
	 * from its last platforms, a branch must not touch the zone) or from an
	 * earlier branch, so dead ends fork too.
	 */
	buildBranches(path: Platform[]) {
		if (path.length < 3)
			return;

		const roots = path.slice(0, path.length - 2);
		const branchPlatforms: Platform[] = [];

		for (let b = 0; b < BRANCHES_PER_PATH; b++) {
			const fromBranch = branchPlatforms.length > 0 && this.rng() < SUB_BRANCH_CHANCE;
			const pool = fromBranch ? branchPlatforms : roots;
			let cur = pool[Math.floor(this.rng() * pool.length)];
			const length = BRANCH_LENGTH_MIN + Math.floor(this.rng() * (BRANCH_LENGTH_MAX - BRANCH_LENGTH_MIN + 1));
			let heading = this.rng() * Math.PI * 2;

			for (let i = 0; i < length; i++) {
				heading += range(this.rng, -0.7, 0.7);
				const dy = range(this.rng, -STEP_DOWN_MAX, STEP_UP_MAX);
				const next = this.tryPlace(cur, heading, null, dy, 1.2);
				if (!next)
					break;
				cur = this.commit(next, cur);
				branchPlatforms.push(cur);
			}
		}
	}
}


/** Reachability graph: which platform can be reached by a jump from which one. */
function computeLinks(platforms: Platform[]) {
	return platforms.map(a => platforms
		.filter(b => b !== a && gapXZ(a, b) <= LINK_GAP && b.top - a.top <= LINK_UP)
		.map(b => b.id)
	);
}


/** Number of jumps of the shortest way from the spawn to each zone (Infinity when unreachable). */
function routeLengths(platforms: Platform[], links: number[][], spawn: Platform, zones: Platform[]) {
	const depth = new Map<number, number>([[spawn.id, 0]]);
	const queue = [spawn.id];
	for (let head = 0; head < queue.length; head++) {
		for (const b of links[queue[head]]) {
			if (!depth.has(b)) {
				depth.set(b, depth.get(queue[head])! + 1);
				queue.push(b);
			}
		}
	}
	return zones.map(z => depth.get(z.id) ?? Infinity);
}

/**
 * Generate the whole level from a seed. A level where a way is too long (the
 * path wandered far away around the other ones) is generated again from a
 * derived seed, so the result still only depends on the seed.
 */
export function generateLevel(seed: number): Level {
	let level = buildLevel(seed, seed);
	for (let attempt = 1; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
		const lengths = routeLengths(level.platforms, level.links, level.spawn, level.zones);
		if (lengths.every(n => n <= MAX_ROUTE_HOPS))
			break;
		level = buildLevel(seed, (seed + attempt * 0x9E3779B1) >>> 0);
	}
	return level;
}

/** One generation attempt. `seed` is kept in the level (decor), `rngSeed` drives the platforms. */
function buildLevel(seed: number, rngSeed: number): Level {
	const rng = createRng(rngSeed);
	const builder = new LevelBuilder(rng);

	const paths = builder.zones.map(zone => builder.buildPath(zone));
	for (const path of paths)
		builder.buildBranches(path);

	const platforms = builder.platforms;
	const lowest = Math.min(...platforms.map(p => p.top - p.h));

	return {
		seed,
		platforms,
		spawn: builder.spawn,
		zones: builder.zones,
		links: computeLinks(platforms),
		killY: lowest - FALL_DEPTH,
	};
}

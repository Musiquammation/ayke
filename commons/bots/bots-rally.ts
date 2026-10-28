import { Fields } from "../../commons/Fields";
import { botActionNodeHelper, describeBot } from "../Bot";
import { GMRally } from "../gamemods/GMRally";

const { all, runner } = botActionNodeHelper<GMRally, Data>();

/** GMRally only consumes `jump` and `item`; horizontal running is automatic. */
const INPUTS = {
    jump: { action: "jump", jump: {} },
    item: { action: "item", item: {} },
} satisfies Record<string, Fields>;

const PLAYER_W = 48;
const PLAYER_H = 64;
const RUN_SPEED = 420;
const RUN_ACC = 2400;
const RUN_HARD_DEC = 3000;
const GRAVITY = 1800;
const JUMP_VELOCITY = 820;
const WALL_JUMP_VELOCITY = 760;
const WALL_JUMP_RUN_SPEED = 520;
const WALL_SLIDE_MAX_SPEED = 220;
const WALL_GRAVITY_FACTOR = 0.25;
const WALL_JUMP_BOOST_TIME = 0.35;
const JUMP_BUFFER = 0.12;
const JUMP_COOLDOWN = 0.16;

// Receding-horizon pathfinding. The planner searches a time-expanded graph of
// possible physics states (jump / no-jump), rather than jumping on a timer.
const SIM_DT = 1 / 30;
const SEARCH_STEPS = 66; // 2.2 seconds of predicted movement
const BEAM_WIDTH = 72;
const PLAN_INTERVAL = 0.08;
const CONTACT_EPSILON = 3;

// GMRally item IDs, kept in sync with GMRally.ts.
const ITEM_NONE = 0;
const ITEM_BANANA = 1;
const ITEM_GREEN_SHELL = 2;
const ITEM_RED_SHELL = 3;
const ITEM_BLUE_SHELL = 4;
const ITEM_MUSHROOM = 5;
const ITEM_STAR = 6;
const ITEM_BOMB = 7;

interface BotPlayerState {
    connected: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: number;
    hit: boolean;
    respawn: number;
    finished: boolean;
    lapsCompleted: number;
    checkpoint: number;
    subCheckpoint: number;
    item: number;
    pendingItem: number;
    itemRollTimer: number;
    boostTimer: number;
    starTimer: number;
    wallBoost: number;
}

interface BotPlatform {
    x: number;
    y: number;
    w: number;
    h: number;
    skin?: string;
    mud?: number;
    trampoline?: number;
    move?: { ax: number; ay: number; period: number; phase: number };
}

interface BotCheckpoint {
    x: number;
    y: number;
    w?: number;
    h?: number;
}

interface BotLevel {
    spawnX: number;
    finishX: number;
    deathY: number;
    platforms: BotPlatform[];
    checkpoints: BotCheckpoint[];
}

interface Rect {
    index: number;
    skin?: string;
    mud?: number;
    cx: number;
    cy: number;
    w: number;
    h: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
}

type GoalKind = "wall-top" | "wall-clear" | "platform-exit" | "race-target";

interface NavigationGoal {
    x: number;
    y: number;
    kind: GoalKind;
    platformIndex?: number;
    barrierIndex?: number;
}

interface SimState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: number;
    jumpBuffer: number;
    jumpCooldown: number;
    wallBoost: number;
    boostTimer: number;
    starTimer: number;
    jumpsUsed: number;
    firstJump: boolean;
}

/** Persistent planner state for one bot instance. */
class Data {
    lastJumpAt = -1e9;
    lastItemAt = -1e9;
    lastPlanAt = -1e9;
    lastLevelIndex = -1;
    lastLap = -1;
    lastCheckpoint = -1;
    bestX = -Infinity;
    lastProgressAt = 0;
    /** Keep the selected elevated route until its exit waypoint is reached. */
    routePlatformIndex: number | null = null;
    routeBarrierIndex: number | null = null;
}

function asPlayer(game: GMRally, playerIdx: number): BotPlayerState | undefined {
    return game.players[playerIdx] as unknown as BotPlayerState | undefined;
}

function getRects(level: BotLevel, time: number): Rect[] {
    return level.platforms.map((platform, index) => {
        let x = platform.x;
        let y = platform.y;
        const move = platform.move;

        // GMRally stores platform geometry in world-space center coordinates.
        if (move && Number.isFinite(move.period) && move.period > 0) {
            const angle = (2 * Math.PI * time) / move.period + 2 * Math.PI * move.phase;
            x += move.ax * Math.sin(angle);
            y += move.ay * Math.sin(angle);
        }

        return {
            index,
            skin: platform.skin,
            mud: platform.mud,
            cx: x,
            cy: y,
            w: platform.w,
            h: platform.h,
            left: x - platform.w / 2,
            right: x + platform.w / 2,
            top: y - platform.h / 2,
            bottom: y + platform.h / 2,
        };
    });
}

function horizontalOverlap(x: number, rect: Rect, playerWidth = PLAYER_W): boolean {
    return x + playerWidth / 2 > rect.left + 0.5 && x - playerWidth / 2 < rect.right - 0.5;
}

function overlapsAt(x: number, y: number, rect: Rect): boolean {
    return x + PLAYER_W / 2 > rect.left + 0.5 &&
        x - PLAYER_W / 2 < rect.right - 0.5 &&
        y + PLAYER_H / 2 > rect.top + 0.5 &&
        y - PLAYER_H / 2 < rect.bottom - 0.5;
}

function verticalOverlap(player: Pick<SimState, "x" | "y">, rect: Rect): boolean {
    return player.y + PLAYER_H / 2 > rect.top + 0.5 &&
        player.y - PLAYER_H / 2 < rect.bottom - 0.5;
}

function isGrounded(state: SimState, rects: Rect[]): boolean {
    const feetY = state.y + PLAYER_H / 2;
    if (state.vy < -30) return false;
    return rects.some(rect =>
        horizontalOverlap(state.x, rect) && Math.abs(feetY - rect.top) <= 5
    );
}

function wallInFront(state: SimState, rects: Rect[]): Rect | null {
    const direction = state.facing < 0 ? -1 : 1;
    let best: Rect | null = null;
    let bestGap = Infinity;

    for (const rect of rects) {
        if (!verticalOverlap(state, rect)) continue;
        const gap = direction > 0
            ? rect.left - (state.x + PLAYER_W / 2)
            : (state.x - PLAYER_W / 2) - rect.right;
        if (Math.abs(gap) > CONTACT_EPSILON) continue;
        if (Math.abs(gap) < bestGap) {
            best = rect;
            bestGap = Math.abs(gap);
        }
    }
    return best;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function findGroundTop(rects: Rect[]): number {
    const ground = rects.find(rect => rect.skin === "grass" && rect.w > 1000);
    if (ground) return ground.top;
    return rects.reduce((lowestTop, rect) => Math.min(lowestTop, rect.top), Infinity);
}

/**
 * A route barrier is a solid platform that intrudes into the standing space on
 * the ground lane. Small gaps below hanging platforms remain passable; notably,
 * the narrow checkpoint-side passage in Rally is not misclassified as a wall.
 */
function getRouteBarriers(rects: Rect[], groundTop: number, maxX: number): Rect[] {
    return rects.filter(rect =>
        rect.skin !== "grass" &&
        rect.skin !== "mud" &&
        rect.left < maxX &&
        rect.top < groundTop - 1 &&
        rect.bottom > groundTop - PLAYER_H + 4
    ).sort((a, b) => a.left - b.left);
}

function findElevatedRoutePlatform(barrier: Rect, rects: Rect[]): Rect | null {
    // Wide, thin platforms are candidate traversal surfaces; tall narrow blocks
    // are walls and are used by the physics search, not treated as destinations.
    const candidates = rects.filter(rect =>
        rect.w >= 220 &&
        rect.w >= rect.h * 3 &&
        rect.top < barrier.top - 100 &&
        rect.right > barrier.left &&
        rect.left < barrier.right + 360
    );
    if (!candidates.length) return null;

    // Prefer the nearest usable elevated platform, with a modest penalty for a
    // platform that begins far beyond the barrier.
    candidates.sort((a, b) => {
        const score = (p: Rect) =>
            Math.max(0, p.left - barrier.right) * 0.7 + Math.max(0, barrier.left - p.right) * 2 +
            Math.abs((barrier.top - p.top) - 500) * 0.08;
        return score(a) - score(b);
    });
    return candidates[0];
}

function platformExitGoal(platform: Rect): NavigationGoal {
    return {
        x: platform.right - PLAYER_W / 2 - 8,
        y: platform.top - PLAYER_H / 2,
        kind: "platform-exit",
        platformIndex: platform.index,
    };
}

/**
 * Hierarchical path planning:
 *  1. Find the next ground-lane barrier before the next checkpoint.
 *  2. Reach its top, or use an elevated traversable platform if the geometry
 *     provides one (the mud bypass and the final overhead route).
 *  3. Follow that platform to its exit, then return to the race checkpoint/finish.
 *
 * The route is derived from the actual level rectangles, not hard-coded x values.
 */
function getNavigationGoal(
    game: GMRally,
    player: BotPlayerState,
    level: BotLevel,
    rects: Rect[],
    data: Data,
): NavigationGoal {
    const groundTop = findGroundTop(rects);
    const groundY = groundTop - PLAYER_H / 2;
    const checkpoints = level.checkpoints ?? [];
    const nextCheckpointIndex = player.checkpoint + 1;
    const checkpointPending = nextCheckpointIndex >= 0 && nextCheckpointIndex < checkpoints.length;
    const raceTargetX = checkpointPending ? checkpoints[nextCheckpointIndex].x : level.finishX;

    if (data.lastCheckpoint !== player.checkpoint) {
        data.lastCheckpoint = player.checkpoint;
        data.routePlatformIndex = null;
        data.routeBarrierIndex = null;
    }

    // Once selected, an elevated route remains the active waypoint until the bot
    // reaches its far traversal edge at approximately the correct height.
    if (data.routePlatformIndex !== null) {
        const platform = rects.find(rect => rect.index === data.routePlatformIndex);
        if (platform) {
            const exitX = platform.right - PLAYER_W / 2 - 8;
            const atExit = player.x >= exitX - 14 &&
                player.y + PLAYER_H / 2 <= platform.top + 24;
            if (!atExit) return platformExitGoal(platform);
        }
        data.routePlatformIndex = null;
        data.routeBarrierIndex = null;
    }

    const barriers = getRouteBarriers(rects, groundTop, raceTargetX + PLAYER_W);
    const nextBarrier = barriers.find(rect => rect.right + PLAYER_W / 2 >= player.x - 1);

    if (nextBarrier) {
        const elevated = findElevatedRoutePlatform(nextBarrier, rects);
        if (elevated) {
            const overlapsBarrierX = elevated.left < nextBarrier.right && elevated.right > nextBarrier.left;
            if (overlapsBarrierX) {
                // The platform passes above the wall: climb the shaft and traverse it.
                data.routePlatformIndex = elevated.index;
                data.routeBarrierIndex = nextBarrier.index;
                return platformExitGoal(elevated);
            }

            // A platform beyond the barrier is a second-stage waypoint. First get
            // high enough to clear the wall, then keep climbing toward that surface.
            const feetY = player.y + PLAYER_H / 2;
            if (feetY > nextBarrier.top + 8 && player.x <= nextBarrier.right + PLAYER_W / 2 + 10) {
                return {
                    x: clamp(nextBarrier.cx, nextBarrier.left - PLAYER_W / 2, nextBarrier.right + PLAYER_W / 2),
                    y: nextBarrier.top - PLAYER_H / 2,
                    kind: "wall-top",
                    barrierIndex: nextBarrier.index,
                };
            }
            data.routePlatformIndex = elevated.index;
            data.routeBarrierIndex = nextBarrier.index;
            return platformExitGoal(elevated);
        }

        const feetY = player.y + PLAYER_H / 2;
        if (feetY > nextBarrier.top + 8) {
            return {
                x: nextBarrier.cx,
                y: nextBarrier.top - PLAYER_H / 2,
                kind: "wall-top",
                barrierIndex: nextBarrier.index,
            };
        }
        return {
            x: nextBarrier.right + PLAYER_W / 2 + 18,
            y: nextBarrier.top - PLAYER_H / 2,
            kind: "wall-clear",
            barrierIndex: nextBarrier.index,
        };
    }

    // No wall blocks the current race objective: align with the next checkpoint
    // at running height, or return to the ground lane before the finish line.
    return {
        x: raceTargetX,
        y: groundY,
        kind: "race-target",
    };
}

function targetDistance(state: SimState, goal: NavigationGoal): number {
    const dx = (state.x - goal.x) * 0.72;
    const dy = (state.y - goal.y) * 0.9;
    return Math.hypot(dx, dy);
}

/** Score a simulated state by goal distance, progress, safety, and jump economy. */
function scoreState(
    state: SimState,
    initial: SimState,
    goal: NavigationGoal,
    level: BotLevel,
    rects: Rect[],
): number {
    let score = -targetDistance(state, goal) / 100;

    // Reward actual forward progress, but not enough to make running into a wall
    // look better than climbing it.
    score += (state.x - initial.x) * 0.0015;
    score -= state.jumpsUsed * 0.075;

    if (state.y > level.deathY - 24) score -= 35 + (state.y - level.deathY + 24) / 12;
    if (state.x < -100) score -= 8 + Math.abs(state.x) / 50;

    // Reward landing on the intended platform, rather than merely passing its x.
    if (goal.kind === "platform-exit" && goal.platformIndex !== undefined) {
        const platform = rects.find(rect => rect.index === goal.platformIndex);
        if (platform) {
            const feet = state.y + PLAYER_H / 2;
            if (Math.abs(feet - platform.top) <= 8 && horizontalOverlap(state.x, platform)) {
                score += 1.4;
            }
        }
    }

    if (goal.kind === "wall-top" && goal.barrierIndex !== undefined) {
        const barrier = rects.find(rect => rect.index === goal.barrierIndex);
        if (barrier && state.y + PLAYER_H / 2 <= barrier.top + 8) score += 0.8;
    }

    // Avoid trajectories that are already inside solid geometry due to model error.
    if (rects.some(rect => overlapsAt(state.x, state.y, rect))) score -= 2.5;
    return score;
}

function approach(current: number, target: number, maxDelta: number): number {
    return current < target
        ? Math.min(target, current + maxDelta)
        : Math.max(target, current - maxDelta);
}

/**
 * Jumping while grounded against the wrong face of a wall makes Rally reverse
 * and launch away from the route. Permit that input only when the post-bounce
 * direction is useful, or when an opposing wall is close enough to form a
 * wall-jump shaft (for example the x5/x8 and x33/x35 pairs in the level).
 */
function canPressJumpAt(state: SimState, goal: NavigationGoal, rects: Rect[]): boolean {
    const wall = wallInFront(state, rects);
    if (!wall) return true;

    const grounded = isGrounded(state, rects);
    const directionToGoal = Math.sign(goal.x - state.x);
    const directionAfterBounce = -state.facing;

    if (grounded) return directionToGoal === directionAfterBounce;
    if (directionToGoal === directionAfterBounce) return true;

    return rects.some(other => {
        if (other.index === wall.index || other.w > PLAYER_W * 2 || other.h < 200) return false;
        const gap = directionAfterBounce < 0
            ? wall.left - other.right
            : other.left - wall.right;
        // Contact-center distance between the two walls is the clear gap minus
        // the player width. Keep the bound generous enough for Rally wall boosts.
        const contactDistance = gap - PLAYER_W;
        return gap >= PLAYER_W && contactDistance <= 430 && contactDistance >= 0;
    });
}

/** Approximate one authoritative Rally physics step for look-ahead planning. */
function simulateStep(
    source: SimState,
    pressJump: boolean,
    goal: NavigationGoal,
    rects: Rect[],
    level: BotLevel,
    isFirstStep: boolean,
): SimState {
    const s: SimState = { ...source };
    const dt = SIM_DT;

    s.jumpCooldown = Math.max(0, s.jumpCooldown - dt);
    s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
    s.wallBoost = Math.max(0, s.wallBoost - dt);
    s.boostTimer = Math.max(0, s.boostTimer - dt);
    s.starTimer = Math.max(0, s.starTimer - dt);

    // Input is an event: it refreshes Rally's short jump buffer, not a held key.
    if (pressJump && s.jumpCooldown <= 0) {
        s.jumpBuffer = JUMP_BUFFER;
        s.jumpCooldown = JUMP_COOLDOWN;
        s.jumpsUsed++;
    }
    if (isFirstStep) s.firstJump = pressJump;

    // Rally applies gravity before its player-control hook.
    s.vy += GRAVITY * dt;
    const grounded = isGrounded(s, rects);
    const wall = wallInFront(s, rects);
    const pushingWall = wall !== null;

    if (pushingWall && grounded) {
        // Rally reverses facing when running into a wall from the floor.
        s.facing = -s.facing;
    } else if (pushingWall && !grounded) {
        // Wall slide: only one quarter of gravity remains while descending.
        if (s.vy > 0) {
            s.vy -= GRAVITY * (1 - WALL_GRAVITY_FACTOR) * dt;
            s.vy = Math.min(s.vy, WALL_SLIDE_MAX_SPEED);
        }
        if (s.jumpBuffer > 0) {
            s.facing = -s.facing;
            s.wallBoost = WALL_JUMP_BOOST_TIME;
            s.vy = -WALL_JUMP_VELOCITY;
            s.jumpBuffer = 0;
        }
    } else if (grounded && s.jumpBuffer > 0) {
        s.vy = -JUMP_VELOCITY;
        s.jumpBuffer = 0;
    }

    let targetSpeed = s.wallBoost > 0 ? WALL_JUMP_RUN_SPEED : RUN_SPEED;
    if (s.boostTimer > 0 || s.starTimer > 0) targetSpeed *= 1.6;

    // Rally terrain mud limits horizontal speed while standing on its top.
    const onMud = rects.some(rect =>
        rect.skin === "mud" &&
        horizontalOverlap(s.x, rect) &&
        Math.abs((s.y + PLAYER_H / 2) - rect.top) <= 8
    );
    if (onMud && s.boostTimer <= 0 && s.starTimer <= 0) {
        const mud = rects.find(rect => rect.skin === "mud" && horizontalOverlap(s.x, rect));
        if (mud) targetSpeed = Math.min(targetSpeed, mud.mud !== undefined && mud.mud >= 0 ? mud.mud : 40);
    }

    const targetVx = (s.facing < 0 ? -1 : 1) * targetSpeed;
    const reversing = s.vx !== 0 && Math.sign(s.vx) !== Math.sign(targetVx);
    s.vx = approach(s.vx, targetVx, (reversing ? RUN_HARD_DEC : RUN_ACC) * dt);

    // Resolve horizontal motion first, as the platformer does for axis-separated
    // block collision. A wall leaves the player flush against its side.
    const oldX = s.x;
    let nextX = s.x + s.vx * dt;
    for (const rect of rects) {
        if (!overlapsAt(nextX, s.y, rect)) continue;
        if (nextX > oldX) nextX = rect.left - PLAYER_W / 2;
        else if (nextX < oldX) nextX = rect.right + PLAYER_W / 2;
        s.vx = 0;
    }
    s.x = nextX;

    // Resolve vertical motion, snapping to platform tops/bottoms on contact.
    const oldY = s.y;
    let nextY = s.y + s.vy * dt;
    for (const rect of rects) {
        if (!horizontalOverlap(s.x, rect)) continue;
        const oldBottom = oldY + PLAYER_H / 2;
        const nextBottom = nextY + PLAYER_H / 2;
        const oldTop = oldY - PLAYER_H / 2;
        const nextTop = nextY - PLAYER_H / 2;

        if (s.vy >= 0 && oldBottom <= rect.top + 2 && nextBottom >= rect.top) {
            nextY = rect.top - PLAYER_H / 2;
            s.vy = 0;
        } else if (s.vy < 0 && oldTop >= rect.bottom - 2 && nextTop <= rect.bottom) {
            nextY = rect.bottom + PLAYER_H / 2;
            s.vy = 0;
        } else if (overlapsAt(s.x, nextY, rect)) {
            nextY = s.vy >= 0 ? rect.top - PLAYER_H / 2 : rect.bottom + PLAYER_H / 2;
            s.vy = 0;
        }
    }
    s.y = nextY;
    return s;
}

function stateKey(state: SimState): string {
    // Coarse quantization prevents near-identical trajectories from filling the beam.
    return [
        Math.round(state.x / 36),
        Math.round(state.y / 36),
        Math.round(state.vy / 150),
        Math.sign(state.vx),
        state.facing,
        state.wallBoost > 0 ? 1 : 0,
        state.firstJump ? 1 : 0,
    ].join(":");
}

/**
 * Beam-search pathfinding through simulated movement states. It returns only the
 * first action; the next bot tick replans from the real authoritative state.
 */
function planFirstJump(
    player: BotPlayerState,
    goal: NavigationGoal,
    data: Data,
    now: number,
    level: BotLevel,
    rects: Rect[],
): boolean {
    const initial: SimState = {
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        facing: player.facing < 0 ? -1 : 1,
        jumpBuffer: 0,
        jumpCooldown: Math.max(0, JUMP_COOLDOWN - (now - data.lastJumpAt)),
        wallBoost: player.wallBoost ?? 0,
        boostTimer: player.boostTimer ?? 0,
        starTimer: player.starTimer ?? 0,
        jumpsUsed: 0,
        firstJump: false,
    };

    // Already at this waypoint: let the authoritative simulation complete the
    // contact/checkpoint transition instead of issuing another speculative jump.
    if (targetDistance(initial, goal) <= 58) return false;

    let beam: SimState[] = [initial];

    for (let step = 0; step < SEARCH_STEPS; step++) {
        const deduplicated = new Map<string, { state: SimState; score: number }>();
        const reached: Array<{ state: SimState; score: number }> = [];

        for (const state of beam) {
            // No-input continuation is always legal. A jump branch is available
            // only after the bot's cooldown, matching its event-based jump policy.
            const actions = state.jumpCooldown <= 0 && canPressJumpAt(state, goal, rects)
                ? [false, true]
                : [false];
            for (const action of actions) {
                const next = simulateStep(state, action, goal, rects, level, step === 0);
                if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) continue;
                if (next.y > level.deathY + 180 || next.x < -220) continue;

                const score = scoreState(next, initial, goal, level, rects);
                const distance = targetDistance(next, goal);
                if (distance <= 72) {
                    reached.push({ state: next, score });
                    continue;
                }

                const key = stateKey(next);
                const previous = deduplicated.get(key);
                if (!previous || score > previous.score) deduplicated.set(key, { state: next, score });
            }
        }

        // Stop at the first depth that reaches the waypoint. Shorter paths avoid
        // overshooting a platform before the next real-state replan can take over.
        if (reached.length) {
            reached.sort((a, b) =>
                a.state.jumpsUsed - b.state.jumpsUsed || b.score - a.score
            );
            return reached[0].state.firstJump;
        }

        beam = [...deduplicated.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, BEAM_WIDTH)
            .map(entry => entry.state);
        if (!beam.length) break;
    }

    // If the waypoint is not reachable within the current horizon, follow the
    // best simulated trajectory and replan from the real state on the next tick.
    const finalists = beam.map(state => ({
        state,
        score: scoreState(state, initial, goal, level, rects),
    })).sort((a, b) => b.score - a.score);
    return finalists[0]?.state.firstJump ?? false;
}

function shouldUseItem(game: GMRally, player: BotPlayerState, playerIdx: number): boolean {
    if (
        player.item === ITEM_NONE ||
        player.pendingItem !== ITEM_NONE ||
        player.itemRollTimer > 0 ||
        player.hit ||
        player.respawn > 0 ||
        player.finished
    ) return false;

    if (player.item === ITEM_MUSHROOM || player.item === ITEM_STAR) return true;

    const opponents = game.players
        .map((candidate, index) => ({ candidate: candidate as unknown as BotPlayerState, index }))
        .filter(({ candidate, index }) =>
            index !== playerIdx && candidate.connected && !candidate.finished && candidate.respawn <= 0
        );
    if (opponents.length === 0) return false;

    if (player.item === ITEM_BLUE_SHELL) {
        const leader = game.getRaceRanking()[0];
        const leaderState = leader === undefined
            ? undefined
            : game.players[leader] as unknown as BotPlayerState | undefined;
        return leader !== undefined && leader !== playerIdx && !!leaderState && !leaderState.finished;
    }

    const forwardOpponents = opponents
        .map(({ candidate }) => ({
            candidate,
            distance: (candidate.x - player.x) * (player.facing < 0 ? -1 : 1),
        }))
        .filter(({ distance }) => distance > 0);

    switch (player.item) {
        case ITEM_RED_SHELL:
            return player.facing > 0 || forwardOpponents.some(({ distance }) => distance < 1_100);
        case ITEM_GREEN_SHELL:
            return forwardOpponents.some(({ distance }) => distance < 1_300);
        case ITEM_BANANA:
            return forwardOpponents.some(({ distance }) => distance < 520);
        case ITEM_BOMB:
            return forwardOpponents.some(({ distance }) => distance < 450);
        default:
            return false;
    }
}

const method = runner((game, data, playerIdx) => {
    const inputs: Fields[] = [];
    const player = asPlayer(game, playerIdx);
    if (!player) return [inputs, "success"];

    const now = game.levelTime;
    if (data.lastLevelIndex !== game.levelIndex || data.lastLap !== player.lapsCompleted) {
        data.lastLevelIndex = game.levelIndex;
        data.lastLap = player.lapsCompleted;
        data.lastCheckpoint = player.checkpoint;
        data.routePlatformIndex = null;
        data.routeBarrierIndex = null;
        data.bestX = player.x;
        data.lastProgressAt = now;
    } else if (player.x > data.bestX + 24) {
        data.bestX = player.x;
        data.lastProgressAt = now;
    }

    if (player.respawn > 0 || player.hit || player.finished) {
        data.bestX = player.x;
        data.lastProgressAt = now;
        return [inputs, "success"];
    }

    const level = game.currentLevel() as unknown as BotLevel;
    const rects = getRects(level, now);

    // The physics search is deliberately throttled; between planning ticks the
    // authoritative game continues normally and the next plan starts from reality.
    if (now - data.lastPlanAt >= PLAN_INTERVAL) {
        data.lastPlanAt = now;
        const goal = getNavigationGoal(game, player, level, rects, data);
        if (planFirstJump(player, goal, data, now, level, rects)) {
            inputs.push(INPUTS.jump);
            data.lastJumpAt = now;
        }
    }

    // Avoid repeated item requests while the game consumes the previous one.
    if (now - data.lastItemAt >= 0.22 && shouldUseItem(game, player, playerIdx)) {
        inputs.push(INPUTS.item);
        data.lastItemAt = now;
    }

    return [inputs, "success"];
});

const root = (function () {
    return all([method]);
})();

export default describeBot([{ root, data: () => new Data() }]);

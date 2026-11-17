import { Fields } from "../../commons/Fields";
import { botActionNodeHelper, describeBot } from "../Bot";
import { GMRally } from "../gamemods/GMRally";
import { checkpointFields, NavLevel } from "../gamemods/rally/rallyNav";

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

// Receding-horizon planning: a beam search over predicted physics states
// (jump / no jump), scored by the gravity-aware distance to the next checkpoint.
const SIM_DT = 1 / 30;
const SEARCH_STEPS = 60; // 2 seconds of predicted movement
const BEAM_WIDTH = 64;
const PLAN_INTERVAL = 0.08;
const CONTACT_EPSILON = 3;
const CHECKPOINT_SCORE = 1e6;

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
    item: number;
    pendingItem: number;
    itemRollTimer: number;
    boostTimer: number;
    starTimer: number;
    wallBoost: number;
}

type BotLevel = NavLevel;

interface Rect {
    skin?: string;
    mud: number;
    trampoline: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
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
    checkpoint: number;
    jumpsUsed: number;
    /** Search step of the first jump press in this trajectory, -1 if none yet. */
    firstJumpStep: number;
}

/** Persistent planner state for one bot instance. */
class Data {
    lastJumpAt = -1e9;
    lastItemAt = -1e9;
    lastPlanAt = -1e9;
    /** Level time at which the current plan wants the next jump pressed. */
    scheduledJumpAt: number | null = null;
    /** Best race progress seen (checkpoint score minus distance to the next one). */
    bestProgress = -Infinity;
    lastProgressAt = 0;
    lastLap = -1;
}

/** After this long without progress, the bot mixes random jumps into its plan to get unstuck. */
const STUCK_TIME = 2.5;
const STUCK_JUMP_CHANCE = 0.3;

function asPlayer(game: GMRally, playerIdx: number): BotPlayerState | undefined {
    return game.players[playerIdx] as unknown as BotPlayerState | undefined;
}

/** Platform rectangles at a given level time (GMRally stores centers in world space). */
function getRects(level: BotLevel, time: number): Rect[] {
    return level.platforms.map(platform => {
        let x = platform.x;
        let y = platform.y;
        const move = platform.move;
        if (move && Number.isFinite(move.period) && move.period > 0) {
            const angle = (2 * Math.PI * time) / move.period + 2 * Math.PI * move.phase;
            x += move.ax * Math.sin(angle);
            y += move.ay * Math.sin(angle);
        }
        return {
            skin: platform.skin,
            mud: platform.mud ?? -1,
            trampoline: platform.trampoline ?? -1,
            left: x - platform.w / 2,
            right: x + platform.w / 2,
            top: y - platform.h / 2,
            bottom: y + platform.h / 2,
        };
    });
}

function horizontalOverlap(x: number, rect: Rect): boolean {
    return x + PLAYER_W / 2 > rect.left + 0.5 && x - PLAYER_W / 2 < rect.right - 0.5;
}

function overlapsAt(x: number, y: number, rect: Rect): boolean {
    return x + PLAYER_W / 2 > rect.left + 0.5 &&
        x - PLAYER_W / 2 < rect.right - 0.5 &&
        y + PLAYER_H / 2 > rect.top + 0.5 &&
        y - PLAYER_H / 2 < rect.bottom - 0.5;
}

function isGrounded(state: SimState, rects: Rect[]): boolean {
    const feetY = state.y + PLAYER_H / 2;
    if (state.vy < -30) return false;
    return rects.some(rect => horizontalOverlap(state.x, rect) && Math.abs(feetY - rect.top) <= 5);
}

function wallInFront(state: SimState, rects: Rect[]): boolean {
    const direction = state.facing < 0 ? -1 : 1;
    return rects.some(rect => {
        if (!(state.y + PLAYER_H / 2 > rect.top + 0.5 && state.y - PLAYER_H / 2 < rect.bottom - 0.5)) return false;
        const gap = direction > 0 ? rect.left - (state.x + PLAYER_W / 2) : (state.x - PLAYER_W / 2) - rect.right;
        return Math.abs(gap) <= CONTACT_EPSILON;
    });
}

function approach(current: number, target: number, maxDelta: number): number {
    return current < target
        ? Math.min(target, current + maxDelta)
        : Math.max(target, current - maxDelta);
}

function overlapsCheckpoint(state: SimState, cp: BotLevel["checkpoints"][number] | undefined): boolean {
    if (!cp) return false;
    const w = cp.w ?? 64, h = cp.h ?? 64;
    return Math.abs(state.x - (cp.x + w / 2)) * 2 < PLAYER_W + w &&
        Math.abs(state.y - (cp.y + h / 2)) * 2 < PLAYER_H + h;
}

/** Approximate one authoritative Rally physics step for look-ahead planning. */
function simulateStep(source: SimState, pressJump: boolean, rects: Rect[], level: BotLevel, step: number): SimState {
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
        if (s.firstJumpStep < 0) s.firstJumpStep = step;
    }

    // Mud disables jumping and limits speed (unless boosted).
    const feet = s.y + PLAYER_H / 2;
    const mud = rects.find(rect => rect.mud >= 0 && horizontalOverlap(s.x, rect) && feet >= rect.top - 1 && feet <= rect.bottom + 1);
    if (mud) s.jumpBuffer = 0;

    // Rally applies gravity before its player-control hook.
    s.vy += GRAVITY * dt;
    const grounded = isGrounded(s, rects);
    const pushingWall = wallInFront(s, rects);

    if (pushingWall && grounded) {
        s.facing = -s.facing; // running into a wall from the floor turns around
    } else if (pushingWall) {
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
    const boosted = s.boostTimer > 0 || s.starTimer > 0;
    if (mud && !boosted) targetSpeed = Math.min(targetSpeed, mud.mud);
    if (boosted) targetSpeed *= 1.6;

    const targetVx = (s.facing < 0 ? -1 : 1) * targetSpeed;
    const reversing = s.vx !== 0 && Math.sign(s.vx) !== Math.sign(targetVx);
    s.vx = approach(s.vx, targetVx, (reversing ? RUN_HARD_DEC : RUN_ACC) * dt);

    // Axis-separated collision, as the platform engine does.
    const oldX = s.x;
    let nextX = s.x + s.vx * dt;
    for (const rect of rects) {
        if (!overlapsAt(nextX, s.y, rect)) continue;
        if (rect.trampoline >= 0 && rect.skin === "horizontal-trampoline") {
            s.vx = Math.sign(s.vx || s.facing) * -rect.trampoline;
        }
        if (nextX > oldX) nextX = rect.left - PLAYER_W / 2;
        else if (nextX < oldX) nextX = rect.right + PLAYER_W / 2;
        if (!(rect.trampoline >= 0 && rect.skin === "horizontal-trampoline")) s.vx = 0;
    }
    s.x = nextX;

    const oldY = s.y;
    let nextY = s.y + s.vy * dt;
    for (const rect of rects) {
        if (!horizontalOverlap(s.x, rect)) continue;
        const oldBottom = oldY + PLAYER_H / 2;
        const nextBottom = nextY + PLAYER_H / 2;
        const oldTop = oldY - PLAYER_H / 2;
        const nextTop = nextY - PLAYER_H / 2;
        const bounce = rect.trampoline >= 0 && rect.skin !== "horizontal-trampoline";

        if (s.vy >= 0 && oldBottom <= rect.top + 6 && nextBottom >= rect.top) {
            nextY = rect.top - PLAYER_H / 2;
            s.vy = bounce ? -rect.trampoline : 0;
        } else if (s.vy < 0 && oldTop >= rect.bottom - 6 && nextTop <= rect.bottom) {
            nextY = rect.bottom + PLAYER_H / 2;
            s.vy = bounce ? -rect.trampoline : 0;
        } else if (overlapsAt(s.x, nextY, rect)) {
            nextY = s.vy >= 0 ? rect.top - PLAYER_H / 2 : rect.bottom + PLAYER_H / 2;
            s.vy = 0;
        }
    }
    s.y = nextY;

    // Checkpoints are crossed one at a time, like in GMRally.updateCheckpoint.
    if (overlapsCheckpoint(s, level.checkpoints[s.checkpoint + 1])) s.checkpoint++;
    return s;
}

function scoreState(state: SimState, initial: SimState, level: BotLevel, fields: ((x: number, y: number) => number)[]): number {
    if (state.y > level.deathY - 24) return -1e12;
    const last = level.checkpoints.length - 1;
    const next = Math.min(state.checkpoint + 1, last);
    let score = state.checkpoint * CHECKPOINT_SCORE - fields[next](state.x, state.y);
    // Mild jump economy so the bot does not hop needlessly.
    score -= state.jumpsUsed * 6;
    if (state.checkpoint > initial.checkpoint) score += 0; // already dominated by CHECKPOINT_SCORE
    return score;
}

function stateKey(state: SimState): string {
    // Coarse quantization prevents near-identical trajectories from filling the beam.
    return [
        Math.round(state.x / 32),
        Math.round(state.y / 32),
        Math.round(state.vy / 150),
        state.facing,
        state.wallBoost > 0 ? 1 : 0,
        state.checkpoint,
        // Keep trajectories whose first jump happens at different near-term times apart.
        state.firstJumpStep < 0 || state.firstJumpStep > 8 ? -1 : state.firstJumpStep,
    ].join(":");
}

/**
 * Beam search through simulated movement states. Returns in how many seconds
 * the best trajectory presses jump first (null: no jump planned); the next
 * planning tick replans from the real authoritative state.
 */
function planFirstJump(player: BotPlayerState, data: Data, now: number, level: BotLevel): number | null {
    const fields = checkpointFields(level);
    if (fields.length === 0) return null;
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
        checkpoint: player.checkpoint,
        jumpsUsed: 0,
        firstJumpStep: -1,
    };
    const result = (state: SimState | null) =>
        state && state.firstJumpStep >= 0 ? state.firstJumpStep * SIM_DT : null;

    let beam: SimState[] = [initial];
    let bestReached: { state: SimState; step: number } | null = null;
    for (let step = 0; step < SEARCH_STEPS && beam.length; step++) {
        const rects = getRects(level, now + (step + 1) * SIM_DT);
        const deduplicated = new Map<string, { state: SimState; score: number }>();
        for (const state of beam) {
            const actions = state.jumpCooldown <= 0 ? [false, true] : [false];
            for (const action of actions) {
                const next = simulateStep(state, action, rects, level, step);
                if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) continue;
                if (next.y > level.deathY) continue;
                const score = scoreState(next, initial, level, fields);
                const key = stateKey(next);
                const previous = deduplicated.get(key);
                if (!previous || score > previous.score) deduplicated.set(key, { state: next, score });
            }
        }
        const sorted = [...deduplicated.values()].sort((a, b) => b.score - a.score);
        // Reaching the next checkpoint early is the strongest signal: take the first depth that does.
        const reached = sorted.find(entry => entry.state.checkpoint > initial.checkpoint);
        if (reached && !bestReached) bestReached = { state: reached.state, step };
        if (bestReached) return result(bestReached.state);
        beam = sorted.slice(0, BEAM_WIDTH).map(entry => entry.state);
    }

    // Otherwise follow the best trajectory found within the horizon.
    let best: SimState | null = null;
    let bestScore = -Infinity;
    for (const state of beam) {
        const score = scoreState(state, initial, level, fields);
        if (score > bestScore) { bestScore = score; best = state; }
    }
    return result(best);
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
    if (player.respawn > 0 || player.hit || player.finished) return [inputs, "success"];

    const now = game.levelTime;
    const level = game.currentLevel() as unknown as BotLevel;

    // Track progress to detect when the approximate planner keeps failing somewhere.
    const fields = checkpointFields(level);
    const next = Math.min(player.checkpoint + 1, level.checkpoints.length - 1);
    const progress = player.checkpoint * CHECKPOINT_SCORE - (fields[next]?.(player.x, player.y) ?? 0);
    if (data.lastLap !== player.lapsCompleted || now < data.lastProgressAt) {
        data.lastLap = player.lapsCompleted;
        data.bestProgress = progress;
        data.lastProgressAt = now;
    } else if (progress > data.bestProgress + 32) {
        data.bestProgress = progress;
        data.lastProgressAt = now;
    }
    const stuck = now - data.lastProgressAt > STUCK_TIME;

    // The physics search is deliberately throttled; between planning ticks the
    // authoritative game continues normally and the next plan starts from reality.
    if (now - data.lastPlanAt >= PLAN_INTERVAL || now < data.lastPlanAt) {
        data.lastPlanAt = now;
        if (stuck) {
            data.scheduledJumpAt = Math.random() < STUCK_JUMP_CHANCE ? now : null;
        } else {
            const delay = planFirstJump(player, data, now, level);
            data.scheduledJumpAt = delay === null ? null : now + delay;
        }
        // Give the planner another chance after a burst of random moves.
        if (stuck && now - data.lastProgressAt > STUCK_TIME + 1.5) {
            data.lastProgressAt = now;
            data.bestProgress = progress;
        }
    }
    // Press at the planned instant (between two planning ticks if needed).
    if (data.scheduledJumpAt !== null && now + 1e-6 >= data.scheduledJumpAt) {
        inputs.push(INPUTS.jump);
        data.lastJumpAt = now;
        data.scheduledJumpAt = null;
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

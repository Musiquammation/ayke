/**
 * Headless Rally level checker.
 *
 *   npx tsx scripts/rallyLevelTest.ts [levelIndex|all] [--map] [--laps N] [--bots N]
 *
 * Runs the real game simulation (Rapier platform engine included) with the
 * shipped Rally bot on every player slot and reports, for each level, whether
 * the bots complete the race and how long each lap took. With --map, an ASCII
 * view of the level is printed first (# solid, ~ mud, C checkpoint, ? item box).
 */
import protobuf from "protobufjs";
import { initProtocols, getProtocol } from "../commons/protocolLoader";
import { GMRally } from "../commons/gamemods/GMRally";
import botsRally from "../commons/bots/bots-rally";
import { generateBot } from "../commons/Bot";
import { checkpointFields } from "../commons/gamemods/rally/rallyNav";

const GRID = 64;
const DT = 1 / 60;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string, fallback: number) => {
	const i = args.indexOf(name);
	return i >= 0 ? Number(args[i + 1]) : fallback;
};

async function createGame(levelIndex: number, players: number): Promise<GMRally> {
	const { StartData } = getProtocol('rally', 'multiplayer').get();
	const data = StartData.encode({ choice: levelIndex }).finish();
	const entries = Array.from({ length: players }, () => ({ data, pseudo: null }));
	const { game } = await GMRally.createServ(entries, players, async () => false);
	// The engine (Rapier WASM) is created asynchronously.
	for (let i = 0; i < 200 && !(game as any).engine; i++) await new Promise(r => setTimeout(r, 10));
	if (!(game as any).engine) throw new Error("engine not ready");
	return game;
}

function printMap(game: GMRally) {
	const level = game.currentLevel() as any;
	const rects = level.platforms.map((p: any) => ({
		l: Math.round((p.x - p.w / 2) / GRID), t: Math.round((p.y - p.h / 2) / GRID),
		r: Math.round((p.x + p.w / 2) / GRID), b: Math.round((p.y + p.h / 2) / GRID),
		c: p.skin === 'mud' ? '~' : p.trampoline !== undefined && p.trampoline >= 0 ? 'T' : p.move ? '=' : '#',
	}));
	const minX = Math.min(0, ...rects.map((r: any) => r.l)) - 1;
	const maxX = Math.ceil(level.finishX / GRID) + 1;
	const minY = Math.min(...rects.map((r: any) => r.t), ...level.checkpoints.map((c: any) => Math.round(c.y / GRID))) - 2;
	const groundTops = rects.filter((r: any) => r.c === '#').map((r: any) => r.t);
	const maxY = Math.max(...groundTops) + 3;
	const rows: string[][] = [];
	for (let y = minY; y <= maxY; y++) rows.push(Array.from({ length: maxX - minX + 1 }, () => ' '));
	const put = (x: number, y: number, ch: string) => {
		if (y >= minY && y <= maxY && x >= minX && x <= maxX) rows[y - minY][x - minX] = ch;
	};
	level.checkpoints.forEach((cp: any, i: number) => {
		for (let x = Math.floor(cp.x / GRID); x < Math.ceil((cp.x + cp.w) / GRID); x++)
			for (let y = Math.floor(cp.y / GRID); y < Math.ceil((cp.y + cp.h) / GRID); y++) put(x, y, String(i % 10));
	});
	for (const r of rects) for (let x = r.l; x < r.r; x++) for (let y = r.t; y < r.b; y++) put(x, y, r.c);
	for (const it of level.items) put(Math.floor(it.x / GRID), Math.floor(it.y / GRID), '?');
	const header = Array.from({ length: maxX - minX + 1 }, (_, i) => ((i + minX) % 10 === 0 ? '|' : ' ')).join('');
	console.log(`   ${header}`);
	rows.forEach((row, i) => console.log(`${String(i + minY).padStart(3)}${row.join('')}`));
}

interface RaceResult {
	finished: number;
	lapTimes: number[][];
	deaths: number[];
	deathSpots: string;
	stuckAt: { x: number; y: number; checkpoint: number }[];
}

async function race(levelIndex: number, players: number, laps: number, timeLimit: number): Promise<RaceResult> {
	const game = await createGame(levelIndex, players);
	const bots = Array.from({ length: players }, (_, i) => generateBot(botsRally, 0, i));
	const lapTimes: number[][] = Array.from({ length: players }, () => []);
	const deaths = Array.from({ length: players }, () => 0);
	const lastLap = Array.from({ length: players }, () => 0);
	const lastRespawn = Array.from({ length: players }, () => 0);
	let lapStart = Array.from({ length: players }, () => 0);
	const deathSpots = new Map<string, number>();
	const trail: { x: number; y: number }[][] = Array.from({ length: players }, () => []);

	for (let t = 0; t < timeLimit; t += DT) {
		for (const bot of bots) for (const input of bot.play(game)) game.runInput(bot.playerIdx, input);
		game.run(DT, false, null);
		game.players.forEach((p, i) => {
			if (p.lapsCompleted > lastLap[i]) {
				lapTimes[i].push(+(game.levelTime - lapStart[i]).toFixed(2));
				lapStart[i] = game.levelTime;
				lastLap[i] = p.lapsCompleted;
			}
			if (p.respawn > 0 && lastRespawn[i] <= 0) {
				deaths[i]++;
				// Where the fatal fall started: the last grounded-ish point ~1.5s earlier.
				const from = trail[i][0];
				if (from) {
					const key = `${Math.round(from.x / GRID)},${Math.round(from.y / GRID)}`;
					deathSpots.set(key, (deathSpots.get(key) ?? 0) + 1);
				}
			}
			if (p.respawn <= 0) {
				trail[i].push({ x: p.x, y: p.y });
				if (trail[i].length > 60) trail[i].shift();
			} else trail[i] = [];
			lastRespawn[i] = p.respawn;
		});
		if (game.players.every(p => p.lapsCompleted >= laps)) break;
	}
	return {
		finished: game.players.filter(p => p.lapsCompleted >= laps).length,
		deathSpots: [...deathSpots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `(${k})x${n}`).join(' '),
		lapTimes,
		deaths,
		stuckAt: game.players.filter(p => p.lapsCompleted < laps).map(p => ({
			x: +(p.x / GRID).toFixed(1), y: +(p.y / GRID).toFixed(1), checkpoint: p.checkpoint,
		})),
	};
}


/* -------------------------------------------------------------------------- */
/* Feasibility solver: beam search over real engine snapshots                 */
/* -------------------------------------------------------------------------- */

const FRAMES_PER_DECISION = 4;

interface Trail { x: number; y: number; jump: boolean; parent: Trail | null }
interface Node { snap: Uint8Array; score: number; time: number; trail: Trail | null }

/**
 * Searches jump timings with the real engine until `reached()` holds.
 * Each node is a full game snapshot; children press jump (or not) and advance
 * FRAMES_PER_DECISION frames. Dying prunes the branch.
 */
function beamSearch(game: GMRally, reached: () => boolean, fields: ((x: number, y: number) => number)[], beamWidth: number, timeLimit: number) {
	const level = game.currentLevel() as any;
	const p = game.players[0];
	const score = () => {
		const next = Math.min(p.checkpoint + 1, level.checkpoints.length - 1);
		return p.checkpoint * 1e6 - fields[next](p.x, p.y);
	};
	let beam: Node[] = [{ snap: game.save(), score: score(), time: 0, trail: null }];
	let best = { score: -Infinity, x: 0, y: 0, checkpoint: 0 };
	let stale = 0;
	while (beam.length && beam[0].time < timeLimit) {
		const children = new Map<string, Node>();
		for (const node of beam) {
			for (const jump of [false, true]) {
				game.load(node.snap);
				if (jump) game.runInput(0, { action: 'jump', jump: {} });
				let died = false;
				for (let f = 0; f < FRAMES_PER_DECISION; f++) {
					game.run(DT, false, null);
					if (p.respawn > 0) { died = true; break; }
					if (reached()) {
						return { ok: true, time: +(node.time + (f + 1) * DT).toFixed(2), best, trail: { x: p.x, y: p.y, jump, parent: node.trail } };
					}
				}
				if (died) continue;
				const s = score();
				const key = `${p.checkpoint}:${Math.round(p.x / 24)}:${Math.round(p.y / 24)}:${Math.round(p.vy / 160)}:${p.facing}:${p.wallBoost > 0 ? 1 : 0}`;
				const old = children.get(key);
				if (!old || old.score < s) children.set(key, {
					snap: game.save(), score: s, time: node.time + FRAMES_PER_DECISION * DT,
					trail: { x: p.x, y: p.y, jump, parent: node.trail },
				});
				if (s > best.score) {
					best = { score: s, x: +(p.x / GRID).toFixed(1), y: +(p.y / GRID).toFixed(1), checkpoint: p.checkpoint };
					stale = 0;
				}
			}
		}
		if (++stale > 15 / (FRAMES_PER_DECISION * DT)) break; // no progress for 15s
		beam = [...children.values()].sort((a, b) => b.score - a.score).slice(0, beamWidth);
		if (process.env.DEBUG_SOLVER && beam.length && Math.round(beam[0].time / (FRAMES_PER_DECISION * DT)) % 15 === 0) {
			const t = beam[0].trail!;
			console.log(`t=${beam[0].time.toFixed(1)} beam=${beam.length} top=(${(t.x / GRID).toFixed(1)},${(t.y / GRID).toFixed(1)}) score=${beam[0].score.toFixed(0)}`);
			if (process.env.DEBUG_SOLVER === '2') {
				game.load(beam[0].snap);
				const q = game.players[0];
				console.log('  state', JSON.stringify({ x: q.x, y: q.y, vx: q.vx, vy: q.vy, f: q.facing, wb: q.wallBoost, hit: q.hit, cp: q.checkpoint, jb: q.jumpBuffer }));
				const seq: string[] = [];
				for (let f = 0; f < 40; f++) { game.run(DT, false, null); if (f % 4 === 0) seq.push(`${(q.x / GRID).toFixed(2)},${(q.y / GRID).toFixed(2)},${q.checkpoint}`); }
				console.log('  nojump', seq.join(' '));
			}
		}
	}
	return { ok: false, time: -1, best, trail: null };
}

function jumpsOf(trail: Trail | null): string {
	const out: string[] = [];
	for (let t = trail; t; t = t.parent) if (t.jump) out.push(`(${(t.x / GRID).toFixed(1)},${(t.y / GRID).toFixed(1)})`);
	return out.reverse().join(' ');
}

/** One full lap from the start line. */
async function solve(levelIndex: number, beamWidth: number, timeLimit: number) {
	const game = await createGame(levelIndex, 1);
	const level = game.currentLevel() as any;
	const fields = checkpointFields(level);
	if (process.env.DEBUG_FIELD) {
		const [i, x, y] = process.env.DEBUG_FIELD.split(',').map(Number);
		console.log(`field cp${i} at (${x},${y}) = ${fields[i](x * GRID, y * GRID)}`);
	}
	return beamSearch(game, () => game.players[0].lapsCompleted > 0, fields, beamWidth, timeLimit);
}

/**
 * For every checkpoint a player can die after, kill the player there and check
 * that the respawn point is clear and that the next checkpoint is reachable from it.
 */
async function checkRespawns(levelIndex: number, beamWidth: number) {
	const game = await createGame(levelIndex, 1);
	const level = game.currentLevel() as any;
	const fields = checkpointFields(level);
	const p = game.players[0];
	const initial = game.save();
	const problems: string[] = [];
	for (let i = 0; i < level.checkpoints.length - 1; i++) {
		game.load(initial);
		p.checkpoint = i;
		p.y = level.deathY + 200;
		(game as any).syncBlocksFromPlayers();
		for (let f = 0; f < 3; f++) game.run(DT, false, null);
		if (!(p.respawn > 0)) { problems.push(`cp${i}: kill failed`); continue; }
		while (p.respawn > 0) game.run(DT, false, null);
		const spawnX = p.x, spawnY = p.y;
		// Let the player settle: an overlapping respawn gets ejected by the engine.
		const settle = game.save();
		const solid = (level.platforms as any[]).some(pl => !pl.move &&
			Math.abs(spawnX - pl.x) * 2 < 48 + pl.w && Math.abs(spawnY - pl.y) * 2 < 64 + pl.h);
		if (solid) problems.push(`cp${i}: respawn (${(spawnX / GRID).toFixed(1)},${(spawnY / GRID).toFixed(1)}) inside terrain`);
		game.load(settle);
		const target = i + 1;
		const r = beamSearch(game, () => p.checkpoint >= target || p.lapsCompleted > 0, fields, beamWidth, 60);
		if (!r.ok) problems.push(`cp${i}: cannot reach cp${target} after respawn (furthest ${JSON.stringify(r.best)})`);
	}
	return problems;
}

async function main() {
	await initProtocols(name => protobuf.load(`commons/protocols/games/${name}.proto`), [{ name: 'rally', type: 'multiplayer' }]);
	const probe = await createGame(0, 1);
	const levelCount = (probe as any).constructor && (await import("../commons/gamemods/GMRally")).GMRally.generateClientDom([]).maps.length;
	const which = args[0] === undefined || args[0] === 'all' || args[0].startsWith('--')
		? Array.from({ length: levelCount }, (_, i) => i)
		: [Number(args[0])];
	const laps = option('--laps', 3);
	const bots = option('--bots', 4);
	let failures = 0;

	for (const index of which) {
		const game = await createGame(index, 1);
		const name = (game.currentLevel() as any).name;
		console.log(`\n=== Level ${index}: ${name} ===`);
		if (flag('--map')) printMap(game);
		if (!flag('--no-solve')) {
			const t0 = Date.now();
			const solved = await solve(index, option('--beam', 300), option('--time', 400));
			if (!solved.ok) failures++;
			console.log(solved.ok
				? `SOLVABLE  one lap in ${solved.time}s (search ${((Date.now() - t0) / 1000).toFixed(0)}s)`
				: `UNSOLVED  furthest: ${JSON.stringify(solved.best)}`);
			if (flag('--jumps')) console.log(`  jumps: ${jumpsOf(solved.trail)}`);
		}
		if (flag('--respawns')) {
			const problems = await checkRespawns(index, option('--beam', 300));
			if (problems.length) failures++;
			console.log(problems.length ? `RESPAWN PROBLEMS\n  ${problems.join('\n  ')}` : 'RESPAWNS OK');
		}
		if (flag('--no-bots')) continue;
		const result = await race(index, bots, laps, option('--time', 400));
		const ok = result.finished === bots;
		if (!ok) failures++;
		console.log(`${ok ? 'PASS' : 'FAIL'}  ${result.finished}/${bots} bots finished ${laps} laps`);
		result.lapTimes.forEach((times, i) => console.log(`  bot ${i}: laps ${times.join('s, ')}s  deaths ${result.deaths[i]}`));
		if (result.deathSpots) console.log(`  deaths started near: ${result.deathSpots}`);
		if (result.stuckAt.length) console.log(`  stuck:`, JSON.stringify(result.stuckAt));
	}
	process.exit(failures ? 1 : 0);
}

main();

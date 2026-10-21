import "dotenv/config";

import protobuf from "protobufjs";
import { initProtocols } from "../commons/protocolLoader";
import { gamemods } from "../commons/gamemods";
import { createServer } from "vite";
import { chromium, type Page } from "playwright";
import { mkdir, writeFile, unlink, rm, rename } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { SUBTITLES } from "./videoDesc";

const ROOT = process.cwd();
const DIST = resolve(ROOT, "dist");
const AUDIO_PATH = resolve(DIST, "audio.mp3");
const OUTPUT_PATH = resolve(DIST, "video.webm");
const VIDEO_ONLY_PATH = resolve(DIST, "video-only.webm");
const FRAMES_DIR = resolve(DIST, ".video-frames");
const execFileAsync = promisify(execFile);

const CLASS_NAME = "GMAirBasket";
const MODE_NAME = "airbasket";

// Resolve source files by filesystem path so Vite's configured root does not
// incorrectly map /commons/... to a nonexistent URL.
const GAME_MODULE_PATH = existsSync(resolve(ROOT, `commons/gamemods/${CLASS_NAME}.ts`))
	? resolve(ROOT, `commons/gamemods/${CLASS_NAME}.ts`)
	: resolve(ROOT, `src/commons/gamemods/${CLASS_NAME}.ts`);
const BOT_MODULE_PATH = existsSync(resolve(ROOT, "commons/Bot.ts"))
	? resolve(ROOT, "commons/Bot.ts")
	: resolve(ROOT, "src/commons/Bot.ts");
const BOTS_IMPORT_MODULE_PATH = existsSync(resolve(ROOT, `commons/bots/bots-${MODE_NAME}.ts`))
	? resolve(ROOT, `commons/bots/bots-${MODE_NAME}.ts`)
	: resolve(ROOT, `src/commons/bots/bots-${MODE_NAME}.ts`);
const IMAGE_LOADER_MODULE_PATH = existsSync(resolve(ROOT, "commons/util/ImageLoader.ts"))
	? resolve(ROOT, "commons/util/ImageLoader.ts")
	: resolve(ROOT, "src/commons/util/ImageLoader.ts");
const PROTOCOL_LOADER_MODULE_PATH = existsSync(resolve(ROOT, "commons/protocolLoader.ts"))
	? resolve(ROOT, "commons/protocolLoader.ts")
	: resolve(ROOT, "src/commons/protocolLoader.ts");
const GAME_MODULE_URL = `/@fs${GAME_MODULE_PATH.replace(/\\/g, "/")}`;
const BOT_MODULE_URL = `/@fs${BOT_MODULE_PATH.replace(/\\/g, "/")}`;
const BOTS_IMPORT_MODULE_URL = `/@fs${BOTS_IMPORT_MODULE_PATH.replace(/\\/g, "/")}`;
const IMAGE_LOADER_MODULE_URL = `/@fs${IMAGE_LOADER_MODULE_PATH.replace(/\\/g, "/")}`;
const PROTOCOL_LOADER_MODULE_URL = `/@fs${PROTOCOL_LOADER_MODULE_PATH.replace(/\\/g, "/")}`;
const BROWSER_PROTOCOL_BOOTSTRAP_PATH = resolve(ROOT, "video/.videoProtocolBootstrap.ts");
const BROWSER_PROTOCOL_BOOTSTRAP_URL = `/@fs${BROWSER_PROTOCOL_BOOTSTRAP_PATH.replace(/\\/g, "/")}`;

const HEIGHT = 1080;
const WIDTH = Math.floor(HEIGHT * 16/9);
const FPS = 30;
const SILENT_DURATION = 35;
const SIMULATING = false; // Interactive browser mode; set false to render video.



async function main() {
	const videoScript = await readFile("./video/videoScript.js", "utf-8");
	const hasAudio = !SIMULATING && existsSync(AUDIO_PATH);
	const duration = hasAudio ? await getAudioDuration(AUDIO_PATH) : SILENT_DURATION;
	// One output image per presentation timestamp. Rendering speed never changes
	// this timeline: a frame may take seconds to draw but still occupies 1/FPS.
	const frameCount = Math.max(1, Math.ceil(duration * FPS - 1e-9));
	if (!SIMULATING) {
		await runCommand("ffmpeg", ["-version"]);
		if (hasAudio) await runCommand("ffprobe", ["-version"]);
	}

	await initProtocols(
		name => protobuf.load("commons/protocols/games/" + name + ".proto"),
		[
			{ name: 'airbasket', type: 'multiplayer' },
		],
	);


	if (!existsSync(GAME_MODULE_PATH)) {
		throw new Error(`${CLASS_NAME} module not found: ${GAME_MODULE_PATH}`);
	}
	if (!existsSync(BOT_MODULE_PATH)) {
		throw new Error(`Bot module not found: ${BOT_MODULE_PATH}`);
	}
	if (!existsSync(BOTS_IMPORT_MODULE_PATH)) {
		throw new Error(`Bots import module not found: ${BOTS_IMPORT_MODULE_PATH}`);
	}
	if (!existsSync(IMAGE_LOADER_MODULE_PATH)) {
		throw new Error(`ImageLoader module not found: ${IMAGE_LOADER_MODULE_PATH}`);
	}
	if (!existsSync(PROTOCOL_LOADER_MODULE_PATH)) {
		throw new Error(`protocolLoader module not found: ${PROTOCOL_LOADER_MODULE_PATH}`);
	}
	console.log(`[setup] Game module path: ${GAME_MODULE_PATH}`);
	console.log(`[setup] ImageLoader module path: ${IMAGE_LOADER_MODULE_PATH}`);
	console.log(`[setup] protocolLoader module path: ${PROTOCOL_LOADER_MODULE_PATH}`);
	await mkdir(DIST, { recursive: true });
	if (!SIMULATING) {
		await rm(FRAMES_DIR, { recursive: true, force: true });
		await mkdir(FRAMES_DIR, { recursive: true });
		// Do not mistake outputs from a previous run for this run's output.
		await unlink(OUTPUT_PATH).catch(() => undefined);
		await unlink(VIDEO_ONLY_PATH).catch(() => undefined);
	}

	console.log(`Audio: ${hasAudio ? `${AUDIO_PATH} (duration ${duration.toFixed(3)}s; muxed after rendering)` : `none (silent video, ${duration}s)`}`);
	console.log(`Offline render: ${frameCount} frames at ${FPS} FPS`);

	// A module script injected with page.addScriptTag() is not transformed by Vite,
	// so bare imports such as "protobufjs" cannot be resolved there. Write a tiny
	// temporary TS module that Vite can transform and serve to the browser.
	await writeFile(
		BROWSER_PROTOCOL_BOOTSTRAP_PATH,
		`import protobuf from "protobufjs";\n` +
		`import { initProtocols } from "../commons/protocolLoader";\n` +
		`export async function initBrowserAirbasketProtocol() {\n` +
		`  await initProtocols(\n` +
		`    () => protobuf.load("/dist/video"),\n` +
		`    [{ name: "airbasket", type: "multiplayer" }],\n` +
		`  );\n` +
		`}\n`
	);

	const vite = await createServer({
		configFile: resolve(ROOT, "vite.config.ts"),
		plugins: [{
			name: "video-protocol",
			configureServer(server) {
				server.middlewares.use("/dist/video", async (_req, res) => {
					try {
						const proto = await readFile(
							resolve(ROOT, "commons/protocols/games/airbasket.proto"),
							"utf8"
						);
						res.statusCode = 200;
						res.setHeader("Content-Type", "text/plain; charset=utf-8");
						res.end(proto);
					} catch (error) {
						res.statusCode = 500;
						res.end(String(error));
					}
				});
			}
		}],
		server: {
			host: "127.0.0.1",
			port: 0,
			strictPort: false,
			fs: {
				allow: [ROOT]
			}
		},
		appType: "spa"
	});


	let browser;
	let videoFailure: string | null = null;
	let renderedFrameCount: number | null = null;
	const pageErrors: string[] = [];

	try {
		await vite.listen();

		const address = vite.httpServer?.address();

		if (!address || typeof address === "string") {
			throw new Error("Could not determine the Vite server port.");
		}

		const baseUrl = `http://127.0.0.1:${address.port}`;

		browser = await chromium.launch({
			headless: !SIMULATING,
			args: [
				"--autoplay-policy=no-user-gesture-required",
				"--disable-background-timer-throttling",
				"--disable-renderer-backgrounding"
			]
		});

		const page = await browser.newPage({
			viewport: { width: WIDTH, height: HEIGHT },
			deviceScaleFactor: 1
		});

		page.on("pageerror", (error) => {
			const detail = error.stack ?? error.message;
			pageErrors.push(detail);
			console.error(`[browser:pageerror] ${detail}`);
		});
		page.on("console", (message) => {
			const detail = `[browser:${message.type()}] ${message.text()}`;
			if (message.type() === "error" || message.type() === "warning") {
				pageErrors.push(detail);
			}
			console.log(detail);
		});
		page.on("requestfailed", (request) => {
			console.error(`[request:failed] ${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown error"}`);
		});
		page.on("response", (response) => {
			if (response.status() >= 400) {
				console.error(`[request:${response.status()}] ${response.url()}`);
			}
		});

		// Register callbacks before injecting the module: it can fail immediately.
		await page.exposeFunction("__videoLog", (message: string) => {
			console.log(`[video-browser] ${message}`);
		});

		await page.exposeFunction("__videoFailed", (message: string) => {
			console.error(`[video-browser:FAILED] ${message}`);
			videoFailure = message;
		});

		await page.exposeFunction("__videoFrame", async (index: number, dataUrl: string) => {
			if (SIMULATING) return;
			if (!Number.isInteger(index) || index < 0 || index >= frameCount) {
				throw new Error(`Invalid frame index ${index}; expected 0..${frameCount - 1}`);
			}
			const prefix = "data:image/png;base64,";
			if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) {
				throw new Error(`Frame ${index} was not supplied as a PNG data URL`);
			}
			const bytes = Buffer.from(dataUrl.slice(prefix.length), "base64");
			if (bytes.length === 0) throw new Error(`Frame ${index} is empty`);
			const framePath = resolve(FRAMES_DIR, `frame_${String(index).padStart(6, "0")}.png`);
			await writeFile(framePath, bytes);
			if (index === 0 || (index + 1) % FPS === 0 || index === frameCount - 1) {
				console.log(`[frame-transfer] saved ${index + 1}/${frameCount} (${bytes.length} bytes)`);
			}
		});

		await page.exposeFunction("__videoRenderComplete", (count: number) => {
			renderedFrameCount = count;
			console.log(`[frame-transfer] offline render complete; frames=${count}`);
		});

		console.log(`[setup] Vite listening at ${baseUrl}`);
		console.log("[setup] Navigating to the Vite page...");
		await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
		console.log("[setup] Page DOM loaded; preparing canvas and injecting renderer...");

		await page.evaluate(() => {
			// Preserve the app DOM: GameHandler accesses the existing canvas during import.
			document.documentElement.style.cssText = "margin:0;padding:0;overflow:hidden";
			document.body.style.cssText = "margin:0;padding:0;overflow:hidden;background:#111";
		});

		await page.addScriptTag({
			type: "module",
			content: `
				const GAME_MODULE_URL = ${JSON.stringify(GAME_MODULE_URL)};
				const BOT_MODULE_URL = ${JSON.stringify(BOT_MODULE_URL)};
				const BOTS_IMPORT_MODULE_URL = ${JSON.stringify(BOTS_IMPORT_MODULE_URL)};
				const IMAGE_LOADER_MODULE_URL = ${JSON.stringify(IMAGE_LOADER_MODULE_URL)};
				const BROWSER_PROTOCOL_BOOTSTRAP_URL = ${JSON.stringify(BROWSER_PROTOCOL_BOOTSTRAP_URL)};
				const WIDTH = ${WIDTH};
				const HEIGHT = ${HEIGHT};
				const FPS = ${FPS};
				const SIMULATING = ${SIMULATING};
				const duration = ${duration};
				const frameCount = ${frameCount};
				const subtitles = ${JSON.stringify(SUBTITLES)};

				function log(message) {
					console.log(\`[render +\${(performance.now() / 1000).toFixed(1)}s] \${message}\`);
					try { window.__videoLog?.(message); } catch (error) { console.warn("Could not forward log to Node", error); }
				}

				log("Renderer module started");
				const canvas = document.createElement("canvas");
				canvas.width = WIDTH;
				canvas.height = HEIGHT;
				canvas.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:block;width:100vw;height:100vh;pointer-events:none";
				document.body.appendChild(canvas);

				const ctx = canvas.getContext("2d");
				if (!ctx) throw new Error("Could not create the canvas context.");

				ctx.imageSmoothingEnabled = false;


				function drawSubtitle(time, duration) {
					const item = subtitles.find(
						s => time >= s.start &&
							time < s.end
					);

					if (!item) return;

					const words = item.text.split(" ");
					const lines = [];
					let line = "";

					ctx.save();
					ctx.font = "bold 25px Arial, sans-serif";

					for (const word of words) {
						const candidate = line ? line + " " + word : word;

						if (ctx.measureText(candidate).width > WIDTH - 100 && line) {
							lines.push(line);
							line = word;
						} else {
							line = candidate;
						}
					}

					if (line) lines.push(line);

					const lineHeight = 34;
					const boxHeight = lines.length * lineHeight + 30;
					const boxY = HEIGHT - boxHeight - 28;

					ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
					ctx.fillRect(35, boxY, WIDTH - 70, boxHeight);

					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillStyle = "#fff";

					lines.forEach((text, index) => {
						ctx.fillText(
							text,
							WIDTH / 2,
							boxY + 15 + lineHeight * (index + 0.5),
							WIDTH - 110
						);
					});

					ctx.restore();
				}

				async function main() {
					log("Render main() entered; canvas is attached to DOM");
					log("Initializing browser-side airbasket protocol registry...");
					// Import through Vite so "protobufjs" is resolved and bundled correctly.
					const { initBrowserAirbasketProtocol } = await import(BROWSER_PROTOCOL_BOOTSTRAP_URL);
					await initBrowserAirbasketProtocol();
					log("Browser-side airbasket protocol initialized");
					log("Importing game module: ${GAME_MODULE_URL}");
					const { ${CLASS_NAME} } = await import(GAME_MODULE_URL);
					log("Game module imported successfully");
					const { generateBot } = await import(BOT_MODULE_URL);
					const { default: botsImport } = await import(BOTS_IMPORT_MODULE_URL);
					log("Bot modules imported successfully");
					log("Importing ImageLoader module: ${IMAGE_LOADER_MODULE_URL}");
					const { ImageLoader } = await import(IMAGE_LOADER_MODULE_URL);
					log("ImageLoader module imported successfully");
					log(\`Target offline render duration=\${duration}s\`);

					log("Generating game client DOM...");
					const clientMessage = ${CLASS_NAME}.generateClientDom([]).produce();

					log("Game client DOM generated; creating client...");
					const client = ${CLASS_NAME}.createClient({
						data: clientMessage,
						origin: "client"
					}, 4);

					// Load scheduleActions and script
					${videoScript}

					const game = client.game;
					const clientData = client.data;

					// Generate one independent bot for each player in the simulation.
					const bots = Array.from(
						{ length: game.players?.length ?? 0 },
						(_, playerIdx) => ({ playerIdx, bot: generateBot(botsImport, 0, playerIdx) })
					);

					log("Initializing game...");
					game.init();
					log(\`Game initialized; players=\${game.players?.length ?? "unknown"}\`);

					initScript(game);

					const imageLoader = new ImageLoader("");
					const textures = {
						...${CLASS_NAME}.TEXTURES,
						...client.skins
					};
					log(\`Loading textures/skins; texture keys=\${Object.keys(textures).length}...\`);
					await imageLoader.load(textures, "airbasket");
					log("Texture/skin loading completed");

					// Deterministic fixed-step simulation. Interactive seeking backwards
					// resets the game and replays from the beginning.
					const simulationStep = 1 / 60;
					let simulationTime = 0;
					let lastProgressFrame = 0;
					let paused = false;
					let targetFrame = 0;

					function advanceTo(time) {
						while (simulationTime + 1e-9 < time) {
							const step = Math.min(simulationStep, time - simulationTime);
							const nextTime = simulationTime + step;
							const inputs = script(nextTime, game, clientData, bots) ?? [];
							for (const { playerIdx, ...inputData } of inputs) {
								if (!Number.isInteger(playerIdx) || playerIdx < 0 || playerIdx >= game.players.length) {
									throw new Error(\`Invalid playerIdx in bot input: \${playerIdx}\`);
								}
								game.runInput(playerIdx, inputData);
							}
							scheduleActions(nextTime);
							game.run(step, false);
							simulationTime = nextTime;
						}
					}

					function drawFrame(frameIndex) {
						const frameTime = frameIndex / FPS;
						ctx.clearRect(0, 0, WIDTH, HEIGHT);
						ctx.save();
						const { width, height } = game.getSize();
						ctx.scale(WIDTH / width, HEIGHT / height);
						game.draw(ctx, 0, clientData, imageLoader, 0, 1 / FPS);
						ctx.restore();
						drawSubtitle(frameTime, duration);
					}

					function resetSimulation() {
						game.init();
						initScript(game);
						simulationTime = 0;
					}

					if (SIMULATING) {
						const panel = document.createElement("div");
						panel.style.cssText = "position:fixed;z-index:2147483647;left:12px;top:12px;padding:10px 12px;background:rgba(0,0,0,.8);color:white;font:14px Arial;border-radius:6px;pointer-events:none";
						panel.innerHTML = '<b>SIMULATING</b><div id="sim-status">t=0.00s · frame 0</div><div>Space: pause · X: frame · N/P: ±1s</div>';
						document.body.appendChild(panel);
						const status = panel.querySelector("#sim-status");

						function refreshStatus() {
							status.textContent = \`\${paused ? "PAUSED" : "PLAYING"} · t=\${(targetFrame / FPS).toFixed(2)}s · frame \${targetFrame}\`;
						}

						function moveToFrame(frame) {
							// Restart at frame 0, whenever seeking into the past, or when
							// the requested frame is beyond the source video's duration.
							if (frame === 0 || frame / FPS < simulationTime || frame >= frameCount) {
								resetSimulation();
							}
							targetFrame = frame >= frameCount ? 0 : frame;
						}

						function seekFrame() {
							alert("Choose a frame number in the next dialog (0-based).");
							const value = prompt("Frame number (0-based):", String(targetFrame));
							if (value === null) return;
							const frame = Number(value);
							if (!Number.isInteger(frame) || frame < 0) {
								alert("Please enter a non-negative integer frame number.");
								return;
							}
							paused = true;
							moveToFrame(frame);
							refreshStatus();
						}

						window.addEventListener("keydown", async event => {
							if (event.code === "Space") {
								event.preventDefault();
								paused = !paused;
								refreshStatus();
							} else if (event.key.toLowerCase() === "x") {
								event.preventDefault();
								await seekFrame();
							} else if (event.key.toLowerCase() === "n") {
								event.preventDefault();
								paused = true;
								moveToFrame(targetFrame + FPS);
								refreshStatus();
							} else if (event.key.toLowerCase() === "p") {
								event.preventDefault();
								paused = true;
								moveToFrame(Math.max(0, targetFrame - FPS));
								refreshStatus();
							}
						});

						refreshStatus();
						log("Interactive simulation ready. Space pause/resume, X choose frame, N/P move by one second.");
						while (true) {
							if (paused) {
								await new Promise(resolve => setTimeout(resolve, 30));
								continue;
							}
							// Loop the simulation from the beginning once its duration
							// reaches or exceeds the source video's frame count.
							if (targetFrame >= frameCount) {
								resetSimulation();
								targetFrame = 0;
							}
							advanceTo(targetFrame / FPS);
							drawFrame(targetFrame);
							targetFrame++;
							refreshStatus();
							await new Promise(resolve => setTimeout(resolve, 1000 / FPS));
						}
					}

					for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
						const frameTime = frameIndex / FPS;
						advanceTo(frameTime);
						drawFrame(frameIndex);
						const pngDataUrl = canvas.toDataURL("image/png");
						await window.__videoFrame(frameIndex, pngDataUrl);
						if (frameIndex - lastProgressFrame >= FPS) {
							lastProgressFrame = frameIndex;
							log(\`Rendered frame \${frameIndex + 1}/${frameCount} at t=\${frameTime.toFixed(3)}s\`);
						}
					}
					await window.__videoRenderComplete(frameCount);
					log("Offline frame rendering complete; audio has not been played or mixed yet");
				}

				main().catch(error => {
					const detail = String(error?.stack ?? error);
					console.error("[render:uncaught]", detail);
					try {
						const panel = document.createElement("pre");
						panel.style.cssText = "position:fixed;z-index:2147483647;left:0;right:0;top:0;max-height:40vh;overflow:auto;margin:0;padding:12px;background:#300;color:#fff;white-space:pre-wrap";
						panel.textContent = detail;
						document.body.appendChild(panel);
					} catch {}
					window.__videoFailed?.(detail);
				});
			`
		});

		if (SIMULATING) {
			console.log("[simulation] Interactive browser started; close it to stop.");
			await page.waitForEvent("close");
			return;
		}

		await waitForRender(page, () => renderedFrameCount, frameCount, () => videoFailure, () => pageErrors);

		console.log(`[encode] Creating constant-FPS video from ${frameCount} rendered frames...`);
		await runCommand("ffmpeg", [
			"-hide_banner", "-loglevel", "error", "-y",
			"-framerate", String(FPS),
			"-start_number", "0",
			"-i", resolve(FRAMES_DIR, "frame_%06d.png"),
			"-frames:v", String(frameCount),
			"-an",
			"-c:v", "libvpx-vp9",
			"-deadline", "good",
			"-cpu-used", "4",
			"-crf", "28",
			"-b:v", "0",
			"-pix_fmt", "yuv420p",
			VIDEO_ONLY_PATH
		]);

		if (hasAudio) {
			console.log("[mux] Adding audio only after game frames and subtitles are fully rendered...");
			await runCommand("ffmpeg", [
				"-hide_banner", "-loglevel", "error", "-y",
				"-i", VIDEO_ONLY_PATH,
				"-i", AUDIO_PATH,
				"-map", "0:v:0",
				"-map", "1:a:0",
				"-c:v", "copy",
				"-c:a", "libopus",
				"-b:a", "160k",
				"-af", "asetpts=PTS-STARTPTS",
				"-t", duration.toFixed(6),
				"-shortest",
				OUTPUT_PATH
			]);
			await unlink(VIDEO_ONLY_PATH).catch(() => undefined);
		} else {
			await rename(VIDEO_ONLY_PATH, OUTPUT_PATH);
		}

		console.log(`[done] Video written to ${OUTPUT_PATH}`);
	} finally {
		if (browser) await browser.close();
		await vite.close();
		await unlink(BROWSER_PROTOCOL_BOOTSTRAP_PATH).catch(() => undefined);
		if (!SIMULATING) {
			await rm(FRAMES_DIR, { recursive: true, force: true });
			await unlink(VIDEO_ONLY_PATH).catch(() => undefined);
		}
	}
}

async function waitForRender(
	page: Page,
	getRenderedFrameCount: () => number | null,
	expectedFrameCount: number,
	getFailure: () => string | null,
	getPageErrors: () => string[]
): Promise<void> {
	const timeoutMs = 10 * 60_000;
	const deadline = Date.now() + timeoutMs;
	let nextLog = Date.now() + 10_000;
	const startedAt = Date.now();

	console.log(`[watchdog] Waiting for offline frame render; expected=${expectedFrameCount}, timeout=${Math.round(timeoutMs / 1000)}s`);
	while (Date.now() < deadline) {
		const completedCount = getRenderedFrameCount();
		if (completedCount !== null) {
			if (completedCount !== expectedFrameCount) {
				throw new Error(`Offline render completed with ${completedCount} frames; expected ${expectedFrameCount}.`);
			}
			return;
		}

		const failure = getFailure();
		if (failure) throw new Error(`Video rendering failed in the browser:
${failure}`);

		const pageText = await page.locator("body").innerText().catch(() => "");
		if (/Error:|Could not load|does not support/i.test(pageText)) {
			throw new Error(`Video rendering failed:
${pageText}`);
		}

		if (Date.now() >= nextLog) {
			const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
			const bodyPreview = pageText.replace(/\s+/g, " ").slice(0, 180);
			console.log(`[watchdog] Still rendering after ${elapsedSeconds}s; body=${JSON.stringify(bodyPreview || "<empty>")}; browserErrors=${getPageErrors().length}`);
			nextLog = Date.now() + 10_000;
		}

		await new Promise(resolve => setTimeout(resolve, 500));
	}

	const diagnostics = getPageErrors();
	const bodyAtTimeout = await page.locator("body").innerText().catch(() => "<could not read page body>");
	console.error(`[watchdog] TIMEOUT. Final page body: ${bodyAtTimeout.slice(0, 2000)}`);
	console.error(`[watchdog] Browser diagnostics (${diagnostics.length}):\n${diagnostics.slice(-30).join("\n") || "<none>"}`);
	throw new Error(
		`Offline video rendering timed out after ${Math.round(timeoutMs / 1000)} seconds.` +
		(diagnostics.length ? `\nBrowser diagnostics:\n${diagnostics.slice(-10).join("\n")}` : "")
	);
}

async function getAudioDuration(path: string): Promise<number> {
	const { stdout } = await runCommand("ffprobe", [
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		path
	]);
	const duration = Number(stdout.trim());
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`Could not determine a valid audio duration for ${path}: ${JSON.stringify(stdout)}`);
	}
	return duration;
}

async function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
	try {
		return await execFileAsync(command, args, { maxBuffer: 16 * 1024 * 1024 });
	} catch (error: any) {
		const detail = error?.stderr || error?.message || String(error);
		throw new Error(`${command} failed: ${String(detail).trim()}`);
	}
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});

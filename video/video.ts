import "dotenv/config";

import protobuf from "protobufjs";
import { initProtocols } from "../commons/protocolLoader";
import { gamemods } from "../commons/gamemods";
import { createServer } from "vite";
import { chromium, type Page } from "playwright";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { SUBTITLES } from "./videoDesc";

const ROOT = process.cwd();
const DIST = resolve(ROOT, "dist");
const AUDIO_PATH = resolve(DIST, "audio.mp3");
const OUTPUT_PATH = resolve(DIST, "video.webm");

const CLASS_NAME = "GMAirBasket";

// Resolve source files by filesystem path so Vite's configured root does not
// incorrectly map /commons/... to a nonexistent URL.
const GAME_MODULE_PATH = existsSync(resolve(ROOT, `commons/gamemods/${CLASS_NAME}.ts`))
	? resolve(ROOT, `commons/gamemods/${CLASS_NAME}.ts`)
	: resolve(ROOT, `src/commons/gamemods/${CLASS_NAME}.ts`);
const IMAGE_LOADER_MODULE_PATH = existsSync(resolve(ROOT, "commons/util/ImageLoader.ts"))
	? resolve(ROOT, "commons/util/ImageLoader.ts")
	: resolve(ROOT, "src/commons/util/ImageLoader.ts");
const PROTOCOL_LOADER_MODULE_PATH = existsSync(resolve(ROOT, "commons/protocolLoader.ts"))
	? resolve(ROOT, "commons/protocolLoader.ts")
	: resolve(ROOT, "src/commons/protocolLoader.ts");
const GAME_MODULE_URL = `/@fs${GAME_MODULE_PATH.replace(/\\/g, "/")}`;
const IMAGE_LOADER_MODULE_URL = `/@fs${IMAGE_LOADER_MODULE_PATH.replace(/\\/g, "/")}`;
const PROTOCOL_LOADER_MODULE_URL = `/@fs${PROTOCOL_LOADER_MODULE_PATH.replace(/\\/g, "/")}`;
const BROWSER_PROTOCOL_BOOTSTRAP_PATH = resolve(ROOT, "video/.videoProtocolBootstrap.ts");
const BROWSER_PROTOCOL_BOOTSTRAP_URL = `/@fs${BROWSER_PROTOCOL_BOOTSTRAP_PATH.replace(/\\/g, "/")}`;

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const SILENT_DURATION = 10;



async function main() {
	const videoScript = await readFile("./video/videoScript.js", "utf-8");

	await initProtocols(
		name => protobuf.load("commons/protocols/games/" + name + ".proto"),
		[
			{ name: 'airbasket', type: 'multiplayer' },
		],
	);


	if (!existsSync(GAME_MODULE_PATH)) {
		throw new Error(`${CLASS_NAME} module not found: ${GAME_MODULE_PATH}`);
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
	// Do not mistake a video from a previous run for this run's output.
	await unlink(OUTPUT_PATH).catch(() => undefined);

	const hasAudio = existsSync(AUDIO_PATH);

	console.log(`Audio: ${hasAudio ? AUDIO_PATH : "none (silent video)"}`);

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
	const pageErrors: string[] = [];

	try {
		await vite.listen();

		const address = vite.httpServer?.address();

		if (!address || typeof address === "string") {
			throw new Error("Could not determine the Vite server port.");
		}

		const baseUrl = `http://127.0.0.1:${address.port}`;

		browser = await chromium.launch({
			headless: true,
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

		const chunks: string[] = [];

		await page.exposeFunction(
			"__videoChunk",
			(index: number, chunk: string) => {
				chunks[index] = chunk;
				if (index === 0 || (index + 1) % 10 === 0) {
					console.log(`[video-transfer] received chunk ${index + 1}, chars=${chunk.length}`);
				}
			}
		);

		await page.exposeFunction(
			"__videoComplete",
			async (count: number) => {
				console.log(`[video-transfer] completion received; expected chunks=${count}, stored chunks=${chunks.filter(Boolean).length}`);
				const base64 = chunks.slice(0, count).join("");
				console.log(`[video-transfer] joined Base64 length=${base64.length}; decoding...`);
				const output = Buffer.from(base64, "base64");
				console.log(`[video-transfer] decoded bytes=${output.length}; writing ${OUTPUT_PATH}...`);
				await writeFile(OUTPUT_PATH, output);
				console.log(`[video-transfer] file write complete (${output.length} bytes)`);
			}
		);

		console.log(`[setup] Vite listening at ${baseUrl}`);
		console.log("[setup] Navigating to the Vite page...");
		await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
		console.log("[setup] Page DOM loaded; preparing canvas and injecting renderer...");

		await page.evaluate(() => {
			// Preserve the app DOM: GameHandler accesses the existing canvas during import.
			document.documentElement.style.cssText = "margin:0;padding:0;overflow:hidden";
			document.body.style.cssText = "margin:0;padding:0;overflow:hidden;background:#111";
		});

		const audioUrl = hasAudio ? `${baseUrl}/dist/audio.mp3` : null;

		await page.addScriptTag({
			type: "module",
			content: `
				const GAME_MODULE_URL = ${JSON.stringify(GAME_MODULE_URL)};
				const IMAGE_LOADER_MODULE_URL = ${JSON.stringify(IMAGE_LOADER_MODULE_URL)};
				const BROWSER_PROTOCOL_BOOTSTRAP_URL = ${JSON.stringify(BROWSER_PROTOCOL_BOOTSTRAP_URL)};
				const WIDTH = ${WIDTH};
				const HEIGHT = ${HEIGHT};
				const FPS = ${FPS};
				const audioUrl = ${JSON.stringify(audioUrl)};
				const silentDuration = ${SILENT_DURATION};
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

				const audio = audioUrl ? new Audio(audioUrl) : null;
				if (audio) {
					audio.preload = "auto";
					audio.crossOrigin = "anonymous";
				}

				function waitForAudio() {
					if (!audio) { log(\`No audio file; using silent duration \${silentDuration}s\`); return Promise.resolve(silentDuration); }
					log("Waiting for audio metadata...");

					return new Promise((resolve, reject) => {
						audio.addEventListener("loadedmetadata", () => {
							if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
								reject(new Error("Invalid MP3 duration."));
								return;
							}
							log(\`Audio metadata loaded; duration=\${audio.duration}s\`);
							resolve(audio.duration);
						}, { once: true });

						audio.addEventListener("error", () => {
							reject(new Error("Could not load dist/audio.mp3."));
						}, { once: true });

						audio.load();
					});
				}

				function drawSubtitle(time, duration) {
					const item = subtitles.find(
						s => time / duration >= s.start &&
							time / duration < s.end
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
					log("Importing ImageLoader module: ${IMAGE_LOADER_MODULE_URL}");
					const { ImageLoader } = await import(IMAGE_LOADER_MODULE_URL);
					log("ImageLoader module imported successfully");
					const duration = await waitForAudio();
					log(\`Target recording duration=\${duration}s\`);

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
					const data = client.data;

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

					log("Creating canvas capture stream...");
					const stream = canvas.captureStream(FPS);

					if (audio) {
						const audioStream = audio.captureStream();
						for (const track of audioStream.getAudioTracks()) {
							stream.addTrack(track);
						}
					}

					const mimeType = [
						"video/webm;codecs=vp9,opus",
						"video/webm;codecs=vp8,opus",
						"video/webm"
					].find(type => MediaRecorder.isTypeSupported(type));

					if (!mimeType) {
						throw new Error("This browser does not support WebM recording.");
					}

					log(\`MediaRecorder MIME type selected: \${mimeType}\`);
					const recorder = new MediaRecorder(stream, {
						mimeType,
						videoBitsPerSecond: 6_000_000
					});

					const recordedChunks = [];

					recorder.addEventListener("dataavailable", event => {
						if (event.data.size > 0) {
							recordedChunks.push(event.data);
							if (recordedChunks.length === 1 || recordedChunks.length % 20 === 0) {
								log(\`Recorder dataavailable: chunks=\${recordedChunks.length}, latest=\${event.data.size} bytes\`);
							}
						} else {
							log("Recorder emitted an empty data chunk");
						}
					});
					recorder.addEventListener("start", () => log("MediaRecorder started"));
					recorder.addEventListener("stop", () => log(\`MediaRecorder stopped; recorded chunks=\${recordedChunks.length}\`));
					recorder.addEventListener("error", event => log(\`MediaRecorder error event: \${event?.error?.message ?? "unknown"}\`));

					const recordingFinished = new Promise((resolve, reject) => {
						recorder.addEventListener("stop", resolve, { once: true });
						recorder.addEventListener("error", reject, { once: true });
					});

					let elapsed = 0;
					let lastFrame = performance.now();
					let stopped = false;

					// Gameplay control layer: all scripted player commands go through input(),
					// and scheduleActions() defines what happens at each point in the recording.
					function input(player, action, extra = {}) {
						game.runInput(player, { action, ...extra });
					}


					let lastProgressLog = 0;
					function frame(now) {
						if (stopped) return;
						
						const dt = Math.min((now - lastFrame) / 1000, 0.05);
						lastFrame = now;
						elapsed += dt;
						if (elapsed - lastProgressLog >= 5) {
							lastProgressLog = elapsed;
							log(\`Frame loop progressing: \${elapsed.toFixed(1)} / \${duration.toFixed(1)}s\`);
						}

						scheduleActions(elapsed);

						// Keep simulation steps small so the game physics remain stable.
						let remaining = dt;
						while (remaining > 0) {
							const step = Math.min(remaining, 1 / 60);
							game.run(step, false);
							remaining -= step;
						}

						script(game, elapsed);

						ctx.clearRect(0, 0, WIDTH, HEIGHT);
						ctx.save();
						const {width, height} = game.getSize();
						ctx.scale(WIDTH / width, HEIGHT / height);
						game.draw(ctx, 0, data, imageLoader, 0, dt);
						ctx.restore();

						drawSubtitle(elapsed, duration);

						if (elapsed >= duration) {
							log(\`Target duration reached (\${elapsed.toFixed(2)}s); stopping recorder\`);
							stopped = true;
							recorder.stop();
							return;
						}

						requestAnimationFrame(frame);
					}

					log("Starting MediaRecorder (250ms timeslice)...");
					recorder.start(250);

					if (audio) {
						log("Starting audio playback...");
						await audio.play();
						log("Audio playback started");
					}

					lastFrame = performance.now();
					requestAnimationFrame(frame);

					await new Promise(resolve => {
						const check = () => {
							if (stopped) resolve();
							else requestAnimationFrame(check);
						};
						check();
					});

					log("Waiting for MediaRecorder stop event...");
					await recordingFinished;
					log("Recording finished; assembling Blob...");

					const blob = new Blob(recordedChunks, { type: mimeType });
					log(\`Blob assembled; size=\${blob.size} bytes; type=\${blob.type}\`);
					const buffer = await blob.arrayBuffer();
					const bytes = new Uint8Array(buffer);
					log(\`Blob converted to ArrayBuffer; bytes=\${bytes.length}\`);

					// Encode and transfer incrementally: constructing one giant binary string
					// with Array.from(...).join("") can stall or exhaust memory on large videos.
					const chunkSizeBytes = 384 * 1024; // divisible by 3, so Base64 chunks join cleanly
					const chunkCount = Math.ceil(bytes.length / chunkSizeBytes);
					log(\`Encoding and transferring \${bytes.length} bytes in \${chunkCount} chunks...\`);
					for (let i = 0; i < chunkCount; i++) {
						const start = i * chunkSizeBytes;
						const end = Math.min(start + chunkSizeBytes, bytes.length);
						let binary = "";
						// Keep each conversion loop small to avoid argument/string limits.
						for (let offset = start; offset < end; offset += 0x8000) {
							const slice = bytes.subarray(offset, Math.min(offset + 0x8000, end));
							binary += String.fromCharCode(...slice);
						}
						const base64Chunk = btoa(binary);
						if (i === 0 || (i + 1) % 10 === 0 || i === chunkCount - 1) {
							log(\`Sending chunk \${i + 1}/\${chunkCount} (\${end - start} bytes)\`);
						}
						await window.__videoChunk(i, base64Chunk);
					}

					log("All chunks sent; notifying Node to write output file...");
					await window.__videoComplete(chunkCount);
					log("Node acknowledged video file write; rendering complete");
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

		await waitForVideo(page, () => videoFailure, () => pageErrors);

		console.log(`[done] Video written to ${OUTPUT_PATH}`);
	} finally {
		if (browser) await browser.close();
		await vite.close();
		await unlink(BROWSER_PROTOCOL_BOOTSTRAP_PATH).catch(() => undefined);
	}
}

async function waitForVideo(
	page: Page,
	getFailure: () => string | null,
	getPageErrors: () => string[]
): Promise<void> {
	// A 30-second recording can take considerably longer on a slow machine,
	// especially while the browser loads game textures and encodes WebM.
	const timeoutMs = 10 * 60_000;
	const deadline = Date.now() + timeoutMs;
	let nextLog = Date.now() + 10_000;
	const startedAt = Date.now();

	console.log(`[watchdog] Waiting for output file; timeout=${Math.round(timeoutMs / 1000)}s`);
	while (Date.now() < deadline) {
		if (existsSync(OUTPUT_PATH)) {
			const output = await stat(OUTPUT_PATH);
			if (output.size > 0) {
				console.log(`[watchdog] Output file detected: ${output.size} bytes`);
				return;
			}
		}

		const failure = getFailure();
		if (failure) {
			throw new Error(`Video rendering failed in the browser:\n${failure}`);
		}

		const pageText = await page.locator("body").innerText().catch(() => "");
		if (/Error:|Could not load|does not support/i.test(pageText)) {
			throw new Error(`Video rendering failed:\n${pageText}`);
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
		`Video generation timed out after ${Math.round(timeoutMs / 1000)} seconds.` +
		(diagnostics.length ? `\nBrowser diagnostics:\n${diagnostics.slice(-10).join("\n")}` : "")
	);
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});

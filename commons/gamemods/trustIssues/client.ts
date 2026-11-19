import { escapeHTML } from "../../util/escapeHTML";
import {
	MATCH_DURATION,
	MOUSE_SENSITIVITY,
	PITCH_MAX,
	PITCH_MIN,
	ZONE_COLORS,
	ZONE_COUNT,
	ZONE_NAMES,
	ZONE_POINTS,
} from "./constants";
import type { TrustRenderer } from "./render";
import { ranking, TrustState } from "./simulation";

/* -------------------------------------------------------------------------- */
/* Client-only data: view direction, mouse capture, HUD.                      */
/* Nothing here is shared; it can be lost on a load without any consequence. */
/* -------------------------------------------------------------------------- */

/** Duration of the screen animation and of the camera shake after exploding (ms). */
const BOOM_MS = 1200;
const SHAKE_MS = 450;
const BOOM_BLOBS = 7;

/** How long an event (zone reached) stays in the feed. */
const FEED_TIME = 5;
const FEED_SIZE = 5;
/** The mouse capture stays allowed this long after the last frame drawn. */
const ACTIVE_GRACE_MS = 500;


/**
 * Mouse look through the Pointer Lock API. The listeners are installed once for
 * the whole page (no leak when several games are played): they accumulate the
 * mouse motion while the pointer is locked, and lock it on a click on the game
 * canvas while a Trust Issues game is being drawn.
 */
class MouseLook {
	private dx = 0;
	private dy = 0;
	private installed = false;
	private activeUntil = 0;

	/** Install the listeners (once). */
	install() {
		if (this.installed || typeof window === 'undefined')
			return;
		this.installed = true;

		window.addEventListener('mousemove', e => {
			if (document.pointerLockElement) {
				this.dx += e.movementX;
				this.dy += e.movementY;
			}
		});

		window.addEventListener('mousedown', e => {
			if (performance.now() > this.activeUntil || document.pointerLockElement)
				return;
			if (e.target instanceof HTMLCanvasElement)
				e.target.requestPointerLock?.();
		});
	}

	/** Called by every drawn frame: a click on the canvas may capture the mouse. */
	keepActive() {
		this.activeUntil = performance.now() + ACTIVE_GRACE_MS;
	}

	/** Mouse motion since the last call. */
	take() {
		const r = { dx: this.dx, dy: this.dy };
		this.dx = 0;
		this.dy = 0;
		return r;
	}

	isLocked() {
		return typeof document !== 'undefined' && document.pointerLockElement !== null;
	}

	release() {
		if (this.isLocked())
			document.exitPointerLock();
	}
}

export const mouseLook = new MouseLook();


interface FeedLine {
	html: string;
	until: number;
}


export class ClientData {
	firstFrame = true;

	/** Names and colors (hex) of the players, from the start data. */
	readonly names: string[] = [];
	readonly colors: string[] = [];

	/** Local view: the yaw is sent to the server, the pitch only moves the camera. */
	yaw = 0;
	pitch = -0.25;
	yawInitialized = false;

	// Last values sent (inputs are only sent when they change)
	lastSentYaw = 0;
	lastMoveX = 0;
	lastMoveZ = 0;

	renderer: TrustRenderer | null = null;

	readonly html: HTMLDivElement;
	private readonly time: HTMLDivElement;
	private readonly board: HTMLDivElement;
	private readonly feed: HTMLDivElement;
	private readonly center: HTMLDivElement;
	private readonly hint: HTMLDivElement;

	/** Arrivals already announced in the feed (per zone). */
	private announced: number[] = [];
	private feedLines: FeedLine[] = [];
	private lastBoard = "";
	private lastFeed = "";
	private released = false;

	/** Screen animation played when the local player explodes. */
	private readonly boom: HTMLDivElement;
	private lastExplosions = -1;
	private boomStart = -Infinity;

	constructor(readonly playerIdx: number) {
		mouseLook.install();

		this.html = div("game-trustIssues-root");
		const top = div("game-trustIssues-top");
		this.time = div("game-trustIssues-time");
		const goal = div("game-trustIssues-goal");
		goal.textContent = `Reach the ${ZONE_COUNT} zones: ${ZONE_POINTS.join(" / ")} pts for the first ones`;
		top.append(this.time, goal);

		this.board = div("game-trustIssues-board");
		this.feed = div("game-trustIssues-feed");
		this.center = div("game-trustIssues-center");
		this.hint = div("game-trustIssues-hint");
		this.hint.textContent = "ZQSD: move · Mouse: look · Space: jump (hold: higher) · E: explode (paints the platforms around you)";

		const cross = div("game-trustIssues-cross");
		this.boom = this.createBoom();
		this.html.append(this.boom, top, this.board, this.feed, this.center, this.hint, cross);
	}

	color(idx: number) {
		return this.colors[idx] ?? "#ffffff";
	}

	name(idx: number) {
		return this.names[idx] ?? `Player ${idx + 1}`;
	}

	/** Build the explosion overlay: flash, shock ring, vignette, paint blobs and text. */
	private createBoom() {
		const boom = div("game-trustIssues-boom");
		boom.append(
			div("game-trustIssues-boom-flash"),
			div("game-trustIssues-boom-ring"),
			div("game-trustIssues-boom-vignette"),
		);
		for (let i = 0; i < BOOM_BLOBS; i++)
			boom.append(div("game-trustIssues-boom-blob"));
		const text = div("game-trustIssues-boom-text");
		text.textContent = "SPLAT!";
		boom.append(text);
		return boom;
	}

	/** Restart the explosion overlay, with paint blobs at new random places. */
	private playBoom() {
		this.boomStart = performance.now();
		this.boom.style.setProperty("--boom-color", this.color(this.playerIdx));
		for (const blob of this.boom.querySelectorAll<HTMLDivElement>(".game-trustIssues-boom-blob")) {
			// Mostly near the edges of the screen, like paint thrown on the "camera"
			const side = Math.random();
			const x = side < 0.5 ? (side < 0.25 ? 2 + Math.random() * 18 : 80 + Math.random() * 18) : Math.random() * 100;
			const y = side < 0.5 ? Math.random() * 90 : (side < 0.75 ? Math.random() * 15 : 70 + Math.random() * 20);
			const size = 5 + Math.random() * 9;
			blob.style.left = `${x}vw`;
			blob.style.top = `${y}vh`;
			blob.style.width = blob.style.height = `${size}vh`;
			blob.style.animationDelay = `${Math.random() * 0.12}s`;
		}
		this.boom.classList.remove("game-trustIssues-boom-on");
		void this.boom.offsetWidth; // restart the CSS animations
		this.boom.classList.add("game-trustIssues-boom-on");
	}

	/** Play the overlay when the local player's explosion count goes up. */
	private updateBoom(state: TrustState) {
		const self = state.players[this.playerIdx];
		if (!self)
			return;
		if (this.lastExplosions >= 0 && self.explosions > this.lastExplosions)
			this.playBoom();
		this.lastExplosions = self.explosions;
		if (performance.now() - this.boomStart > BOOM_MS)
			this.boom.classList.remove("game-trustIssues-boom-on");
	}

	/** Camera shake strength (0 to 1), right after exploding. */
	shakeAmount() {
		const k = (performance.now() - this.boomStart) / SHAKE_MS;
		return k >= 0 && k < 1 ? (1 - k) * (1 - k) : 0;
	}

	/** Apply the mouse motion to the local view. */
	updateLook() {
		const { dx, dy } = mouseLook.take();
		this.yaw -= dx * MOUSE_SENSITIVITY;
		this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch - dy * MOUSE_SENSITIVITY));
	}

	/** Called once per drawn frame: view, mouse capture and HUD. */
	frame(state: TrustState) {
		const self = state.players[this.playerIdx];
		if (self && !this.yawInitialized) {
			this.yaw = self.yaw;
			this.lastSentYaw = self.yaw;
			this.yawInitialized = true;
		}

		if (state.finished) {
			if (!this.released) {
				this.released = true;
				mouseLook.release();
			}
		} else {
			mouseLook.keepActive();
		}

		this.updateBoom(state);
		this.updateTime(state);
		this.updateBoard(state);
		this.updateFeed(state);
		this.updateCenter(state);
	}

	/* ---------- HUD ---------- */

	private updateTime(state: TrustState) {
		const t = Math.max(0, Math.ceil(state.time));
		this.time.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
	}

	/** Scoreboard: rank, color, name, zones reached and score. */
	private updateBoard(state: TrustState) {
		let html = "";
		for (const [rank, idx] of ranking(state.players).entries()) {
			const p = state.players[idx];
			let zones = "";
			for (let z = 0; z < ZONE_COUNT; z++) {
				const on = p.hasZone(z);
				zones += `<span class="game-trustIssues-zone${on ? " game-trustIssues-zone-on" : ""}" style="${on ? `background:${ZONE_COLORS[z]}` : ""}">${ZONE_NAMES[z]}</span>`;
			}
			html += `<div class="game-trustIssues-row${idx === this.playerIdx ? " game-trustIssues-self" : ""}">`
				+ `<span class="game-trustIssues-rank">${rank + 1}</span>`
				+ `<span class="game-trustIssues-dot" style="background:${this.color(idx)}"></span>`
				+ `<span class="game-trustIssues-name">${escapeHTML(this.name(idx))}</span>`
				+ zones
				+ `<span class="game-trustIssues-score">${p.score}</span>`
				+ `</div>`;
		}
		if (html !== this.lastBoard) {
			this.lastBoard = html;
			this.board.innerHTML = html;
		}
	}

	/** Announce every new zone arrival. Survives loads (re-announces nothing already seen). */
	private updateFeed(state: TrustState) {
		const clock = MATCH_DURATION - state.time;
		for (let z = 0; z < state.zoneArrivals.length; z++) {
			const arrivals = state.zoneArrivals[z];
			const seen = Math.min(this.announced[z] ?? 0, arrivals.length);
			for (let i = seen; i < arrivals.length; i++) {
				const idx = arrivals[i];
				const pts = ZONE_POINTS[i] ?? 0;
				this.feedLines.push({
					html: `<span style="color:${this.color(idx)}">${escapeHTML(this.name(idx))}</span>`
						+ ` reached <span style="color:${ZONE_COLORS[z]}">zone ${ZONE_NAMES[z]}</span> · +${pts}`,
					until: clock + FEED_TIME,
				});
			}
			this.announced[z] = arrivals.length;
		}

		this.feedLines = this.feedLines.filter(l => l.until > clock).slice(-FEED_SIZE);
		const html = this.feedLines.map(l => `<div class="game-trustIssues-feed-line">${l.html}</div>`).join("");
		if (html !== this.lastFeed) {
			this.lastFeed = html;
			this.feed.innerHTML = html;
		}
	}

	/** Middle of the screen: click to capture the mouse, or game over. */
	private updateCenter(state: TrustState) {
		let text = "";
		const self = state.players[this.playerIdx];
		if (state.finished)
			text = "Game over";
		else if (self?.isDead())
			text = `Respawn in ${self.respawnTimer.toFixed(1)}`;
		else if (!mouseLook.isLocked())
			text = "Click to look around with the mouse";
		this.center.textContent = text;
		this.center.style.display = text ? "" : "none";
	}
}

function div(cls: string) {
	const d = document.createElement("div");
	d.classList.add(cls);
	return d;
}

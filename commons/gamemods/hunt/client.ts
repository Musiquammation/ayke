import {
	CAMERA_FOLLOW,
	CAMERA_HEIGHT,
	CAMERA_LOOK_AHEAD,
	CAMERA_LOOK_MAX,
	CURSOR_ACC_PER_DIST,
	CURSOR_BASE_ACC,
	CURSOR_BASE_SPEED,
	CURSOR_ROTATION,
	CURSOR_SNAP_RADIUS,
	CURSOR_SPEED_PER_DIST,
	GUN_HEIGHT,
	ITEM_MODE_TIMEOUT,
	ITEM_NAMES,
	ITEM_NONE,
	ITEM_SLOTS,
	ITEM_TEXTURES,
	KILLS_TO_WIN,
	LOCK_FAR_GROWTH,
	LOCK_MAX_OFFSET,
	LOCK_OFFSET_SOFTNESS,
	PLAYER_COLORS,
	TEXTURES,
	WEAPONS,
} from "./constants";
import { escapeHTML } from "../../util/escapeHTML";
import { Box, Player } from "./entities";
import type { HuntRenderer } from "./render";
import { AimPoint, HuntState, ranking } from "./simulation";

/* -------------------------------------------------------------------------- */
/* Client-only data: camera, cursor indicator, lock, HUD.                     */
/* Nothing here is shared; it can be lost on a load without any consequence. */
/* -------------------------------------------------------------------------- */

/**
 * Scale factor applied to a point at altitude z by the perspective
 * (the camera looks straight down from CAMERA_HEIGHT).
 */
export function parallaxScale(z: number) {
	return CAMERA_HEIGHT / Math.max(1, CAMERA_HEIGHT - z);
}

/**
 * Project a 3D world point onto the ground plane, as seen by the camera.
 * Higher points are pushed away from the camera center (perspective).
 */
export function project(camX: number, camY: number, x: number, y: number, z: number) {
	const s = parallaxScale(z);
	return { x: camX + (x - camX) * s, y: camY + (y - camY) * s, s };
}

/** Inverse of `project`: the 3D point at altitude z that is drawn at (gx, gy). */
export function unproject(camX: number, camY: number, gx: number, gy: number, z: number) {
	const s = parallaxScale(z);
	return { x: camX + (gx - camX) / s, y: camY + (gy - camY) / s };
}


export class Camera {
	x = 0;
	y = 0;
	private initialized = false;

	/** Smoothly follow a point (instantly on the first call). */
	follow(x: number, y: number, dt: number) {
		if (!this.initialized) {
			this.initialized = true;
			this.x = x;
			this.y = y;
			return;
		}

		const k = 1 - Math.exp(-CAMERA_FOLLOW * dt);
		this.x += (x - this.x) * k;
		this.y += (y - this.y) * k;
	}

	/** Jump to a point (used after a respawn). */
	teleport(x: number, y: number) {
		this.x = x;
		this.y = y;
		this.initialized = true;
	}
}


/** What the cursor indicator (or the lock) is attached to. */
export type EntityRef =
	| { kind: 'player'; idx: number }
	| { kind: 'box'; idx: number };

/** The entity a reference points to (undefined when out of range). */
export function resolveRef(state: HuntState, ref: EntityRef): Player | Box | undefined {
	return ref.kind === 'player' ? state.players[ref.idx] : state.boxes[ref.idx];
}

/** Center of an entity in 3D, or null when it is not on the map anymore. */
export function entityCenter(state: HuntState, ref: EntityRef): AimPoint | null {
	const e = resolveRef(state, ref);
	return e && e.isTargetable() ? e.center() : null;
}

/** Visual size (radius on the ground plane) of an entity, used to size the indicator. */
export function entityRadius(state: HuntState, ref: EntityRef) {
	return resolveRef(state, ref)?.hitRadius() ?? 30;
}

/** True when both references point to the same entity. */
function sameRef(a: EntityRef | null, b: EntityRef | null) {
	return a !== null && b !== null && a.kind === b.kind && a.idx === b.idx;
}


/**
 * The blue indicator (four triangles pointing to the center) following the mouse.
 * It sticks to an entity when the mouse gets close to it. Its max speed and its
 * acceleration grow with the distance to its target, so it catches up quickly
 * from far away and settles gently.
 */
export class Cursor {
	x = 0;
	y = 0;
	vx = 0;
	vy = 0;
	angle = 0;
	size = 26;

	/** Entity under the indicator (null = free, following the mouse). */
	snapped: EntityRef | null = null;

	private initialized = false;

	/**
	 * Find the entity to stick to, then move the indicator toward it (or toward the mouse).
	 * `mouseX/Y` are ground-plane coordinates.
	 */
	update(state: HuntState, selfIdx: number, cam: Camera, mouseX: number, mouseY: number, dt: number) {
		this.snapped = this.findSnap(state, selfIdx, cam, mouseX, mouseY);

		let tx = mouseX;
		let ty = mouseY;
		let size = 26;
		if (this.snapped) {
			const c = entityCenter(state, this.snapped)!;
			const pr = project(cam.x, cam.y, c.x, c.y, c.z);
			tx = pr.x;
			ty = pr.y;
			size = entityRadius(state, this.snapped) * pr.s + 14;
		}

		this.moveToward(tx, ty, dt);
		this.size += (size - this.size) * (1 - Math.exp(-12 * dt));
		this.angle += CURSOR_ROTATION * dt;
	}

	/** Nearest entity whose projected center is close enough to the mouse. */
	private findSnap(state: HuntState, selfIdx: number, cam: Camera, mx: number, my: number): EntityRef | null {
		let best: EntityRef | null = null;
		let bestDist = CURSOR_SNAP_RADIUS;

		const consider = (ref: EntityRef) => {
			const c = entityCenter(state, ref);
			if (!c)
				return;
			const pr = project(cam.x, cam.y, c.x, c.y, c.z);
			const d = Math.hypot(pr.x - mx, pr.y - my);
			if (d < bestDist) {
				bestDist = d;
				best = ref;
			}
		};

		for (let i = 0; i < state.players.length; i++) {
			if (i !== selfIdx)
				consider({ kind: 'player', idx: i });
		}
		for (let i = 0; i < state.boxes.length; i++) {
			consider({ kind: 'box', idx: i });
		}

		return best;
	}

	/** Accelerate toward (tx, ty) with a speed limit and an acceleration depending on the distance. */
	private moveToward(tx: number, ty: number, dt: number) {
		if (!this.initialized) {
			this.initialized = true;
			this.x = tx;
			this.y = ty;
			return;
		}

		const dx = tx - this.x;
		const dy = ty - this.y;
		const dist = Math.hypot(dx, dy);
		if (dist < 0.5) {
			this.x = tx;
			this.y = ty;
			this.vx = 0;
			this.vy = 0;
			return;
		}

		const vmax = CURSOR_BASE_SPEED + CURSOR_SPEED_PER_DIST * dist;
		const acc = CURSOR_BASE_ACC + CURSOR_ACC_PER_DIST * dist;

		// Desired velocity: toward the target, slowing down when close (critically damped feel)
		const wanted = Math.min(vmax, dist * 18);
		const wvx = dx / dist * wanted;
		const wvy = dy / dist * wanted;

		const ax = wvx - this.vx;
		const ay = wvy - this.vy;
		const a = Math.hypot(ax, ay);
		const step = Math.min(a, acc * dt);
		if (a > 0) {
			this.vx += ax / a * step;
			this.vy += ay / a * step;
		}

		// Never overshoot the target
		const mx = this.vx * dt;
		const my = this.vy * dt;
		if (mx * mx + my * my >= dist * dist) {
			this.x = tx;
			this.y = ty;
			this.vx = 0;
			this.vy = 0;
		} else {
			this.x += mx;
			this.y += my;
		}
	}
}


export class ClientData {
	firstFrame = true;

	// Mouse on the ground plane (updated by evalMouseCoords)
	mouseX = 0;
	mouseY = 0;

	readonly camera = new Camera();
	readonly cursor = new Cursor();

	/** Locked entity while shift is held. */
	lock: EntityRef | null = null;
	/** Aim cross (ground-plane coordinates) while locked. */
	crossX = 0;
	crossY = 0;

	// Item selection mode (opened with I)
	itemMode = false;
	itemModeTimer = 0;

	// Last movement sent to the server (to avoid sending the same input twice)
	lastMoveX = 0;
	lastMoveY = 0;

	readonly names: string[] = [];
	readonly colors: string[] = [];

	/** three.js renderer (created on the first drawn frame). */
	renderer: HuntRenderer | null = null;

	private wasAlive = false;

	/* ---------- DOM ---------- */
	readonly html: HTMLDivElement;
	private readonly timeEl: HTMLDivElement;
	private readonly goalEl: HTMLDivElement;
	private readonly boardEl: HTMLDivElement;
	private readonly feedEl: HTMLDivElement;
	private readonly respawnEl: HTMLDivElement;
	private readonly weaponEls: HTMLDivElement[] = [];
	private readonly itemEls: HTMLDivElement[] = [];
	private readonly itemBar: HTMLDivElement;
	private readonly cache = new Map<string, string>();

	constructor(public readonly playerIdx: number) {
		this.html = div("game-hunt-root");

		const top = div("game-hunt-top");
		this.timeEl = div("game-hunt-time");
		this.goalEl = div("game-hunt-goal");
		top.append(this.timeEl, this.goalEl);

		this.boardEl = div("game-hunt-board");
		this.feedEl = div("game-hunt-feed");
		this.respawnEl = div("game-hunt-respawn");

		const weaponBar = div("game-hunt-weapons");
		for (const [i, w] of WEAPONS.entries()) {
			const el = div("game-hunt-weapon");
			const key = div("game-hunt-key");
			key.textContent = String(i + 1);
			const name = div("game-hunt-weapon-name");
			name.textContent = w.name;
			el.append(key, name);
			el.style.borderColor = w.color;
			weaponBar.appendChild(el);
			this.weaponEls.push(el);
		}

		this.itemBar = div("game-hunt-items");
		const itemKey = div("game-hunt-items-key");
		itemKey.textContent = "I";
		this.itemBar.appendChild(itemKey);
		for (let i = 0; i < ITEM_SLOTS; i++) {
			const el = div("game-hunt-item");
			this.itemBar.appendChild(el);
			this.itemEls.push(el);
		}

		const bottom = div("game-hunt-bottom");
		bottom.append(weaponBar, this.itemBar);

		this.html.append(top, this.boardEl, this.feedEl, this.respawnEl, bottom);
	}

	/** Display name of a player. */
	name(idx: number) {
		return this.names[idx] ?? `Player ${idx + 1}`;
	}

	/** Color of a player. */
	color(idx: number) {
		return this.colors[idx] ?? PLAYER_COLORS[idx % PLAYER_COLORS.length];
	}

	/* ---------- Per-frame logic ---------- */

	/** Update the camera, the cursor, the lock and the HUD. Called once per drawn frame. */
	frame(state: HuntState, dt: number) {
		const self = state.players[this.playerIdx];

		this.updateLockValidity(state);
		this.updateCamera(state, self, dt);
		this.cursor.update(state, this.playerIdx, this.camera, this.mouseX, this.mouseY, dt);
		this.updateCross(state);

		if (this.itemMode) {
			this.itemModeTimer -= dt;
			if (this.itemModeTimer <= 0)
				this.itemMode = false;
		}

		this.updateHud(state, self);
	}

	/** Drop the lock when its target died or broke. */
	private updateLockValidity(state: HuntState) {
		if (this.lock && !entityCenter(state, this.lock))
			this.lock = null;
	}

	/**
	 * Follow the locked target. Otherwise follow the local player, shifted a bit
	 * toward the target of the indicator. Teleport after a respawn.
	 */
	private updateCamera(state: HuntState, self: Player, dt: number) {
		const alive = self.isAlive();
		if (alive && !this.wasAlive)
			this.camera.teleport(self.x, self.y);
		this.wasAlive = alive;

		if (this.lock) {
			const c = entityCenter(state, this.lock)!;
			this.camera.follow(c.x, c.y, dt);
			return;
		}

		let ox = (this.cursor.x - self.x) * CAMERA_LOOK_AHEAD;
		let oy = (this.cursor.y - self.y) * CAMERA_LOOK_AHEAD;
		const len = Math.hypot(ox, oy);
		if (len > CAMERA_LOOK_MAX) {
			ox *= CAMERA_LOOK_MAX / len;
			oy *= CAMERA_LOOK_MAX / len;
		}
		this.camera.follow(self.x + ox, self.y + oy, dt);
	}

	/**
	 * Place the aim cross while locked: it starts on the target and moves toward the
	 * mouse. The offset saturates around LOCK_MAX_OFFSET (so the mouse only nudges it),
	 * then keeps growing very slowly when the mouse goes far away.
	 */
	private updateCross(state: HuntState) {
		if (!this.lock)
			return;

		const c = entityCenter(state, this.lock)!;
		const t = project(this.camera.x, this.camera.y, c.x, c.y, c.z);
		const dx = this.mouseX - t.x;
		const dy = this.mouseY - t.y;
		const d = Math.hypot(dx, dy);
		if (d < 1e-3) {
			this.crossX = t.x;
			this.crossY = t.y;
			return;
		}

		const off = LOCK_MAX_OFFSET * Math.tanh(d / LOCK_OFFSET_SOFTNESS) + LOCK_FAR_GROWTH * d;
		this.crossX = t.x + dx / d * off;
		this.crossY = t.y + dy / d * off;
	}

	/** Start a lock on the entity under the indicator (if any). */
	tryLock() {
		if (this.cursor.snapped)
			this.lock = { ...this.cursor.snapped };
	}

	/** True when this entity is the locked one. */
	isLocked(ref: EntityRef) {
		return sameRef(this.lock, ref);
	}

	/**
	 * 3D point the local player is aiming at:
	 * - locked: the target center shifted by the cross offset
	 * - indicator on an entity: that entity's center
	 * - otherwise: the point under the mouse, at the height of the gun (flat shot)
	 */
	aimPoint(state: HuntState): AimPoint {
		const cam = this.camera;
		if (this.lock) {
			const c = entityCenter(state, this.lock)!;
			const at = unproject(cam.x, cam.y, this.crossX, this.crossY, c.z);
			return { x: at.x, y: at.y, z: c.z };
		}

		if (this.cursor.snapped) {
			const c = entityCenter(state, this.cursor.snapped);
			if (c)
				return c;
		}

		const self = state.players[this.playerIdx];
		const z = self.z + GUN_HEIGHT;
		const at = unproject(cam.x, cam.y, this.mouseX, this.mouseY, z);
		return { x: at.x, y: at.y, z };
	}

	/** Open the item selection mode (I), or close it if it is already open. */
	toggleItemMode() {
		this.itemMode = !this.itemMode;
		this.itemModeTimer = ITEM_MODE_TIMEOUT;
	}

	/** Keep the item selection mode open a bit longer (after a wheel move). */
	extendItemMode() {
		this.itemModeTimer = ITEM_MODE_TIMEOUT;
	}

	/* ---------- HUD ---------- */

	/** Update the DOM overlay (only touching elements whose content changed). */
	private updateHud(state: HuntState, self: Player) {
		this.set('time', this.timeEl, formatTime(state.time));
		this.set('goal', this.goalEl, `First to ${KILLS_TO_WIN} kills`);
		this.updateBoard(state);
		this.updateFeed(state);
		this.updateRespawn(self, state);
		this.updateWeapons(self);
		this.updateItems(self);
	}

	private updateBoard(state: HuntState) {
		const html = ranking(state.players).map((idx, rank) => {
			const p = state.players[idx];
			const self = idx === this.playerIdx ? ' game-hunt-self' : '';
			return `<div class="game-hunt-row${self}">` +
				`<span class="game-hunt-rank">${rank + 1}</span>` +
				`<span class="game-hunt-dot" style="background:${this.color(idx)}"></span>` +
				`<span class="game-hunt-name">${escapeHTML(this.name(idx))}</span>` +
				`<span class="game-hunt-kills">${p.kills}</span>` +
				`</div>`;
		}).join('');
		this.setHtml('board', this.boardEl, html);
	}

	private updateFeed(state: HuntState) {
		const html = state.killFeed.map(k => {
			const killer = k.killer >= 0
				? `<span style="color:${this.color(k.killer)}">${escapeHTML(this.name(k.killer))}</span>`
				: '';
			const victim = `<span style="color:${this.color(k.victim)}">${escapeHTML(this.name(k.victim))}</span>`;
			return `<div class="game-hunt-feed-line">${killer} ✖ ${victim}</div>`;
		}).join('');
		this.setHtml('feed', this.feedEl, html);
	}

	private updateRespawn(self: Player, state: HuntState) {
		let text = '';
		if (state.finished)
			text = "Game over";
		else if (!self.isAlive() && self.connected)
			text = `Respawn in ${Math.max(0, self.respawn).toFixed(1)}`;
		this.set('respawn', this.respawnEl, text);
		this.respawnEl.style.display = text ? '' : 'none';
	}

	private updateWeapons(self: Player) {
		for (const [i, el] of this.weaponEls.entries())
			el.classList.toggle('game-hunt-selected', i === self.weapon);
	}

	private updateItems(self: Player) {
		this.itemBar.classList.toggle('game-hunt-item-mode', this.itemMode);
		for (const [i, el] of this.itemEls.entries()) {
			el.classList.toggle('game-hunt-selected', i === self.selectedItem);
			const item = self.items[i];
			this.set(`item${i}`, el, String(item), e => {
				e.innerHTML = item === ITEM_NONE ? `<span class="game-hunt-item-index">${i + 1}</span>` :
					`<img src="${window.IMG_ROOT_PATH}${TEXTURES[ITEM_TEXTURES[item] as keyof typeof TEXTURES]}" ` +
					`alt="" onerror="this.style.display='none'">` +
					`<span class="game-hunt-item-name">${ITEM_NAMES[item]}</span>` +
					`<span class="game-hunt-item-index">${i + 1}</span>`;
			});
		}
	}

	/** Set the text of an element if it changed (or run `apply` instead of setting the text). */
	private set(key: string, el: HTMLElement, value: string, apply?: (el: HTMLElement) => void) {
		if (this.cache.get(key) === value)
			return;
		this.cache.set(key, value);
		if (apply)
			apply(el);
		else
			el.textContent = value;
	}

	private setHtml(key: string, el: HTMLElement, html: string) {
		if (this.cache.get(key) === html)
			return;
		this.cache.set(key, html);
		el.innerHTML = html;
	}
}


/* ---------------------------- Utils ---------------------------- */

function div(className: string) {
	const el = document.createElement("div");
	el.className = className;
	return el;
}

function formatTime(time: number) {
	const t = Math.ceil(time);
	const minutes = Math.floor(t / 60);
	const seconds = t % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

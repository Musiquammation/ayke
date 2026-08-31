import { IMobileController } from "../../../commons/GameMode";

export interface MobileDescriptor {
	joysticks: {[key: string]: {
		x: number,
		y: number,
		color: string // hexa format
	}},

	buttons: {[key: string]: {
		x: number,
		y: number,
		size: number,
		color: string // hexa format
	}}
}

interface ScreenCoordsAdapter {
	evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		clientData: any
	): {x: number, y: number};

	getSize(): ({width: number, height: number});

	getMobileData(): MobileDescriptor | null;
}



class MobileController implements IMobileController {
	private adapter: ScreenCoordsAdapter | null = null;
	private playerIdx = 0;
	private clientData: any = null;

	// Active touch points tracked by their identifier
	private touches: Map<number, { gameX: number; gameY: number; target: string | number }> = new Map();

	// Sets to track the state of inputs (supports both number IDs and string button keys)
	private presses: Set<number | string> = new Set();
	private firsts: Set<number | string> = new Set();
	private kills: Set<number | string> = new Set();

	// Tracks buttons dynamically hidden by the caller
	private hiddenButtons: Set<string> = new Set();

	init() {
		// Bind touch event listeners with passive: false to allow preventing default touch actions
		window.addEventListener("touchstart", this.handleTouchStart, { passive: false });
		window.addEventListener("touchmove", this.handleTouchMove, { passive: false });
		window.addEventListener("touchend", this.handleTouchEnd, { passive: false });
		window.addEventListener("touchcancel", this.handleTouchEnd, { passive: false });
	}

	setScreenCoordsAdapter(
		adapter: ScreenCoordsAdapter | null,
		playerIdx: number,
		clientData: any
	) {
		this.adapter = adapter;
		this.playerIdx = playerIdx;
		this.clientData = clientData;
	}

	// Transforms screen touch coordinates to internal game coordinates
	private getGameCoords(screenX: number, screenY: number): { x: number; y: number } {
		if (!this.adapter) {
			return { x: screenX, y: screenY };
		}

		const { width: gameWidth, height: gameHeight } = this.adapter.getSize();
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;

		const scaleX = screenWidth / gameWidth;
		const scaleY = screenHeight / gameHeight;
		const scale = Math.min(scaleX, scaleY);

		const offsetX = (screenWidth - gameWidth * scale) / 2;
		const offsetY = (screenHeight - gameHeight * scale) / 2;

		const gameX = (screenX - offsetX) / scale;
		const gameY = (screenY - offsetY) / scale;

		return this.adapter.evalMouseCoords(
			gameX,
			gameY,
			this.playerIdx,
			this.clientData
		);
	}

	// Evaluates whether a touch hits an active mobile button or joystick, returning its string key or the touch ID
	private identifyTouchTarget(touchId: number, gameCoords: { x: number; y: number }): string | number {
		if (!this.adapter) return touchId;

		const mobileData = this.adapter.getMobileData();

		// 1. Check virtual UI buttons first
		if (mobileData && mobileData.buttons) {
			for (const [key, btn] of Object.entries(mobileData.buttons)) {
				if (this.hiddenButtons.has(key)) continue;

				const dx = gameCoords.x - btn.x;
				const dy = gameCoords.y - btn.y;
				const distanceSq = dx * dx + dy * dy;
				const radius = btn.size / 2;

				if (distanceSq <= radius * radius) {
					return key;
				}
			}
		}

		// 2. Fall back to numerical touch ID if no UI element was hit
		return touchId;
	}

	// Returns the current positions of all active touches in internal game coordinates
	getDigits(): { x: number; y: number }[] {
		return Array.from(this.touches.values()).map((t) => ({
			x: t.gameX,
			y: t.gameY,
		}));
	}

	first(button: number | string): boolean {
		return this.firsts.has(button);
	}

	press(button: number | string): boolean {
		return this.presses.has(button);
	}

	killed(button: number | string): boolean {
		return this.kills.has(button);
	}

	showButton(button: string): void {
		this.hiddenButtons.delete(button);
	}

	hideButton(button: string): void {
		this.hiddenButtons.add(button);
	}

	frame() {
		// Clear frame-specific input states
		this.firsts.clear();
		this.kills.clear();
	}

	destroy() {
		window.removeEventListener("touchstart", this.handleTouchStart);
		window.removeEventListener("touchmove", this.handleTouchMove);
		window.removeEventListener("touchend", this.handleTouchEnd);
		window.removeEventListener("touchcancel", this.handleTouchEnd);
	}

	// --- Event Handlers ---

	private handleTouchStart = (e: TouchEvent) => {
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch = e.changedTouches[i];
			const coords = this.getGameCoords(touch.clientX, touch.clientY);
			const target = this.identifyTouchTarget(touch.identifier, coords);

			this.touches.set(touch.identifier, {
				gameX: coords.x,
				gameY: coords.y,
				target: target,
			});

			if (!this.presses.has(target)) {
				this.firsts.add(target);
			}
			this.presses.add(target);
		}
	};

	private handleTouchMove = (e: TouchEvent) => {
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch = e.changedTouches[i];
			const existing = this.touches.get(touch.identifier);

			if (existing) {
				const coords = this.getGameCoords(touch.clientX, touch.clientY);
				existing.gameX = coords.x;
				existing.gameY = coords.y;
			}
		}
	};

	private handleTouchEnd = (e: TouchEvent) => {
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch = e.changedTouches[i];
			const existing = this.touches.get(touch.identifier);

			if (existing) {
				const target = existing.target;
				this.presses.delete(target);
				this.kills.add(target);
				this.touches.delete(touch.identifier);
			}
		}
	};
}

export const mobileController = new MobileController();
mobileController.init();

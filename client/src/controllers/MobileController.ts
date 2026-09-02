import type { IMobileController } from "../../../commons/GameMode";

export interface MobileDescriptor {
	joysticks: {
		[key: string]: {
			x: number;
			xp: 'left' | 'right' | 'ratio';
			y: number;
			yp: 'top' | 'bottom' | 'ratio';
			size: number; // in pixels
			color: string;
		};
	};

	buttons: {
		[key: string]: {
			x: number;
			xp: 'left' | 'right' | 'ratio';
			y: number;
			yp: 'top' | 'bottom' | 'ratio';
			size: number; // in pixels
			color: string; // Hex format
		};
	};
}

interface ScreenCoordsAdapter {
	evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		clientData: any
	): { x: number; y: number };

	getSize(): { width: number; height: number };

	getMobileDesc(): MobileDescriptor | null;
}

interface TouchInfo {
	screenX: number;
	screenY: number;
	gameX: number;
	gameY: number;
	target: string | number;
}

export class MobileController implements IMobileController {
	private adapter: ScreenCoordsAdapter | null = null;
	private playerIdx = 0;
	private clientData: any = null;

	// Active touch tracking
	private touches: Map<number, TouchInfo> = new Map();

	// Sets to track digital states (press/first/kill)
	private presses: Set<number | string> = new Set();
	private firsts: Set<number | string> = new Set();
	private kills: Set<number | string> = new Set();

	// Joystick offset state map: key -> { x: -1 to 1, y: -1 to 1 }
	private joystickValues: Map<string, { x: number; y: number }> = new Map();

	// Dynamic UI visibility control
	private hiddenButtons: Set<string> = new Set();

	init() {
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

	// Helper to resolve anchored coordinates to absolute screen pixels
	private resolveJoyPosition(
		el: { x: number; xp: string; y: number; yp: string; size: number },
		screenWidth: number,
		screenHeight: number
	): { centerX: number; centerY: number; radius: number } {
		let centerX = 0;
		if (el.xp === 'right') {
			centerX = screenWidth - el.x;
		} else if (el.xp === 'ratio') {
			centerX = el.x * screenWidth;
		} else { // 'left'
			centerX = el.x;
		}

		let centerY = 0;
		if (el.yp === 'bottom') {
			centerY = screenHeight - el.y;
		} else if (el.yp === 'ratio') {
			centerY = el.y * screenHeight;
		} else { // 'top'
			centerY = el.y;
		}

		return { centerX, centerY, radius: el.size / 2 };
	}

	private resolveBtnPosition(
		el: { x: number; xp: string; y: number; yp: string; size: number },
		screenWidth: number,
		screenHeight: number
	): { centerX: number; centerY: number; size: number } {
		let centerX = 0;
		if (el.xp === 'right') {
			centerX = screenWidth - el.x;
		} else if (el.xp === 'ratio') {
			centerX = el.x * screenWidth;
		} else { // 'left'
			centerX = el.x;
		}

		let centerY = 0;
		if (el.yp === 'bottom') {
			centerY = screenHeight - el.y;
		} else if (el.yp === 'ratio') {
			centerY = el.y * screenHeight;
		} else { // 'top'
			centerY = el.y;
		}

		return { centerX, centerY, size: el.size };
	}

	// Transform screen coordinates to internal game coordinates via scale & letterbox logic
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

	// Evaluates screen touches against absolute bounds for buttons and joysticks
	private identifyTouchTarget(touchId: number, screenX: number, screenY: number): string | number {
		if (!this.adapter) return touchId;

		const mobileData = this.adapter.getMobileDesc();
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;

		// 1. Check UI Buttons
		if (mobileData && mobileData.buttons) {
			for (const [key, btn] of Object.entries(mobileData.buttons)) {
				if (this.hiddenButtons.has(key)) continue;

				const { centerX, centerY, size } = this.resolveBtnPosition(
					btn,
					screenWidth,
					screenHeight
				);

				const halfSize = size / 2;

				if (
					screenX >= centerX - halfSize &&
					screenX <= centerX + halfSize &&
					screenY >= centerY - halfSize &&
					screenY <= centerY + halfSize
				) {
					return key;
				}
			}
		}

		// 2. Check UI Joysticks
		if (mobileData && mobileData.joysticks) {
			for (const [key, joy] of Object.entries(mobileData.joysticks)) {
				if (this.hiddenButtons.has(key)) continue;

				const { centerX, centerY, radius } = this.resolveJoyPosition(joy, screenWidth, screenHeight);
				const dx = screenX - centerX;
				const dy = screenY - centerY;

				if (dx * dx + dy * dy <= radius * radius) {
					return key;
				}
			}
		}

		// 3. Fallback to raw numeric Touch ID if no interactive UI hit
		return touchId;
	}

	// Update normalized vector (-1.0 to 1.0) for active joysticks
	private updateJoystickValues() {
		if (!this.adapter) return;

		const mobileData = this.adapter.getMobileDesc();
		if (!mobileData || !mobileData.joysticks) return;

		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;

		// Reset all joysticks to neutral (0,0) before updating from active touches
		for (const key of Object.keys(mobileData.joysticks)) {
			this.joystickValues.set(key, { x: 0, y: 0 });
		}

		// Calculate displacement for joysticks currently bound to a touch
		for (const touch of this.touches.values()) {
			if (typeof touch.target === "string" && mobileData.joysticks[touch.target]) {
				const joyKey = touch.target;
				const joy = mobileData.joysticks[joyKey];

				const { centerX, centerY, radius: maxRadius } = this.resolveJoyPosition(joy, screenWidth, screenHeight);

				const dx = touch.screenX - centerX;
				const dy = touch.screenY - centerY;
				const distance = Math.sqrt(dx * dx + dy * dy);

				if (distance === 0) {
					this.joystickValues.set(joyKey, { x: 0, y: 0 });
				} else {
					const clampDist = Math.min(distance, maxRadius);
					const normX = (dx / distance) * (clampDist / maxRadius);
					const normY = (dy / distance) * (clampDist / maxRadius);
					this.joystickValues.set(joyKey, { x: normX, y: normY });
				}
			}
		}
	}

	// Public getter for joystick axes value
	getJoystick(name: string): { x: number; y: number } {
		return this.joystickValues.get(name) || { x: 0, y: 0 };
	}

	// Render overlay UI directly on the full-screen canvas context
	draw(ctx: CanvasRenderingContext2D) {
		if (!this.adapter) return;

		const mobileData = this.adapter.getMobileDesc();
		if (!mobileData) return;

		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;

		ctx.save();

		// 1. Draw Joysticks
		if (mobileData.joysticks) {
			for (const [key, joy] of Object.entries(mobileData.joysticks)) {
				if (this.hiddenButtons.has(key)) continue;

				const { centerX, centerY, radius } = this.resolveJoyPosition(joy, screenWidth, screenHeight);
				const values = this.getJoystick(key);

				// Outer Ring / Base
				ctx.beginPath();
				ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
				ctx.fillStyle = joy.color + "33"; // 20% opacity background
				ctx.fill();
				ctx.lineWidth = 3;
				ctx.strokeStyle = joy.color;
				ctx.stroke();

				// Inner Stick / Knob
				const knobX = centerX + values.x * radius;
				const knobY = centerY + values.y * radius;
				const knobRadius = radius * 0.4;

				ctx.beginPath();
				ctx.arc(knobX, knobY, knobRadius, 0, Math.PI * 2);
				ctx.fillStyle = joy.color;
				ctx.fill();
			}
		}

		// 2. Draw Buttons
		if (mobileData.buttons) {
			for (const [key, btn] of Object.entries(mobileData.buttons)) {
				if (this.hiddenButtons.has(key)) continue;

				const { centerX, centerY, size } = this.resolveBtnPosition(
					btn,
					screenWidth,
					screenHeight
				);

				const isPressed = this.press(key);

				const halfSize = size / 2;
				const radius = size * 0.2;

				ctx.beginPath();
				ctx.roundRect(
					centerX - halfSize,
					centerY - halfSize,
					size,
					size,
					radius
				);

				ctx.fillStyle = isPressed ? btn.color : btn.color + "66";
				ctx.fill();

				ctx.lineWidth = 2;
				ctx.strokeStyle = "#FFFFFF";
				ctx.stroke();

				// Button Label
				ctx.fillStyle = "#FFFFFF";
				ctx.font = `bold ${Math.round(size * 0.3)}px sans-serif`;
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(key.toUpperCase(), centerX, centerY);
			}
		}

		ctx.restore();
	}

	getDigits(): { x: number; y: number, id: number }[] {
		return Array.from(this.touches.values())
			.filter((touch) => typeof touch.target === "number")
			.map((touch) => ({
				x: touch.gameX,
				y: touch.gameY,
				id: touch.target as number
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
		this.firsts.clear();
		this.kills.clear();
	}

	destroy() {
		window.removeEventListener("touchstart", this.handleTouchStart);
		window.removeEventListener("touchmove", this.handleTouchMove);
		window.removeEventListener("touchend", this.handleTouchEnd);
		window.removeEventListener("touchcancel", this.handleTouchEnd);
	}

	// --- Touch Event Handlers ---

	private handleTouchStart = (e: TouchEvent) => {
		e.preventDefault();
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch = e.changedTouches[i];
			const screenX = touch.clientX;
			const screenY = touch.clientY;
			const coords = this.getGameCoords(screenX, screenY);
			const target = this.identifyTouchTarget(touch.identifier, screenX, screenY);

			this.touches.set(touch.identifier, {
				screenX,
				screenY,
				gameX: coords.x,
				gameY: coords.y,
				target,
			});

			if (!this.presses.has(target)) {
				this.firsts.add(target);
			}
			this.presses.add(target);
		}
		this.updateJoystickValues();
	};

	private handleTouchMove = (e: TouchEvent) => {
		e.preventDefault();
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch = e.changedTouches[i];
			const existing = this.touches.get(touch.identifier);

			if (existing) {
				const screenX = touch.clientX;
				const screenY = touch.clientY;
				const coords = this.getGameCoords(screenX, screenY);

				existing.screenX = screenX;
				existing.screenY = screenY;
				existing.gameX = coords.x;
				existing.gameY = coords.y;
			}
		}
		this.updateJoystickValues();
	};

	private handleTouchEnd = (e: TouchEvent) => {
		e.preventDefault();
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
		this.updateJoystickValues();
	};
}

export const mobileController = new MobileController();
mobileController.init();

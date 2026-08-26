import { IMouseController } from "../../../commons/GameMode";

interface ScreenCoordsAdapter {
	evalMouseCoords(x: number, y: number): {x: number, y: number};
}

export class MouseController implements IMouseController {
	private adapter: ScreenCoordsAdapter | null = null;

	// Raw mouse coordinates on the screen
	private rawX: number = 0;
	private rawY: number = 0;

	// Sets to track the state of each mouse button
	private presses: Set<number> = new Set();
	private firsts: Set<number> = new Set();
	private kills: Set<number> = new Set();

	init() {
		// Bind event listeners. Using arrow functions to preserve the 'this' context.
		window.addEventListener("mousemove", this.handleMouseMove);
		window.addEventListener("mousedown", this.handleMouseDown);
		window.addEventListener("mouseup", this.handleMouseUp);
	}

	setScreenCoordsAdapter(adapter: ScreenCoordsAdapter | null) {
		this.adapter = adapter;
	}

	// Helper method to compute coordinates using the adapter if available
	getCoords(): { x: number; y: number } {
		if (this.adapter) {
			return this.adapter.evalMouseCoords(this.rawX, this.rawY);
		}
		return { x: this.rawX, y: this.rawY };
	}

	first(button: number): boolean {
		// Returns true only during the frame the button was initially pressed
		return this.firsts.has(button);
	}

	press(button: number): boolean {
		// Returns true as long as the button is held down
		return this.presses.has(button);
	}

	killed(button: number): boolean {
		// Returns true only during the frame the button was released
		return this.kills.has(button);
	}

	frame() {
		// Clear "just pressed" and "just released" states for the next frame
		this.firsts.clear();
		this.kills.clear();
	}

	// Clean up method to avoid memory leaks (optional but highly recommended)
	destroy() {
		window.removeEventListener("mousemove", this.handleMouseMove);
		window.removeEventListener("mousedown", this.handleMouseDown);
		window.removeEventListener("mouseup", this.handleMouseUp);
	}

	// --- Event Handlers ---

	private handleMouseMove = (e: MouseEvent) => {
		this.rawX = e.clientX;
		this.rawY = e.clientY;
	};

	private handleMouseDown = (e: MouseEvent) => {
		const button = e.button;
		// If the button wasn't already pressed, it's the first time
		if (!this.presses.has(button)) {
			this.firsts.add(button);
		}
		this.presses.add(button);
	};

	private handleMouseUp = (e: MouseEvent) => {
		const button = e.button;
		this.presses.delete(button);
		this.kills.add(button);
	};
}


export const mouseController = new MouseController();
mouseController.init();



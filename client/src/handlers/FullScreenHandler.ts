import { getMobile } from "../getMobile"

class FullScreenHandler {
	private ownsFullscreen = false;

	constructor() {
		document.addEventListener("fullscreenchange", () => {
			// The user exited fullscreen manually.
			if (!document.fullscreenElement) {
				this.ownsFullscreen = false;
			}
		});
	}

	async openFull(orientation: 'landscape' | 'portrait' | null): Promise<void> {
		if (orientation !== null) {
			const imobile = await getMobile();
			if (imobile) {
				await imobile.setScreenOrientation(orientation);
			}
		}

		// Fullscreen is already active, so it was not opened by this handler.
		if (document.fullscreenElement) {
			this.ownsFullscreen = false;
			return;
		}

		try {
			await document.documentElement.requestFullscreen();
			this.ownsFullscreen = true;
		} catch (error) {
			console.error("Failed to enter fullscreen:", error);
			this.ownsFullscreen = false;
		}
	}

	async closeFull(): Promise<void> {
		const imobile = await getMobile();
		if (imobile) {
			await imobile.setScreenOrientation('portrait');
		}
		
		// Do nothing if this handler does not own the fullscreen state.
		if (!this.ownsFullscreen) {
			return;
		}

		// The user may have exited fullscreen since openFull() was called.
		if (!document.fullscreenElement) {
			this.ownsFullscreen = false;
			return;
		}

		try {
			await document.exitFullscreen();
			this.ownsFullscreen = false;
		} catch (error) {
			console.error("Failed to exit fullscreen:", error);
		}
	}
}


export const fullScreenHandler = new FullScreenHandler();


console.log(fullScreenHandler);
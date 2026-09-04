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

	async openFull(): Promise<void> {
		// Fullscreen is already active, so it was not opened by this handler.
		if (document.fullscreenElement) {
			this.ownsFullscreen = false;
			return;
		}

		await document.documentElement.requestFullscreen();
		this.ownsFullscreen = true;
	}

	async closeFull(): Promise<void> {
		// Do nothing if this handler does not own the fullscreen state.
		if (!this.ownsFullscreen) {
			return;
		}

		// The user may have exited fullscreen since openFull() was called.
		if (!document.fullscreenElement) {
			this.ownsFullscreen = false;
			return;
		}

		await document.exitFullscreen();
		this.ownsFullscreen = false;
	}
}


export const fullScreenHandler = new FullScreenHandler();


console.log(fullScreenHandler);
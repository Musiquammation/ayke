declare global {
	interface Window {
		IMG_ROOT_PATH: string;
	}
}

function getFile(name: string) {
	return `${window.IMG_ROOT_PATH}/css-games/${name}.css`;
}

class DynamicCssHandler {
	private loaded = new Set<string>();

	async load(name: string): Promise<void> {
		if (this.loaded.has(name)) {
			return;
		}

		const href = getFile(name);

		// Also checks whether the stylesheet has already been loaded
		// elsewhere before the handler is initialized.
		const existing = document.querySelector<HTMLLinkElement>(
			`link[rel="stylesheet"][href="${href}"]`
		);

		if (existing) {
			this.loaded.add(name);
			return;
		}

		await new Promise<void>((resolve, reject) => {
			const link = document.createElement("link");

			link.rel = "stylesheet";
			link.href = href;

			link.onload = () => {
				this.loaded.add(name);
				resolve();
			};

			link.onerror = () => {
				reject(new Error(`Failed to load CSS: ${href}`));
			};

			document.head.appendChild(link);
		});
	}
}

export const dynamicCssHandler = new DynamicCssHandler();

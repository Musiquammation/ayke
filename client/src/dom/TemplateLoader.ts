declare global {
	interface Window {
		IMG_ROOT_PATH: string;
	}
}

export class TemplateLoader {
	private cache = new Map<string, string>();

	async load(name: string): Promise<string> {
		const cached = this.cache.get(name);

		if (cached !== undefined) {
			return cached;
		}

		const response = await fetch(window.IMG_ROOT_PATH + `/game-panels/${name}.html`);

		if (!response.ok) {
			throw new Error(
				`Failed to load template "${name}": ${response.status} ${response.statusText}`
			);
		}

		const template = await response.text();

		this.cache.set(name, template);

		return template;
	}

	clear(name?: string) {
		if (name === undefined) {
			this.cache.clear();
		} else {
			this.cache.delete(name);
		}
	}
}

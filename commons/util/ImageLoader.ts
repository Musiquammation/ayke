interface ColorRule { prev: string; next: string };

export class ImageLoader {
	private loadedCount = 0;
	private totalCount = 0;
	private placeholder: HTMLCanvasElement;
	private pathRoot: string;

	// Stores the raw, unmodified images
	private baseImages: { [imageName: string]: HTMLImageElement } = {};
	
	// Stores the colored versions, accessed by imageName and then by colorId
	private coloredImages: { [imageName: string]: { [colorId: number]: HTMLCanvasElement } } = {};
	
	// Registry of rules to apply, accessed by imageName and then by colorId
	private colorRules: { [imageName: string]: { [colorId: number]: ColorRule[] } } = {};

	constructor(pathRoot: string) {
		this.pathRoot = pathRoot;

		// Create missing texture placeholder (checkerboard pattern)
		const size = 2;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d')!;
		ctx.imageSmoothingEnabled = false;

		ctx.fillStyle = 'violet';
		ctx.fillRect(0, 0, size / 2, size / 2);
		ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
		ctx.fillStyle = 'white';
		ctx.fillRect(size / 2, 0, size / 2, size / 2);
		ctx.fillRect(0, size / 2, size / 2, size / 2);
		this.placeholder = canvas;
	}

	/**
	 * Converts a hex color string (#RRGGBB or RRGGBB) to RGB components.
	 */
	private hexToRgb(hex: string): [number, number, number] {
		const clean = hex.replace('#', '');
		const r = parseInt(clean.substring(0, 2), 16);
		const g = parseInt(clean.substring(2, 4), 16);
		const b = parseInt(clean.substring(4, 6), 16);
		return [r, g, b];
	}

	/**
	 * Replaces colors in an image based on an array of color rules.
	 */
	private recolorImage(img: HTMLImageElement, rules: ColorRule[]): HTMLCanvasElement {
		const canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		const ctx = canvas.getContext('2d')!;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(img, 0, 0);

		// Pre-compute RGB values for faster pixel iteration
		const parsedRules = rules.map(rule => ({
			prev: this.hexToRgb(rule.prev),
			next: this.hexToRgb(rule.next)
		}));

		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const data = imageData.data;

		for (let i = 0; i < data.length; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];

			for (const rule of parsedRules) {
				if (r === rule.prev[0] && g === rule.prev[1] && b === rule.prev[2]) {
					data[i] = rule.next[0];
					data[i + 1] = rule.next[1];
					data[i + 2] = rule.next[2];
					break; // Once a pixel is recolored by a rule, move to the next pixel
				}
			}
		}

		ctx.putImageData(imageData, 0, 0);
		return canvas;
	}

	/**
	 * Internal helper to generate and cache a colored version of an image.
	 */
	private generateColoredVersion(name: string, id: number) {
		const img = this.baseImages[name];
		const rules = this.colorRules[name][id];
		
		if (!img || !rules) return;

		const canvas = this.recolorImage(img, rules);
		
		if (!this.coloredImages[name]) {
			this.coloredImages[name] = {};
		}
		
		this.coloredImages[name][id] = canvas;
	}

	/**
	 * Registers a coloring rule for a specific texture. 
	 * Applies immediately to already loaded textures, and queues for future ones.
	 */
	setColorRule(name: string, id: number, rules: ColorRule[]): void {
		if (!this.colorRules[name]) {
			this.colorRules[name] = {};
		}
		this.colorRules[name][id] = rules;

		// If the base image is already loaded, apply the rule right away (old textures)
		if (this.baseImages[name]) {
			this.generateColoredVersion(name, id);
		}
	}

	/**
	 * Loads base images asynchronously and applies any pending color rules.
	 */
	async load(list: { [key: string]: string }): Promise<void> {
		this.totalCount += Object.keys(list).length;

		const promises: Promise<void>[] = [];

		for (const [name, path] of Object.entries(list)) {
			const p = (async () => {
				try {
					const res = await fetch(this.pathRoot + path);
					if (!res.ok) throw new Error('Failed to fetch ' + path);
					const blob = await res.blob();

					const img = await new Promise<HTMLImageElement>((resolve, reject) => {
						const i = new Image();
						i.onload = () => resolve(i);
						i.onerror = e => reject(e);
						i.src = URL.createObjectURL(blob);
					});

					// Store the raw base image
					this.baseImages[name] = img;

					// Apply any rules that were registered before the image finished loading (new textures)
					if (this.colorRules[name]) {
						for (const idStr of Object.keys(this.colorRules[name])) {
							const id = parseInt(idStr, 10);
							this.generateColoredVersion(name, id);
						}
					}

					this.loadedCount++;

				} catch (err) {
					console.warn("Error with:", path);
					console.error(err);
					this.loadedCount++;
				}
			})();

			promises.push(p);
		}

		await Promise.all(promises);
	}

	isLoaded(): boolean {
		return this.loadedCount === this.totalCount && this.totalCount > 0;
	}

	/**
	 * Retrieves an image or canvas texture.
	 * @param name - The asset key identifier.
	 * @param colorId - The numeric ID of the color rule to apply.
	 */
	get(name: string | null, colorId?: number): HTMLCanvasElement | HTMLImageElement {
		if (name === null) return this.placeholder;

		// Return a colored version if an ID is provided
		if (colorId !== undefined) {
			if (this.coloredImages[name] && this.coloredImages[name][colorId]) {
				return this.coloredImages[name][colorId];
			}
			return this.placeholder;
		}

		// Return the default raw image if no color ID is requested
		if (this.baseImages[name]) {
			return this.baseImages[name];
		}

		return this.placeholder;
	}

	/**
	 * Formats the cached data into a folder structure for external use if needed.
	 */
	getFolders() {
		return {
			default: this.baseImages,
			colored: this.coloredImages
		};
	}
}
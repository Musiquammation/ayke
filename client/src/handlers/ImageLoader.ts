export class ImageLoader {
	private folders: { [folderName: string]: { [imageName: string]: (HTMLImageElement | HTMLCanvasElement)[] } } = {};
	private loadedCount = 0;
	private totalCount = 0;
	private placeholder: HTMLCanvasElement;
	private pathRoot: string;

	constructor(pathRoot: string) {
		this.pathRoot = pathRoot;

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

	private hexToRgb(hex: string): [number, number, number] {
		const clean = hex.replace('#', '');
		const r = parseInt(clean.substring(0, 2), 16);
		const g = parseInt(clean.substring(2, 4), 16);
		const b = parseInt(clean.substring(4, 6), 16);
		return [r, g, b];
	}

	private recolorImage(img: HTMLImageElement, checked: string, target: string): HTMLCanvasElement {
		const canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		const ctx = canvas.getContext('2d')!;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(img, 0, 0);

		const [cr, cg, cb] = this.hexToRgb(checked);
		const [tr, tg, tb] = this.hexToRgb(target);

		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const data = imageData.data;

		for (let i = 0; i < data.length; i += 4) {
			if (data[i] === cr && data[i + 1] === cg && data[i + 2] === cb) {
				data[i] = tr;
				data[i + 1] = tg;
				data[i + 2] = tb;
			}
		}

		ctx.putImageData(imageData, 0, 0);
		return canvas;
	}

	async load(list: { [key: string]: string }): Promise<void> {
		this.totalCount = Object.keys(list).length;
		this.loadedCount = 0;

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

					if (!this.folders['default'])
						this.folders['default'] = {};

					if (!this.folders['default'][name])
						this.folders['default'][name] = [];

					this.folders['default'][name].push(img);
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

	async loadWithColors(
		checked: string,
		colors: string[],
		list: { [key: string]: string }
	): Promise<void> {
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

					if (!this.folders['colored'])
						this.folders['colored'] = {};

					if (!this.folders['colored'][name])
						this.folders['colored'][name] = [];

					for (const color of colors) {
						const recolored = this.recolorImage(img, checked, color);
						this.folders['colored'][name].push(recolored);
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
		return this.loadedCount === this.totalCount;
	}

	get(name: string | null, color = -1): HTMLCanvasElement | HTMLImageElement {
		if (name === null)
			return this.placeholder;
		
		if (color >= 0) {
			const folder = this.folders['colored'];
			if (folder && folder[name] && folder[name][color] !== undefined)
				return folder[name][color] as HTMLCanvasElement;
			return this.placeholder;
		}

		const folder = this.folders['default'];
		if (folder && folder[name] && folder[name][0])
			return folder[name][0];
		return this.placeholder;
	}

	getFolders() {
		return this.folders;
	}
}

declare global {
	interface Window {
		IMG_ROOT_PATH: string
	}
}
export function getImageRootPath(): string {
    return window.IMG_ROOT_PATH;
}

import { ImageLoader } from "../../../commons/util/ImageLoader"

declare global {
	interface Window {
		IMG_ROOT_PATH: string;
	}
}


export const imageLoader = new ImageLoader(window.IMG_ROOT_PATH);

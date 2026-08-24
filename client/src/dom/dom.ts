import Alpine from "alpinejs";

declare global {
	interface Window {
		Alpine: any;
	}
}

class MainComponent {
	private currentPage = "index";

	uses(page: string) {
		return this.currentPage === page;
	}

	loadIndex() {
		this.currentPage = "index";
	}

	loadTest() {
		this.currentPage = "test";
	}
}

export const dom = Alpine.reactive(new MainComponent());



export function initDom() {
	document.addEventListener("alpine:init", () => {
		Alpine.data("main", () => dom);
	});
	window.Alpine = Alpine;
	Alpine.start();
}


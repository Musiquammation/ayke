import Alpine from "alpinejs";

declare global {
	interface Window {
		Alpine: any;
		dom: MainComponent;
	}
}

class MainComponent {
	private currentPage = "index";

	// test data
	y0 = 0;
	y1 = 0;

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
	window.dom = dom;
	Alpine.start();
}


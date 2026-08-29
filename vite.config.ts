import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
	if (command === "serve") {
		return {
			root: "client"
		};
	}

	return {
		build: {
			outDir: "dist",
			emptyOutDir: true,
			minify: false,

			rollupOptions: {
				input: "client/src/index.ts",
				preserveEntrySignatures: "strict",

				output: {
					entryFileNames: "bundle.js",
					format: "es",
					assetFileNames: "[name][extname]"
				}
			}
		}
	};
});
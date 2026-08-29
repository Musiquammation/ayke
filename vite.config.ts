import { defineConfig } from "vite";

export default defineConfig({
	root: "client",

	build: {
		outDir: "../dist",
		emptyOutDir: true,
		minify: false,

		rollupOptions: {
			input: "src/index.ts",

			output: {
				entryFileNames: "bundle.js",
				format: "es",
				assetFileNames: "[name][extname]"
			}
		}
	}
});

import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist",
		emptyOutDir: true,
		minify: false,

		rollupOptions: {
			input: "client/src/index.ts",

			output: {
				entryFileNames: "bundle.js",
				format: "es",
				assetFileNames: "[name][extname]"
			}
		}
	}
});
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	root: "client",
	base: "./",
	server: {
		port: 5173
	},
	build: {
		outDir: "../dist",
		emptyOutDir: true,
		minify: false,
		rollupOptions: {
			input: resolve(import.meta.dirname, "client/index.ts"),
			output: {
				entryFileNames: "bundle.js",
				format: "es"
			}
		}
	}
});
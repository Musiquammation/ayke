import { defineConfig } from "vite";

export default defineConfig(({ command, mode }) => {
	if (command === "serve") {
		return {
			root: "client"
		};
	}

	if (mode === "bundle") {
		return {
			root: "client",

			build: {
				outDir: "dist",
				emptyOutDir: true,
				minify: false,

				rollupOptions: {
					input: "src/index.ts",
					preserveEntrySignatures: "strict",

					output: {
						entryFileNames: "bundle.js",
						format: "es",
						assetFileNames: "[name][extname]"
					}
				}
			}
		};
	}

	return {
		root: "client",

		build: {
			outDir: "dist",
			emptyOutDir: true,
			minify: false
		}
	};
});

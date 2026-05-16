import tsparser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"wdio.demo.conf.mjs",
		"obsidian-tests/**/*.mjs",
		"package.json",
		"package-lock.json",
		"vitest.config.ts",
	]),
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.json" },
		},
	},
	{
		files: ["src/__tests__/**/*.ts"],
		rules: {
			"@typescript-eslint/no-extraneous-class": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/array-type": "off",
		},
	},
]);

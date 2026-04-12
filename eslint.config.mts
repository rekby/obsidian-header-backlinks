import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json',
						'vitest.config.ts',
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
		extends: [
			...tseslint.configs.strictTypeChecked,
			...tseslint.configs.stylisticTypeChecked,
		],
		rules: {
			"@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/__tests__/**/*.ts"],
		rules: {
			"@typescript-eslint/no-extraneous-class": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/array-type": "off",
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);

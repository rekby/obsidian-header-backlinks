import path from "node:path";
import process from "node:process";
import os from "node:os";
import fs from "node:fs/promises";
import ObsidianLauncher from "obsidian-launcher";

const cacheDir = path.resolve(".obsidian-cache");
const obsidianVersion = process.env.OBSIDIAN_TEST_VERSION ?? "earliest";
const installerVersion = process.env.OBSIDIAN_INSTALLER_VERSION ?? "earliest";

/**
 * The service always copies the source vault to a tmpdir suffixed with a random
 * hash (e.g. `demo-vault-0CQYIH`), and Obsidian uses that directory name as the
 * displayed vault name. We patch the launcher so the copy goes to a stable path
 * — that way Obsidian renders `plugin-demo-vault` from the very first frame,
 * with no flash of a random name before tests get a chance to rewrite it.
 *
 * Safe with maxInstances=1: each spec is one session, the service rm's the
 * tmpDir on session end, and our wrapper recreates it on the next session.
 */
const STABLE_VAULT_DIR = path.join(os.tmpdir(), "plugin-demo-vault");
if (!ObsidianLauncher.prototype.__demoSetupVaultPatched) {
	const origSetupVault = ObsidianLauncher.prototype.setupVault;
	ObsidianLauncher.prototype.setupVault = async function patchedSetupVault(params) {
		if (!params.copy) return origSetupVault.call(this, params);
		await fs.rm(STABLE_VAULT_DIR, { recursive: true, force: true });
		await fs.cp(params.vault, STABLE_VAULT_DIR, {
			recursive: true,
			preserveTimestamps: true,
		});
		return origSetupVault.call(this, {
			...params,
			vault: STABLE_VAULT_DIR,
			copy: false,
		});
	};
	ObsidianLauncher.prototype.__demoSetupVaultPatched = true;
}

export const config = {
	runner: "local",
	framework: "mocha",
	specs: ["./obsidian-tests/demo/demo.e2e.mjs"],
	maxInstances: 1,
	capabilities: [
		{
			browserName: "obsidian",
			browserVersion: obsidianVersion,
			"wdio:obsidianOptions": {
				installerVersion,
				plugins: ["."],
				vault: "./obsidian-tests/demo-vault",
			},
			"goog:chromeOptions": {
				args: [
					"--force-device-scale-factor=1",
					"--disable-lcd-text",
					"--font-render-hinting=none",
				],
			},
		},
	],
	services: ["obsidian"],
	reporters: ["obsidian"],
	mochaOpts: {
		ui: "bdd",
		timeout: 180000,
	},
	waitforInterval: 50,
	waitforTimeout: 1000,
	logLevel: "info",
	injectGlobals: false,
	cacheDir,
};

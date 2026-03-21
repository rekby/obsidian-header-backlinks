/* global describe, it, afterEach, after */

import path from "node:path";
import { browser } from "@wdio/globals";
import {
	prepareDemoScenario,
	saveAppScreenshot,
	openBacklinkMenuForDemo,
	dismissOpenUi,
	debugLog,
} from "./demo-helpers.mjs";

const VAULT = "./obsidian-tests/demo-vault";

afterEach(async () => {
	await dismissOpenUi();
});

function screenshotPath(name) {
	return path.resolve("docs/demo", `${name}.png`);
}

describe("Handle Header Link README screenshots", function () {
	after(async () => {
		await debugLog(
			"readme-screenshots.e2e.mjs:after",
			"suite finished (before WebDriver session end)",
			{},
			"H3",
		);
	});

	it("captures anchor icons screenshot", async () => {
		await prepareDemoScenario({
			vault: VAULT,
			startFile: "Project roadmap.md",
		});

		await browser.pause(800);
		await saveAppScreenshot(screenshotPath("anchor-icons"));
	});

	it("captures context menu screenshot", async () => {
		await prepareDemoScenario({
			vault: VAULT,
			startFile: "Project roadmap.md",
		});

		await openBacklinkMenuForDemo("Q1 goals");
		await browser.pause(400);
		await saveAppScreenshot(screenshotPath("context-menu"));
	});
});

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

const VAULT = "./obsidian-tests/demo-vault-ru";

afterEach(async () => {
	await dismissOpenUi();
});

function screenshotPath(name) {
	return path.resolve("docs/demo/ru", `${name}.png`);
}

describe("Handle Header Link README screenshots (Russian)", function () {
	after(async () => {
		await debugLog(
			"readme-screenshots-ru.e2e.mjs:after",
			"suite finished (before WebDriver session end)",
			{},
			"H3",
		);
	});

	it("captures anchor icons screenshot", async () => {
		await prepareDemoScenario({
			vault: VAULT,
			startFile: "Дорожная карта проекта.md",
		});

		await browser.pause(800);
		await saveAppScreenshot(screenshotPath("anchor-icons"));
	});

	it("captures context menu screenshot", async () => {
		await prepareDemoScenario({
			vault: VAULT,
			startFile: "Дорожная карта проекта.md",
		});

		await openBacklinkMenuForDemo("Цели Q1", "ru");
		await browser.pause(400);
		await saveAppScreenshot(screenshotPath("context-menu"));
	});
});

/* global describe, it, afterEach, after */

import { browser } from "@wdio/globals";
import {
	DemoRecorder,
	HUMAN_PAUSE_MS,
	prepareDemoScenario,
	openBacklinkMenuForDemo,
	clickMenuItem,
	captureKeyPress,
	waitForActiveFile,
	dismissOpenUi,
	debugLog,
} from "./demo-helpers.mjs";

const VAULT = "./obsidian-tests/demo-vault";

afterEach(async () => {
	await dismissOpenUi();
});

describe("Handle Header Link demo capture", function () {
	after(async () => {
		await debugLog(
			"demo.e2e.mjs:after",
			"suite finished (before WebDriver session end)",
			{},
			"H3",
		);
	});
	it("click-anchor-and-navigate", async function () {
		const recorder = new DemoRecorder("click-anchor-and-navigate");
		await recorder.init();

		await prepareDemoScenario({
			vault: VAULT,
			startFile: "Project roadmap.md",
		});

		await recorder.captureAndPause(HUMAN_PAUSE_MS);

		await captureKeyPress(recorder, "Open backlink menu", 800);
		await openBacklinkMenuForDemo("Q1 goals");
		await browser.pause(300);

		await recorder.captureAndPause(HUMAN_PAUSE_MS);

		await captureKeyPress(recorder, "Select note", 600);
		await clickMenuItem("Meeting notes");
		await browser.pause(500);

		await waitForActiveFile("Meeting notes.md");
		await recorder.captureAndPause(1000);

		await recorder.finalize({ startFile: "Project roadmap.md" });
	});

	it("anchor-overview", async function () {
		const recorder = new DemoRecorder("anchor-overview");
		await recorder.init();

		await prepareDemoScenario({
			vault: VAULT,
			startFile: "Project roadmap.md",
		});

		await recorder.captureAndPause(1000);

		await captureKeyPress(recorder, "Open backlink menu", 800);
		await openBacklinkMenuForDemo("Q2 goals");
		await browser.pause(300);

		await recorder.captureAndPause(1000);

		await browser.keys("Escape");
		await browser.pause(500);

		await captureKeyPress(recorder, "Open another menu", 800);
		await openBacklinkMenuForDemo("Long term vision");
		await browser.pause(300);

		await recorder.captureAndPause(1000);

		await recorder.finalize({ startFile: "Project roadmap.md" });
	});
});

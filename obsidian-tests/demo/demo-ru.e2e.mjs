/* global describe, it, afterEach, after */

import { browser } from "@wdio/globals";
import {
	DemoRecorder,
	DEMO_ARTIFACTS_ROOT_RU,
	DEMO_OUTPUT_ROOT_RU,
	HUMAN_PAUSE_MS,
	prepareDemoScenario,
	openBacklinkMenuForDemo,
	clickMenuItem,
	captureKeyPress,
	waitForActiveFile,
	dismissOpenUi,
	debugLog,
} from "./demo-helpers.mjs";

const VAULT = "./obsidian-tests/demo-vault-ru";

const recorderRuOpts = { outputRoot: DEMO_OUTPUT_ROOT_RU, artifactsRoot: DEMO_ARTIFACTS_ROOT_RU };

afterEach(async () => {
	await dismissOpenUi();
});

describe("Handle Header Link demo capture (Russian)", function () {
	after(async () => {
		await debugLog(
			"demo-ru.e2e.mjs:after",
			"suite finished (before WebDriver session end)",
			{},
			"H3",
		);
	});
	it("click-anchor-and-navigate", async function () {
		const recorder = new DemoRecorder("click-anchor-and-navigate", recorderRuOpts);
		await recorder.init();

		await prepareDemoScenario({
			vault: VAULT,
			startFile: "Дорожная карта проекта.md",
			locale: "ru",
		});

		await recorder.captureAndPause(HUMAN_PAUSE_MS);

		await captureKeyPress(recorder, "Открыть меню обратных ссылок", 800);
		await openBacklinkMenuForDemo("Цели Q1", "ru");
		await browser.pause(300);

		await recorder.captureAndPause(HUMAN_PAUSE_MS);

		await captureKeyPress(recorder, "Выбрать заметку", 600);
		await clickMenuItem("Протоколы встреч");
		await browser.pause(500);

		await waitForActiveFile("Протоколы встреч.md");
		await recorder.captureAndPause(1000);

		await recorder.finalize({ startFile: "Дорожная карта проекта.md" });
	});

	it("anchor-overview", async function () {
		const recorder = new DemoRecorder("anchor-overview", recorderRuOpts);
		await recorder.init();

		await prepareDemoScenario({
			vault: VAULT,
			startFile: "Дорожная карта проекта.md",
			locale: "ru",
		});

		await recorder.captureAndPause(1000);

		await captureKeyPress(recorder, "Открыть меню обратных ссылок", 800);
		await openBacklinkMenuForDemo("Цели Q2", "ru");
		await browser.pause(300);

		await recorder.captureAndPause(1000);

		await browser.keys("Escape");
		await browser.pause(500);

		await captureKeyPress(recorder, "Открыть другое меню", 800);
		await openBacklinkMenuForDemo("Долгосрочное видение", "ru");
		await browser.pause(300);

		await recorder.captureAndPause(1000);

		await recorder.finalize({ startFile: "Дорожная карта проекта.md" });
	});
});

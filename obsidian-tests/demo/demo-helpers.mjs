import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { $, $$, browser } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const FONTSOURCE_INTER_DIR = path.resolve("node_modules/@fontsource/inter");
const DEMO_FONT_WEIGHTS = ["400", "500", "600", "700"];
let cachedFontCss = null;

/**
 * Read the bundled Inter CSS (one file per weight) from @fontsource and rewrite
 * its relative `url(./files/foo.woff2)` references to absolute `file://` URLs
 * so Electron can load them from disk. Bundling a font means screenshots no
 * longer depend on the system font installed on the developer's machine.
 */
async function loadInterFontCss() {
	if (cachedFontCss !== null) return cachedFontCss;
	const filesDir = path.join(FONTSOURCE_INTER_DIR, "files");
	const blocks = [];
	for (const weight of DEMO_FONT_WEIGHTS) {
		const css = await fs.readFile(path.join(FONTSOURCE_INTER_DIR, `${weight}.css`), "utf8");
		blocks.push(css.replace(/url\(\.\/files\/([^)]+)\)/g, (_, file) => {
			return `url('${pathToFileURL(path.join(filesDir, file)).href}')`;
		}));
	}
	cachedFontCss = blocks.join("\n");
	return cachedFontCss;
}

/**
 * Debug hypotheses (session 7e7b4f):
 * H1 — Wrong DOM selectors for menu items (rejected when native menu used — see H1b).
 * H1b — Desktop Obsidian uses native OS menu by default (`Menu.setUseNativeMenu` not set), so nothing mounts in DOM for WebDriver.
 * H2 — `Menu.showAtPosition` / `showAtMouseEvent` throws or is a no-op; menu never mounts.
 * H3 — SIGSEGV happens during WebDriver session teardown (CDP/V8 ValueSerializer), correlated in time with `deleteSession`, not with menu logic.
 * H4 — `executeObsidian` return payload fails to serialize or loses fields.
 * H5 — Menu opens off-screen (bad x/y) or under another layer; DOM counts stay zero.
 */

// #region agent log
const DEBUG_INGEST = "http://127.0.0.1:7341/ingest/d6a7ab80-0033-4b22-86eb-7ec11ab6cd6b";
export async function debugLog(location, message, data, hypothesisId, runId = "pre-fix") {
	await fetch(DEBUG_INGEST, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7e7b4f" },
		body: JSON.stringify({
			sessionId: "7e7b4f",
			location,
			message,
			data,
			hypothesisId,
			runId,
			timestamp: Date.now(),
		}),
	}).catch(() => {});
}
// #endregion

export const PLUGIN_ID = "header-backlinks";
export const DEMO_ARTIFACTS_ROOT = path.resolve("obsidian-tests/demo-artifacts");
export const DEMO_OUTPUT_ROOT = path.resolve("docs/demo");
/** Russian demo GIF output + frame staging (paired with `demo-vault-ru`). */
export const DEMO_OUTPUT_ROOT_RU = path.join(DEMO_OUTPUT_ROOT, "ru");
export const DEMO_ARTIFACTS_ROOT_RU = path.join(DEMO_ARTIFACTS_ROOT, "ru");
export const HUMAN_PAUSE_MS = 800;

export const APP_SELECTOR = ".app-container";

/** Target inner viewport for deterministic demo screenshots. Same size used for PNGs and GIFs. */
export const DEMO_VIEWPORT_WIDTH = 800;
export const DEMO_VIEWPORT_HEIGHT = 600;
/** Fixed width of the left sidebar (file explorer) so its layout is stable. */
const LEFT_SPLIT_WIDTH = 200;
/**
 * Stable display name for the vault in screenshots/GIFs. The service copies
 * the source vault to a temp dir with a random suffix (e.g. `demo-vault-0CQYIH`),
 * so the original `app.vault.getName()` is not deterministic across runs.
 */
export const STABLE_VAULT_NAME = "plugin-demo-vault";

/** Matches demo vault links to `Project roadmap.md` headings (same as plugin backlink map). */
const DEMO_BACKLINKS_BY_HEADER = {
	"Q1 goals": [
		{ path: "Meeting notes.md", name: "Meeting notes" },
		{ path: "Sprint planning.md", name: "Sprint planning" },
		{ path: "Design decisions.md", name: "Design decisions" },
	],
	"Q2 goals": [
		{ path: "Meeting notes.md", name: "Meeting notes" },
		{ path: "Sprint planning.md", name: "Sprint planning" },
	],
	"Long term vision": [{ path: "Design decisions.md", name: "Design decisions" }],
};

/** Russian demo vault (`demo-vault-ru`): same structure, localized file names and headings. */
const DEMO_BACKLINKS_BY_HEADER_RU = {
	"Цели Q1": [
		{ path: "Протоколы встреч.md", name: "Протоколы встреч" },
		{ path: "Планирование спринта.md", name: "Планирование спринта" },
		{ path: "Архитектурные решения.md", name: "Архитектурные решения" },
	],
	"Цели Q2": [
		{ path: "Протоколы встреч.md", name: "Протоколы встреч" },
		{ path: "Планирование спринта.md", name: "Планирование спринта" },
	],
	"Долгосрочное видение": [{ path: "Архитектурные решения.md", name: "Архитектурные решения" }],
};

const DEMO_BACKLINKS_BY_LOCALE = {
	en: DEMO_BACKLINKS_BY_HEADER,
	ru: DEMO_BACKLINKS_BY_HEADER_RU,
};

export class DemoRecorder {
	/**
	 * @param {string} scenarioName
	 * @param {{ outputRoot?: string; artifactsRoot?: string }} [options]
	 *        Defaults: English GIFs under `docs/demo/`, frames under `obsidian-tests/demo-artifacts/<scenario>/`.
	 *        Pass `outputRoot: DEMO_OUTPUT_ROOT_RU` and `artifactsRoot: DEMO_ARTIFACTS_ROOT_RU` for Russian demos.
	 */
	constructor(scenarioName, options = {}) {
		const outputRoot = options.outputRoot ?? DEMO_OUTPUT_ROOT;
		const artifactsRoot = options.artifactsRoot ?? DEMO_ARTIFACTS_ROOT;
		this.scenarioName = scenarioName;
		this.frames = [];
		this.frameIndex = 0;
		this.outputPath = path.join(outputRoot, `${scenarioName}.gif`);
		this.scenarioDir = path.join(artifactsRoot, scenarioName);
	}

	async init() {
		await fs.rm(this.scenarioDir, { recursive: true, force: true });
		await fs.mkdir(this.scenarioDir, { recursive: true });
	}

	async capture(durationMs, selector = APP_SELECTOR) {
		const target = await $(selector);
		await target.waitForDisplayed();

		await prepareForScreenshot();

		const filename = `${String(this.frameIndex).padStart(4, "0")}.png`;
		const filepath = path.join(this.scenarioDir, filename);
		await target.saveScreenshot(filepath);
		this.frames.push({ file: filename, durationMs });
		this.frameIndex += 1;
	}

	async captureAndPause(durationMs, selector = APP_SELECTOR) {
		await this.capture(durationMs, selector);
		await browser.pause(durationMs);
	}

	async finalize(extra = {}) {
		assert.ok(this.frames.length > 0, "demo recorder must capture at least one frame");

		const manifestPath = path.join(this.scenarioDir, "manifest.json");
		const manifest = {
			scenario: this.scenarioName,
			output: path.relative(process.cwd(), this.outputPath),
			frames: this.frames,
			...extra,
		};
		await fs.writeFile(manifestPath, JSON.stringify(manifest, null, "\t"));
	}
}

export async function waitForPlugin() {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(
				({ app }) => {
					const plugin = app.plugins?.plugins?.["header-backlinks"];
					return Boolean(plugin);
				},
			),
		{
			timeout: 30000,
			timeoutMsg: "Header Backlinks plugin did not load in time",
		},
	);
}

async function readVaultDir(vaultPath) {
	const resolved = path.resolve(vaultPath);
	const entries = await fs.readdir(resolved);
	const snapshot = {};
	for (const entry of entries) {
		if (!entry.endsWith(".md")) continue;
		snapshot[entry] = await fs.readFile(path.join(resolved, entry), "utf-8");
	}
	return snapshot;
}

export async function waitForBacklinksReady() {
	await browser.waitUntil(
		async () => {
			const anchorCount = await browser.execute(() => {
				return document.querySelectorAll(".header-backlink-anchor").length;
			});
			return anchorCount > 0;
		},
		{
			timeout: 1000,
			interval: 50,
			timeoutMsg: "Anchor icons did not appear in the gutter",
		},
	);
}

export async function prepareDemoScenario({ vault, startFile, locale = "en", stableVaultName = STABLE_VAULT_NAME }) {
	await browser.keys("Escape");
	const modalContainer = await $(".modal-container");
	if (await modalContainer.isDisplayed().catch(() => false)) {
		await browser.keys("Escape");
		await browser.waitUntil(
			async () => !(await modalContainer.isDisplayed().catch(() => false)),
			{ timeout: 1000, interval: 50 },
		);
	}

	await browser.executeObsidian(({ app }) => {
		for (const leaf of app.workspace.getLeavesOfType("markdown")) {
			leaf.detach();
		}
	});

	const targetFiles = await readVaultDir(vault);

	const filesChanged = await browser.executeObsidian(
		async ({ app, obsidian }, snapshot) => {
			let changed = false;
			const knownPaths = new Set(Object.keys(snapshot));

			for (const file of app.vault.getMarkdownFiles()) {
				if (!knownPaths.has(file.path)) {
					await app.vault.delete(file);
					changed = true;
				}
			}

			for (const [filePath, content] of Object.entries(snapshot)) {
				const file = app.vault.getAbstractFileByPath(filePath);
				if (file instanceof obsidian.TFile) {
					const current = await app.vault.read(file);
					if (current !== content) {
						await app.vault.modify(file, content);
						changed = true;
					}
				} else {
					await app.vault.create(filePath, content);
					changed = true;
				}
			}
			return changed;
		},
		targetFiles,
	);

	if (filesChanged) {
		await browser.executeObsidian(({ app }) =>
			new Promise((resolve) => {
				if (app.metadataCache.initialized) {
					const ref = app.metadataCache.on("resolved", () => {
						app.metadataCache.offref(ref);
						resolve();
					});
					setTimeout(() => {
						app.metadataCache.offref(ref);
						resolve();
					}, 2000);
				} else {
					resolve();
				}
			}),
		);
	}

	await waitForPlugin();
	await configureDemoEnvironment(locale, stableVaultName);
	await obsidianPage.openFile(startFile);
	await waitForBacklinksReady();
	await normalizeEditorState();
}

/**
 * Put the active editor into a known state: cursor at the start of the file,
 * no selection, scrolled to the top. Without this the cursor lands wherever
 * Obsidian last left it, which varies between runs.
 */
async function normalizeEditorState() {
	await browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType?.(obsidian.MarkdownView);
		if (!view) return;
		const editor = view.editor;
		const start = { line: 0, ch: 0 };
		editor.setSelection(start, start);
		editor.scrollTo(0, 0);
		if (typeof view.contentEl?.scrollTo === "function") {
			view.contentEl.scrollTo(0, 0);
		}
		const scrollers = view.containerEl?.querySelectorAll?.(".cm-scroller, .markdown-preview-view") ?? [];
		scrollers.forEach((el) => {
			el.scrollTop = 0;
			el.scrollLeft = 0;
		});
	});
	await browser.execute(() => {
		const active = document.activeElement;
		if (active && typeof active.blur === "function" && active !== document.body) {
			active.blur();
		}
	});
}

export async function configureDemoEnvironment(locale = "en", stableVaultName = null) {
	const needsReload = await browser.execute((lang) => {
		const current = window.localStorage.getItem("language");
		if (current === lang) return false;
		window.localStorage.setItem("language", lang);
		return true;
	}, locale);

	if (needsReload) {
		await browser.executeObsidian(({ app }) => {
			app.commands.executeCommandById("app:reload");
		});
		await browser.pause(2000);
		await waitForPlugin();
	}

	const interFontCss = await loadInterFontCss();

	await browser.execute((leftWidth, frameW, frameH, fontCss) => {
		const styleId = "header-backlinks-demo-style";
		document.getElementById(styleId)?.remove();

		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = `
			${fontCss}
			body, body * {
				font-family: 'Inter', sans-serif !important;
			}
			body.theme-dark {
				color-scheme: light;
			}
			body.theme-dark,
			body.theme-dark .app-container {
				background: var(--background-primary);
			}
			.workspace-split.mod-right-split,
			.status-bar,
			.workspace-tab-header-container {
				display: none !important;
			}
			.workspace-split.mod-left-split {
				width: ${leftWidth}px !important;
				min-width: ${leftWidth}px !important;
				max-width: ${leftWidth}px !important;
				flex: 0 0 ${leftWidth}px !important;
			}
			/*
			 * Belt-and-braces: pin .app-container to exactly the screenshot frame.
			 * The Electron window itself is also resized to this size (see
			 * lockElectronWindow) so popovers/menus stay inside the frame.
			 */
			.app-container {
				width: ${frameW}px !important;
				height: ${frameH}px !important;
				overflow: hidden !important;
			}
			*, *::before, *::after {
				animation-duration: 0ms !important;
				animation-delay: 0ms !important;
				transition-duration: 0ms !important;
				transition-delay: 0ms !important;
				scroll-behavior: auto !important;
			}
			.cm-cursor, .cm-cursorLayer, .cm-fat-cursor {
				visibility: hidden !important;
				opacity: 0 !important;
			}
			.cm-content,
			input, textarea, [contenteditable="true"] {
				caret-color: transparent !important;
			}
			.cm-selectionBackground,
			::selection,
			::-moz-selection {
				background: transparent !important;
			}
		`;
		document.head.append(style);

		document.body.classList.remove("theme-dark");
		document.body.classList.add("theme-light");
		window.dispatchEvent(new Event("resize"));
	}, LEFT_SPLIT_WIDTH, DEMO_VIEWPORT_WIDTH, DEMO_VIEWPORT_HEIGHT, interFontCss);

	await browser.execute(async () => {
		if (document.fonts && typeof document.fonts.ready?.then === "function") {
			await document.fonts.ready;
		}
	});

	await browser.executeObsidian(({ app }, leftWidth) => {
		const left = app.workspace.leftSplit;
		left?.expand?.();
		if (left && typeof left.setSize === "function") {
			left.setSize(leftWidth);
		}
	}, LEFT_SPLIT_WIDTH);

	if (stableVaultName) {
		await stabilizeVaultName(stableVaultName);
	}

	await lockElectronWindow(DEMO_VIEWPORT_WIDTH, DEMO_VIEWPORT_HEIGHT);
	await assertFrameSize(DEMO_VIEWPORT_WIDTH, DEMO_VIEWPORT_HEIGHT);
}

/**
 * Resize the actual Electron BrowserWindow so the inner viewport matches the
 * screenshot frame. Without this, popovers/menus position themselves in the
 * full Electron viewport — which is larger than `.app-container` — and end up
 * outside the screenshot region.
 *
 * Tries the Electron-native API first (Obsidian's renderer has node integration),
 * then falls back to `window.resizeTo`. Chromedriver classic does not support
 * WebDriver's window/rect for Electron windows.
 */
async function lockElectronWindow(innerWidth, innerHeight) {
	await browser.execute((targetW, targetH) => {
		let win = null;
		try {
			const electron = window.require?.("electron");
			win = electron?.remote?.getCurrentWindow?.()
				?? electron?.BrowserWindow?.getFocusedWindow?.()
				?? null;
		} catch {
			win = null;
		}

		if (win && typeof win.setContentSize === "function") {
			win.setResizable?.(true);
			win.setContentSize(targetW, targetH);
			return;
		}
		if (win && typeof win.setSize === "function") {
			const chromeW = window.outerWidth - window.innerWidth;
			const chromeH = window.outerHeight - window.innerHeight;
			win.setResizable?.(true);
			win.setSize(targetW + chromeW, targetH + chromeH);
			return;
		}

		window.resizeTo(targetW, targetH);
		const chromeW = window.outerWidth - window.innerWidth;
		const chromeH = window.outerHeight - window.innerHeight;
		if (chromeW !== 0 || chromeH !== 0) {
			window.resizeTo(targetW + chromeW, targetH + chromeH);
		}
	}, innerWidth, innerHeight);

	const final = await browser.execute(() => ({
		iw: window.innerWidth,
		ih: window.innerHeight,
	}));
	assert.equal(final.iw, innerWidth, `viewport innerWidth ${final.iw} != ${innerWidth}`);
	assert.equal(final.ih, innerHeight, `viewport innerHeight ${final.ih} != ${innerHeight}`);
}

const VAULT_NAME_SELECTORS = [
	".workspace-drawer-vault-name",
	".nav-folder.mod-root > .nav-folder-title .nav-folder-title-content",
].join(", ");

/**
 * Replace every on-screen rendering of the vault name with a stable string.
 * The service copies the vault to a temp dir suffixed with a random hash
 * (e.g. `demo-vault-0CQYIH`) — that name appears in (a) the vault-switcher at
 * the bottom of the file explorer and (b) the root folder header at the top.
 *
 * We patch `app.vault.getName` so future re-renders use the stable name, then
 * overwrite both DOM locations in case Obsidian already rendered the originals.
 */
async function stabilizeVaultName(name) {
	await browser.executeObsidian(({ app }, payload) => {
		const vault = app.vault;
		if (!vault.__demoOriginalGetName) {
			vault.__demoOriginalGetName = vault.getName.bind(vault);
		}
		vault.getName = () => payload.name;
		document.querySelectorAll(payload.selectors).forEach((el) => {
			el.textContent = payload.name;
		});
	}, { name, selectors: VAULT_NAME_SELECTORS });
}

async function assertFrameSize(expectedWidth, expectedHeight) {
	const actual = await browser.execute(() => {
		const el = document.querySelector(".app-container");
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { width: Math.round(r.width), height: Math.round(r.height) };
	});
	assert.ok(actual, ".app-container not found");
	assert.equal(actual.width, expectedWidth, `.app-container width ${actual.width} != ${expectedWidth}`);
	assert.equal(actual.height, expectedHeight, `.app-container height ${actual.height} != ${expectedHeight}`);
}

/**
 * Quiet the page just before a screenshot: drop focus (avoids caret/selection
 * artefacts), wait for webfonts to finish loading, then flush two paint frames.
 */
export async function prepareForScreenshot() {
	await browser.executeObsidian(async ({ app }, selectors) => {
		const active = document.activeElement;
		if (active && typeof active.blur === "function" && active !== document.body) {
			active.blur();
		}
		const stableName = app.vault.getName();
		document.querySelectorAll(selectors).forEach((el) => {
			if (el.textContent !== stableName) el.textContent = stableName;
		});
		if (document.fonts && typeof document.fonts.ready?.then === "function") {
			await document.fonts.ready;
		}
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	}, VAULT_NAME_SELECTORS);
}

export async function saveAppScreenshot(outputPath) {
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	const app = await $(APP_SELECTOR);
	await app.waitForDisplayed();
	await prepareForScreenshot();
	await app.saveScreenshot(outputPath);
}

/**
 * Opens the same backlink menu the plugin would show, using Obsidian's `Menu` API
 * inside the app (avoids synthetic DOM clicks — they often fail, and can destabilize
 * Electron/CDP when combined with WebDriver).
 */
export async function openBacklinkMenuForDemo(headerLabel, locale = "en") {
	const map = DEMO_BACKLINKS_BY_LOCALE[locale] ?? DEMO_BACKLINKS_BY_HEADER;
	const sources = map[headerLabel];
	assert.ok(sources, `Unknown demo header "${headerLabel}" (locale=${locale})`);

	await debugLog("demo-helpers.mjs:openBacklinkMenuForDemo", "entry", { headerLabel }, "H2");

	const menuResult = await browser.executeObsidian(
		({ app, obsidian }, payload) => {
			const q = (sel) => document.querySelectorAll(sel).length;
			try {
				const { sources: items, headerText } = payload;
				const menu = new obsidian.Menu();
				// Desktop: default is often a native menu — it never appears in `document`, so screenshots/WebDriver see nothing.
				if (typeof menu.setUseNativeMenu === "function") {
					menu.setUseNativeMenu(false);
				}
				const renameCmd = app.commands?.findCommand?.("editor:rename-heading");
				if (renameCmd) {
					menu.addItem((item) => {
						item.setTitle(renameCmd.name ?? "Rename this heading...");
						item.setIcon("pencil");
						item.onClick(() => {});
					});
					menu.addSeparator();
				}
				for (const s of items) {
					menu.addItem((item) => {
						item.setTitle(s.name);
						item.onClick(() => {
							app.workspace.openLinkText(s.path, "", false);
						});
					});
				}

				let x = 400;
				let y = 300;
				const anchors = document.querySelectorAll(".header-backlink-anchor");
				const lines = document.querySelectorAll(".cm-line");
				for (const line of lines) {
					if (!line.textContent.includes(headerText)) continue;
					const lineTop = line.getBoundingClientRect().top;
					for (let i = 0; i < anchors.length; i++) {
						const anchor = anchors[i];
						if (Math.abs(anchor.getBoundingClientRect().top - lineTop) < 36) {
							const r = anchor.getBoundingClientRect();
							x = r.right + 8;
							y = r.top + r.height / 2;
							break;
						}
					}
					break;
				}

				let pathUsed = "unknown";
				if (typeof menu.showAtPosition === "function") {
					menu.showAtPosition({ x, y });
					pathUsed = "showAtPosition";
				} else {
					const evt = new MouseEvent("click", {
						bubbles: true,
						cancelable: true,
						view: window,
						clientX: x,
						clientY: y,
					});
					menu.showAtMouseEvent(evt);
					pathUsed = "showAtMouseEvent";
				}

				return {
					ok: true,
					pathUsed,
					nativeMenuForcedOff: typeof menu.setUseNativeMenu === "function",
					x,
					y,
					nAnchors: anchors.length,
					counts: {
						menuItem: q(".menu-item"),
						roleMenuItem: q('[role="menuitem"]'),
						menu: q(".menu"),
						popover: q(".popover"),
					},
				};
			} catch (e) {
				return {
					ok: false,
					error: e instanceof Error ? e.message : String(e),
				};
			}
		},
		{ sources, headerText: headerLabel },
	);

	await debugLog("demo-helpers.mjs:openBacklinkMenuForDemo", "executeObsidian result", menuResult, "H2");
	await debugLog(
		"demo-helpers.mjs:openBacklinkMenuForDemo",
		"return payload shape",
		{
			type: typeof menuResult,
			keys: menuResult && typeof menuResult === "object" ? Object.keys(menuResult) : [],
		},
		"H4",
	);

	const domProbe = await browser.execute(() => {
		const q = (sel) => document.querySelectorAll(sel).length;
		const sample = [...document.querySelectorAll("body *")]
			.filter((el) => el.className && String(el.className).toLowerCase().includes("menu"))
			.slice(0, 12)
			.map((el) => String(el.className));
		return {
			counts: {
				menuItem: q(".menu-item"),
				roleMenuItem: q('[role="menuitem"]'),
				menu: q(".menu"),
				popover: q(".popover"),
			},
			classSample: sample,
		};
	});
	await debugLog("demo-helpers.mjs:openBacklinkMenuForDemo", "domProbe after menu", domProbe, "H1");
	const viewport = await browser.execute(() => ({
		vw: window.innerWidth,
		vh: window.innerHeight,
	}));
	await debugLog(
		"demo-helpers.mjs:openBacklinkMenuForDemo",
		"coords vs viewport (H5)",
		{ ...viewport, menuResult },
		"H5",
	);

	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				return (
					document.querySelectorAll(".menu-item").length > 0 ||
					document.querySelectorAll('[role="menuitem"]').length > 0
				);
			}),
		{
			timeout: 1000,
			interval: 50,
			timeoutMsg: "Backlink menu did not appear (.menu-item or [role=menuitem])",
		},
	);
}

/** Dismiss any open menu/modal before session teardown (reduces Electron crashes). */
export async function dismissOpenUi() {
	await browser.keys("Escape");
}

export async function waitForActiveFile(expectedPath) {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(
				({ app }, path) => app.workspace.getActiveFile()?.path === path,
				expectedPath,
			),
		{
			timeout: 1000,
			interval: 50,
			timeoutMsg: `Expected active file to be ${expectedPath}`,
		},
	);
}

export async function clickMenuItem(text) {
	const items = await $$(`.menu .menu-item, .popover .menu-item`);

	for (const item of items) {
		const itemText = await item.getText();
		if (itemText.includes(text)) {
			await item.click();
			return;
		}
	}
	throw new Error(`Menu item "${text}" not found`);
}

/**
 * Add Obsidian's `selected` class to the menu item whose visible text contains
 * `text`, mimicking the keyboard-navigation/hover highlight. Used in demos to
 * make it obvious which item the next click will target. Clears the highlight
 * from any previously-highlighted menu items first.
 */
export async function highlightMenuItem(text) {
	const found = await browser.execute((target) => {
		const items = document.querySelectorAll(".menu .menu-item, .popover .menu-item");
		items.forEach((el) => el.classList.remove("selected"));
		for (const item of items) {
			if ((item.textContent ?? "").includes(target)) {
				item.classList.add("selected");
				return true;
			}
		}
		return false;
	}, text);
	assert.ok(found, `Menu item "${text}" not found for highlight`);
}

export async function captureKeyPress(recorder, label, durationMs = 650, options = {}) {
	const { keepVisible = false } = options;
	await browser.execute((text) => {
		let overlay = document.getElementById("header-backlinks-demo-key-overlay");
		if (!overlay) {
			overlay = document.createElement("div");
			overlay.id = "header-backlinks-demo-key-overlay";
			overlay.style.cssText = `
				position: fixed;
				right: 28px;
				bottom: 28px;
				z-index: 10000;
				padding: 10px 14px;
				border-radius: 12px;
				background: rgba(28, 28, 30, 0.88);
				color: #fff;
				font: 600 18px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
				letter-spacing: 0.02em;
				box-shadow: 0 14px 32px rgba(0, 0, 0, 0.18);
			`;
			document.body.append(overlay);
		}
		overlay.textContent = text;
		overlay.style.display = "block";
	}, label);
	await recorder.captureAndPause(durationMs);
	if (!keepVisible) {
		await hideKeyPressOverlay();
	}
}

export async function hideKeyPressOverlay() {
	await browser.execute(() => {
		const overlay = document.getElementById("header-backlinks-demo-key-overlay");
		if (!overlay) return;
		overlay.textContent = "";
		overlay.style.display = "none";
	});
}

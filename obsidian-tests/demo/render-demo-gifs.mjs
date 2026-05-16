import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const ARTIFACTS_ROOT = path.resolve("obsidian-tests/demo-artifacts");
const SCREENSHOT_ROOT = path.resolve("docs/demo");
const CHECKSUMS_FILE = path.join(SCREENSHOT_ROOT, "CHECKSUMS.txt");
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? require("ffmpeg-static");
const OXIPNG_BIN = process.env.OXIPNG_BIN ?? require("oxipng-bin").default;
const SKIP_VERIFY = process.env.DEMO_VERIFY === "0";

async function main() {
	await ensureFfmpeg();
	await ensureOxipng();
	const manifests = await findManifests(ARTIFACTS_ROOT);
	if (manifests.length === 0) {
		throw new Error(
			"No demo manifests found in obsidian-tests/demo-artifacts. Run `npm run demo:capture` first.",
		);
	}

	const renderedGifs = [];
	for (const manifestPath of manifests) {
		const raw = await fs.readFile(manifestPath, "utf8");
		const manifest = JSON.parse(raw);
		const outputPath = path.resolve(manifest.output);
		await renderManifest(manifestPath, manifest, outputPath);
		renderedGifs.push({ manifestPath, manifest, outputPath });
	}

	await optimizeScreenshots(SCREENSHOT_ROOT);

	if (!SKIP_VERIFY) {
		await selfCheckGifDeterminism(renderedGifs);
	}

	await writeChecksumsFile();
}

/**
 * Re-render each GIF from the same frames to a tmpfile and verify the sha256
 * matches the original. Catches non-determinism in the ffmpeg encoder itself
 * (e.g. a future ffmpeg-static bump that drops bit-exact output). Set
 * `DEMO_VERIFY=0` to skip when iterating locally.
 */
async function selfCheckGifDeterminism(rendered) {
	const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "demo-verify-"));
	try {
		for (const { manifestPath, manifest, outputPath } of rendered) {
			const originalHash = await sha256OfFile(outputPath);
			const tmpOutput = path.join(tmpRoot, path.basename(outputPath));
			await renderManifest(manifestPath, manifest, tmpOutput);
			const reRenderedHash = await sha256OfFile(tmpOutput);
			if (originalHash !== reRenderedHash) {
				throw new Error(
					`GIF re-render produced different bytes for ${outputPath}\n` +
					`  original=${originalHash}\n` +
					`  re-render=${reRenderedHash}`,
				);
			}
		}
	} finally {
		await fs.rm(tmpRoot, { recursive: true, force: true });
	}
}

async function writeChecksumsFile() {
	const files = [];
	await collectAssets(SCREENSHOT_ROOT, files);
	files.sort();
	const lines = [];
	for (const file of files) {
		const rel = path.relative(SCREENSHOT_ROOT, file).split(path.sep).join("/");
		lines.push(`${await sha256OfFile(file)}  ${rel}`);
	}
	await fs.writeFile(CHECKSUMS_FILE, lines.join("\n") + "\n");
}

async function collectAssets(dir, out) {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await collectAssets(entryPath, out);
		} else if (entry.isFile() && entry.name !== path.basename(CHECKSUMS_FILE)) {
			out.push(entryPath);
		}
	}
}

async function sha256OfFile(filePath) {
	const data = await fs.readFile(filePath);
	return crypto.createHash("sha256").update(data).digest("hex");
}

async function ensureFfmpeg() {
	await runCommand(FFMPEG_BIN, ["-version"], {
		friendlyError:
			`ffmpeg is required to render demo GIFs. Install ffmpeg or set FFMPEG_BIN to a valid executable path.`,
	});
}

async function ensureOxipng() {
	await runCommand(OXIPNG_BIN, ["--version"], {
		friendlyError:
			`oxipng is required to strip non-pixel metadata from PNG screenshots. Install oxipng or set OXIPNG_BIN to a valid executable path.`,
	});
}

/**
 * Strip every non-pixel chunk (iCCP/tIME/tEXt/...) from PNGs and re-encode
 * with a fixed compression level. Together with bundled fonts and a pinned
 * ffmpeg this is what makes the output byte-identical across machines.
 */
async function optimizeScreenshots(rootDir) {
	const pngs = [];
	await collectPngs(rootDir, pngs);
	if (pngs.length === 0) return;
	await runCommand(OXIPNG_BIN, [
		"--opt", "max",
		"--strip", "all",
		"--alpha",
		"--quiet",
		"--threads", "1",
		...pngs,
	], { friendlyError: `oxipng failed while optimizing screenshots in ${rootDir}` });
}

async function collectPngs(dir, out) {
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await collectPngs(entryPath, out);
		} else if (entry.isFile() && entry.name.endsWith(".png")) {
			out.push(entryPath);
		}
	}
}

async function renderManifest(manifestPath, manifest, outputPath) {
	if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) {
		throw new Error(`Manifest ${manifestPath} does not contain frames.`);
	}
	if (typeof manifest.output !== "string" || manifest.output.length === 0) {
		throw new Error(`Manifest ${manifestPath} does not define an output path.`);
	}

	const manifestDir = path.dirname(manifestPath);
	await fs.mkdir(path.dirname(outputPath), { recursive: true });

	const concatPath = path.join(manifestDir, "ffmpeg-input.txt");
	const concatContent = buildConcatFile(manifestDir, manifest.frames);
	await fs.writeFile(concatPath, concatContent);

	// No scaling: GIFs are produced at the frame's source size (= DEMO_VIEWPORT
	// dimensions) so PNG screenshots and GIFs share one resolution.
	const filter =
		"fps=12,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5";

	await runCommand(FFMPEG_BIN, [
		"-y",
		"-nostdin",
		"-hide_banner",
		"-loglevel", "error",
		"-fflags", "+bitexact",
		"-flags:v", "+bitexact",
		"-f", "concat",
		"-safe", "0",
		"-i", concatPath,
		"-filter_complex", filter,
		outputPath,
	], {
		friendlyError: `ffmpeg failed while rendering ${outputPath}`,
	});
}

function buildConcatFile(manifestDir, frames) {
	const lines = [];
	for (const frame of frames) {
		const framePath = path.join(manifestDir, frame.file);
		lines.push(`file '${escapeForConcat(framePath)}'`);
		lines.push(`duration ${(frame.durationMs / 1000).toFixed(3)}`);
	}

	const lastFramePath = path.join(manifestDir, frames.at(-1).file);
	lines.push(`file '${escapeForConcat(lastFramePath)}'`);
	return `${lines.join("\n")}\n`;
}

function escapeForConcat(value) {
	return value.replace(/'/g, "'\\''");
}

async function findManifests(rootDir) {
	const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
	const manifests = [];

	for (const entry of entries) {
		const entryPath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			manifests.push(...await findManifests(entryPath));
		} else if (entry.isFile() && entry.name === "manifest.json") {
			manifests.push(entryPath);
		}
	}

	return manifests.sort();
}

async function runCommand(command, args, { friendlyError }) {
	await new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "ignore" });
		child.on("error", (error) => {
			reject(new Error(`${friendlyError}\n${error.message}`));
		});
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${friendlyError} (exit code ${code ?? "unknown"})`));
		});
	});
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});

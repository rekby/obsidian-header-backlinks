import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App } from "obsidian";
import { BacklinkResolver } from "../backlink-resolver";

vi.mock("obsidian", () => ({
	App: class {},
	TFile: class {},
}));

interface MockRef {
	link: string;
	original: string;
	displayText: string;
	position: {
		start: { line: number; col: number; offset: number };
		end: { line: number; col: number; offset: number };
	};
}

interface MockFile {
	path: string;
	basename: string;
	extension: string;
	content: string;
	cache: {
		links?: MockRef[];
		embeds?: MockRef[];
	};
	links?: string[]; // resolved target paths for resolvedLinks
}

function createMockApp(files: MockFile[]) {
	const fileObjects = files.map((f) => ({
		path: f.path,
		basename: f.basename,
		extension: f.extension,
	}));

	const cacheMap = new Map(files.map((f) => [f.path, f.cache]));
	const contentMap = new Map(files.map((f) => [f.path, f.content]));
	const fileMap = new Map(fileObjects.map((f) => [f.path, f]));

	const resolvedLinks: Record<string, Record<string, number>> = {};
	for (const file of files) {
		const targets: Record<string, number> = {};
		const refs = [...(file.cache.links ?? []), ...(file.cache.embeds ?? [])];
		for (const ref of refs) {
			const hashIndex = ref.link.indexOf("#");
			const linkpath = hashIndex === -1 ? ref.link : ref.link.substring(0, hashIndex);
			const targetPath = linkpath === ""
				? file.path
				: fileMap.has(linkpath + ".md")
					? linkpath + ".md"
					: fileMap.has(linkpath)
						? linkpath
						: null;
			if (targetPath) {
				targets[targetPath] = (targets[targetPath] ?? 0) + 1;
			}
		}
		if (Object.keys(targets).length > 0) {
			resolvedLinks[file.path] = targets;
		}
	}

	return {
		vault: {
			getFileByPath: (path: string) => fileMap.get(path) ?? null,
			cachedRead: (file: { path: string }) =>
				Promise.resolve(contentMap.get(file.path) ?? ""),
		},
		metadataCache: {
			resolvedLinks,
			getCache: (path: string) => cacheMap.get(path) ?? null,
			getFirstLinkpathDest: (linkpath: string, _sourcePath: string) =>
				fileMap.get(linkpath + ".md") ?? fileMap.get(linkpath) ?? null,
		},
	};
}

describe("BacklinkResolver", () => {
	let onChanged: ReturnType<typeof vi.fn<() => void>>;

	beforeEach(() => {
		onChanged = vi.fn();
	});

	it("finds backlinks with header fragments", () => {
		const app = createMockApp([
			{
				path: "target.md",
				basename: "target",
				extension: "md",
				content: "# My Header\nSome content",
				cache: {},
			},
			{
				path: "source.md",
				basename: "source",
				extension: "md",
				content: "See [[target#My Header]] for details",
				cache: {
					links: [
						{
							link: "target#My Header",
							original: "[[target#My Header]]",
							displayText: "target#My Header",
							position: {
								start: { line: 0, col: 4, offset: 4 },
								end: { line: 0, col: 24, offset: 24 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		const sources = resolver.getBacklinksForHeader("target.md", "My Header");
		expect(sources).toHaveLength(1);
		expect(sources[0]!.sourceFilePath).toBe("source.md");
		expect(sources[0]!.sourceFileName).toBe("source");
		expect(sources[0]!.lineNumber).toBe(0);
		expect(sources[0]!.previewText).toBe(""); // lazy
	});

	it("normalizes header text for matching", () => {
		const app = createMockApp([
			{
				path: "target.md",
				basename: "target",
				extension: "md",
				content: "# My Header\n",
				cache: {},
			},
			{
				path: "source.md",
				basename: "source",
				extension: "md",
				content: "[[target#my  header]]",
				cache: {
					links: [
						{
							link: "target#my  header",
							original: "[[target#my  header]]",
							displayText: "target#my  header",
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 21, offset: 21 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		const sources = resolver.getBacklinksForHeader("target.md", "My Header");
		expect(sources).toHaveLength(1);
	});

	it("handles self-references (empty linkpath)", () => {
		const app = createMockApp([
			{
				path: "note.md",
				basename: "note",
				extension: "md",
				content: "# Intro\nSee [[#Intro]] above",
				cache: {
					links: [
						{
							link: "#Intro",
							original: "[[#Intro]]",
							displayText: "#Intro",
							position: {
								start: { line: 1, col: 4, offset: 12 },
								end: { line: 1, col: 14, offset: 22 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		const sources = resolver.getBacklinksForHeader("note.md", "Intro");
		expect(sources).toHaveLength(1);
		expect(sources[0]!.sourceFilePath).toBe("note.md");
	});

	it("handles embeds with header fragments", () => {
		const app = createMockApp([
			{
				path: "target.md",
				basename: "target",
				extension: "md",
				content: "# Section\nContent here",
				cache: {},
			},
			{
				path: "source.md",
				basename: "source",
				extension: "md",
				content: "![[target#Section]]",
				cache: {
					embeds: [
						{
							link: "target#Section",
							original: "![[target#Section]]",
							displayText: "target#Section",
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 19, offset: 19 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		const sources = resolver.getBacklinksForHeader("target.md", "Section");
		expect(sources).toHaveLength(1);
	});

	it("ignores links without header fragment", () => {
		const app = createMockApp([
			{
				path: "target.md",
				basename: "target",
				extension: "md",
				content: "# Title\n",
				cache: {},
			},
			{
				path: "source.md",
				basename: "source",
				extension: "md",
				content: "[[target]]",
				cache: {
					links: [
						{
							link: "target",
							original: "[[target]]",
							displayText: "target",
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 10, offset: 10 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		const sources = resolver.getBacklinksForHeader("target.md", "Title");
		expect(sources).toHaveLength(0);
	});

	it("ignores links with # but empty fragment", () => {
		const app = createMockApp([
			{
				path: "target.md",
				basename: "target",
				extension: "md",
				content: "# Title\n",
				cache: {},
			},
			{
				path: "source.md",
				basename: "source",
				extension: "md",
				content: "[[target#]]",
				cache: {
					links: [
						{
							link: "target#",
							original: "[[target#]]",
							displayText: "target#",
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 11, offset: 11 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		const sources = resolver.getBacklinksForHeader("target.md", "Title");
		expect(sources).toHaveLength(0);
	});

	it("returns empty array for unknown file", () => {
		const app = createMockApp([]);
		const resolver = new BacklinkResolver(app as unknown as App, onChanged);
		expect(resolver.getBacklinksForHeader("nonexistent.md", "Header")).toEqual([]);
	});

	it("returns empty array for unknown header", () => {
		const app = createMockApp([
			{
				path: "target.md",
				basename: "target",
				extension: "md",
				content: "# Existing Header\n",
				cache: {},
			},
			{
				path: "source.md",
				basename: "source",
				extension: "md",
				content: "[[target#Existing Header]]",
				cache: {
					links: [
						{
							link: "target#Existing Header",
							original: "[[target#Existing Header]]",
							displayText: "target#Existing Header",
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 25, offset: 25 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		expect(resolver.getBacklinksForHeader("target.md", "Nonexistent Header")).toEqual([]);
	});

	it("collects multiple backlinks to the same header", () => {
		const app = createMockApp([
			{
				path: "target.md",
				basename: "target",
				extension: "md",
				content: "# Header\n",
				cache: {},
			},
			{
				path: "a.md",
				basename: "a",
				extension: "md",
				content: "[[target#Header]]",
				cache: {
					links: [
						{
							link: "target#Header",
							original: "[[target#Header]]",
							displayText: "target#Header",
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 17, offset: 17 },
							},
						},
					],
				},
			},
			{
				path: "b.md",
				basename: "b",
				extension: "md",
				content: "[[target#Header]]",
				cache: {
					links: [
						{
							link: "target#Header",
							original: "[[target#Header]]",
							displayText: "target#Header",
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 17, offset: 17 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		const sources = resolver.getBacklinksForHeader("target.md", "Header");
		expect(sources).toHaveLength(2);
		const paths = sources.map((s) => s.sourceFilePath).sort();
		expect(paths).toEqual(["a.md", "b.md"]);
	});

	it("increments version and notifies onChanged on invalidate", () => {
		const app = createMockApp([]);
		const resolver = new BacklinkResolver(app as unknown as App, onChanged);
		expect(resolver.getVersion()).toBe(0);

		resolver.invalidate();
		expect(resolver.getVersion()).toBe(1);
		expect(onChanged).toHaveBeenCalledTimes(1);

		resolver.invalidate();
		expect(resolver.getVersion()).toBe(2);
		expect(onChanged).toHaveBeenCalledTimes(2);
	});

	it("invalidate clears cached file maps", () => {
		const files: MockFile[] = [
			{
				path: "target.md",
				basename: "target",
				extension: "md",
				content: "",
				cache: {},
			},
			{
				path: "source.md",
				basename: "source",
				extension: "md",
				content: "",
				cache: {
					links: [
						{
							link: "target#H",
							original: "[[target#H]]",
							displayText: "target#H",
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 12, offset: 12 },
							},
						},
					],
				},
			},
		];
		const app = createMockApp(files);
		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		expect(resolver.getBacklinksForHeader("target.md", "H")).toHaveLength(1);

		// Mutate resolvedLinks "in place" to simulate that the cache hides stale data
		app.metadataCache.resolvedLinks = {};
		// Without invalidate, the cached file map still returns the old result
		expect(resolver.getBacklinksForHeader("target.md", "H")).toHaveLength(1);

		resolver.invalidate();
		expect(resolver.getBacklinksForHeader("target.md", "H")).toHaveLength(0);
	});

	it("ignores links to non-existent target files", () => {
		const app = createMockApp([
			{
				path: "source.md",
				basename: "source",
				extension: "md",
				content: "[[nonexistent#Header]]",
				cache: {
					links: [
						{
							link: "nonexistent#Header",
							original: "[[nonexistent#Header]]",
							displayText: "nonexistent#Header",
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 22, offset: 22 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);

		expect(resolver.getBacklinksForHeader("nonexistent.md", "Header")).toEqual([]);
	});

	it("skips source files without metadata cache", () => {
		// resolvedLinks contains an entry but getCache returns null for it
		const app = {
			vault: {
				getFileByPath: () => null,
				cachedRead: () => Promise.resolve(""),
			},
			metadataCache: {
				resolvedLinks: { "nocache.md": { "target.md": 1 } },
				getCache: () => null,
				getFirstLinkpathDest: () => null,
			},
		};

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);
		expect(resolver.getBacklinksForHeader("target.md", "Anything")).toEqual([]);
	});

	it("loadPreviews fills previewText for matching ref positions", async () => {
		const app = createMockApp([
			{
				path: "target.md",
				basename: "target",
				extension: "md",
				content: "# Header\n",
				cache: {},
			},
			{
				path: "source.md",
				basename: "source",
				extension: "md",
				content: "See [[target#Header]] for context here",
				cache: {
					links: [
						{
							link: "target#Header",
							original: "[[target#Header]]",
							displayText: "target#Header",
							position: {
								start: { line: 0, col: 4, offset: 4 },
								end: { line: 0, col: 21, offset: 21 },
							},
						},
					],
				},
			},
		]);

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);
		const sources = resolver.getBacklinksForHeader("target.md", "Header");
		expect(sources[0]!.previewText).toBe("");

		await resolver.loadPreviews(sources);
		expect(sources[0]!.previewText.length).toBeGreaterThan(0);
		expect(sources[0]!.previewText).toContain("[[target#Header]]");
	});

	it("loadPreviews skips sources whose source file is missing", async () => {
		const sources = [
			{
				sourceFilePath: "missing.md",
				sourceFileName: "missing",
				lineNumber: 0,
				columnNumber: 0,
				previewText: "",
			},
		];
		const app = {
			vault: {
				getFileByPath: () => null,
				cachedRead: () => Promise.resolve(""),
			},
			metadataCache: {
				resolvedLinks: {},
				getCache: () => null,
				getFirstLinkpathDest: () => null,
			},
		};

		const resolver = new BacklinkResolver(app as unknown as App, onChanged);
		await resolver.loadPreviews(sources);
		expect(sources[0]!.previewText).toBe("");
	});
});

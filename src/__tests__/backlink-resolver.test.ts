import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeHeader, BacklinkResolver } from "../backlink-resolver";

// Mock obsidian module
vi.mock("obsidian", () => ({
	App: class {},
	TFile: class {},
}));

function createMockApp(
	files: Array<{
		path: string;
		basename: string;
		extension: string;
		content: string;
		cache: {
			links?: Array<{
				link: string;
				original: string;
				displayText: string;
				position: {
					start: { line: number; col: number; offset: number };
					end: { line: number; col: number; offset: number };
				};
			}>;
			embeds?: Array<{
				link: string;
				original: string;
				displayText: string;
				position: {
					start: { line: number; col: number; offset: number };
					end: { line: number; col: number; offset: number };
				};
			}>;
		};
	}>,
) {
	const fileObjects = files.map((f) => ({
		path: f.path,
		basename: f.basename,
		extension: f.extension,
	}));

	const cacheMap = new Map(files.map((f) => [f.path, f.cache]));
	const contentMap = new Map(files.map((f) => [f.path, f.content]));
	const fileMap = new Map(fileObjects.map((f) => [f.path, f]));

	return {
		vault: {
			getMarkdownFiles: () => fileObjects,
			cachedRead: (file: { path: string }) =>
				Promise.resolve(contentMap.get(file.path) ?? ""),
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => cacheMap.get(file.path) ?? null,
			getFirstLinkpathDest: (linkpath: string, _sourcePath: string) =>
				fileMap.get(linkpath + ".md") ?? fileMap.get(linkpath) ?? null,
		},
	};
}

describe("BacklinkResolver", () => {
	let onChanged: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onChanged = vi.fn();
	});

	it("finds backlinks with header fragments", async () => {
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

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();

		const sources = resolver.getBacklinksForHeader("target.md", "My Header");
		expect(sources).toHaveLength(1);
		expect(sources[0]!.sourceFilePath).toBe("source.md");
		expect(sources[0]!.sourceFileName).toBe("source");
		expect(sources[0]!.lineNumber).toBe(0);
	});

	it("normalizes header text for matching", async () => {
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

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();

		// Should match even though case and spacing differ
		const sources = resolver.getBacklinksForHeader("target.md", "My Header");
		expect(sources).toHaveLength(1);
	});

	it("handles self-references (empty linkpath)", async () => {
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

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();

		const sources = resolver.getBacklinksForHeader("note.md", "Intro");
		expect(sources).toHaveLength(1);
		expect(sources[0]!.sourceFilePath).toBe("note.md");
	});

	it("handles embeds with header fragments", async () => {
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

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();

		const sources = resolver.getBacklinksForHeader("target.md", "Section");
		expect(sources).toHaveLength(1);
	});

	it("ignores links without header fragment", async () => {
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

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();

		const sources = resolver.getBacklinksForHeader("target.md", "Title");
		expect(sources).toHaveLength(0);
	});

	it("ignores links with # but empty fragment", async () => {
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

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();

		const sources = resolver.getBacklinksForHeader("target.md", "Title");
		expect(sources).toHaveLength(0);
	});

	it("returns empty array for unknown file", () => {
		const app = createMockApp([]);
		const resolver = new BacklinkResolver(app as any, onChanged);
		expect(resolver.getBacklinksForHeader("nonexistent.md", "Header")).toEqual([]);
	});

	it("returns empty array for unknown header", async () => {
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

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();

		expect(resolver.getBacklinksForHeader("target.md", "Nonexistent Header")).toEqual([]);
	});

	it("collects multiple backlinks to the same header", async () => {
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

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();

		const sources = resolver.getBacklinksForHeader("target.md", "Header");
		expect(sources).toHaveLength(2);
		const paths = sources.map((s) => s.sourceFilePath).sort();
		expect(paths).toEqual(["a.md", "b.md"]);
	});

	it("increments version on each build", async () => {
		const app = createMockApp([]);
		const resolver = new BacklinkResolver(app as any, onChanged);
		expect(resolver.getVersion()).toBe(0);

		await resolver.buildMap();
		expect(resolver.getVersion()).toBe(1);

		await resolver.buildMap();
		expect(resolver.getVersion()).toBe(2);
	});

	it("ignores links to non-existent target files", async () => {
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

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();

		// No target file exists, so no backlinks should be found
		expect(resolver.getBacklinksForHeader("nonexistent.md", "Header")).toEqual([]);
	});

	it("skips files without metadata cache", async () => {
		const fileObjects = [
			{ path: "nocache.md", basename: "nocache", extension: "md" },
		];

		const app = {
			vault: {
				getMarkdownFiles: () => fileObjects,
				cachedRead: () => Promise.resolve(""),
			},
			metadataCache: {
				getFileCache: () => null,
				getFirstLinkpathDest: () => null,
			},
		};

		const resolver = new BacklinkResolver(app as any, onChanged);
		await resolver.buildMap();
		// Should not throw and map should be empty
		expect(resolver.getVersion()).toBe(1);
	});
});

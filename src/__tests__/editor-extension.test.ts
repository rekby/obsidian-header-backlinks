import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
	App: class {},
	editorInfoField: {},
	Menu: class {},
	setIcon: () => {},
	SuggestModal: class {},
	TFile: class {},
}));

vi.mock("@codemirror/view", () => ({
	Decoration: { none: {}, widget: () => ({}) },
	DecorationSet: {},
	EditorView: class {},
	ViewPlugin: { fromClass: () => ({}) },
	ViewUpdate: class {},
	WidgetType: class {},
}));

vi.mock("@codemirror/state", () => ({
	RangeSetBuilder: class {},
	StateEffect: { define: () => ({}) },
	StateField: { define: () => ({}) },
}));

import { stripTrailingHashes, groupSourcesByFile } from "../editor-extension";
import type { HeaderBacklinkSource } from "../types";

describe("stripTrailingHashes", () => {
	it("removes trailing hashes", () => {
		expect(stripTrailingHashes("My Title ##")).toBe("My Title");
	});

	it("removes trailing hashes with spaces", () => {
		expect(stripTrailingHashes("Title ###  ")).toBe("Title");
	});

	it("does not modify text without trailing hashes", () => {
		expect(stripTrailingHashes("Normal Title")).toBe("Normal Title");
	});

	it("does not remove hashes in the middle", () => {
		expect(stripTrailingHashes("Title ## with # hashes")).toBe("Title ## with # hashes");
	});

	it("handles empty string", () => {
		expect(stripTrailingHashes("")).toBe("");
	});

	it("requires space before trailing hashes", () => {
		// "Title##" should not be stripped (no space before ##)
		expect(stripTrailingHashes("Title##")).toBe("Title##");
	});
});

function makeSource(
	filePath: string,
	fileName: string,
	line: number,
	col: number,
	preview: string,
): HeaderBacklinkSource {
	return {
		sourceFilePath: filePath,
		sourceFileName: fileName,
		lineNumber: line,
		columnNumber: col,
		previewText: preview,
	};
}

describe("groupSourcesByFile", () => {
	it("groups sources by file path", () => {
		const sources = [
			makeSource("a.md", "a", 1, 0, "preview1"),
			makeSource("b.md", "b", 5, 0, "preview2"),
			makeSource("a.md", "a", 10, 0, "preview3"),
		];
		const groups = groupSourcesByFile(sources);
		expect(groups).toHaveLength(2);
	});

	it("sorts sources within group by line number", () => {
		const sources = [
			makeSource("a.md", "a", 10, 0, "late"),
			makeSource("a.md", "a", 2, 0, "early"),
			makeSource("a.md", "a", 5, 3, "mid"),
		];
		const groups = groupSourcesByFile(sources);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.sources.map((s) => s.lineNumber)).toEqual([2, 5, 10]);
	});

	it("sorts sources by column when line numbers match", () => {
		const sources = [
			makeSource("a.md", "a", 5, 20, "second"),
			makeSource("a.md", "a", 5, 5, "first"),
		];
		const groups = groupSourcesByFile(sources);
		expect(groups[0]!.sources.map((s) => s.columnNumber)).toEqual([5, 20]);
	});

	it("sorts groups alphabetically by file name", () => {
		const sources = [
			makeSource("folder/z.md", "z", 1, 0, "z"),
			makeSource("folder/a.md", "a", 1, 0, "a"),
			makeSource("folder/m.md", "m", 1, 0, "m"),
		];
		const groups = groupSourcesByFile(sources);
		expect(groups.map((g) => g.fileName)).toEqual(["a", "m", "z"]);
	});

	it("uses '>' suffix in title for multiple sources from same file", () => {
		const sources = [
			makeSource("a.md", "a", 1, 0, "first"),
			makeSource("a.md", "a", 5, 0, "second"),
		];
		const groups = groupSourcesByFile(sources);
		expect(groups[0]!.title).toBe("a >");
	});

	it("uses plain file name for single source", () => {
		const sources = [makeSource("a.md", "a", 1, 0, "only")];
		const groups = groupSourcesByFile(sources);
		expect(groups[0]!.title).toBe("a");
	});

	it("returns empty array for empty input", () => {
		expect(groupSourcesByFile([])).toEqual([]);
	});
});

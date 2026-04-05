import { describe, it, expect } from "vitest";
import { createFileTextIndex, buildReferencePreview } from "../source-preview";
import type { ReferenceCache } from "obsidian";

describe("createFileTextIndex", () => {
	it("splits text into lines and computes offsets", () => {
		const index = createFileTextIndex("abc\ndef\nghi");
		expect(index.lines).toEqual(["abc", "def", "ghi"]);
		expect(index.lineStarts).toEqual([0, 4, 8]);
	});

	it("handles single line", () => {
		const index = createFileTextIndex("hello");
		expect(index.lines).toEqual(["hello"]);
		expect(index.lineStarts).toEqual([0]);
	});

	it("handles empty string", () => {
		const index = createFileTextIndex("");
		expect(index.lines).toEqual([""]);
		expect(index.lineStarts).toEqual([0]);
	});

	it("handles CRLF line endings", () => {
		const index = createFileTextIndex("abc\r\ndef\r\nghi");
		expect(index.lines).toEqual(["abc", "def", "ghi"]);
		expect(index.lineStarts).toEqual([0, 5, 10]);
	});

	it("preserves original text", () => {
		const text = "line one\nline two";
		const index = createFileTextIndex(text);
		expect(index.text).toBe(text);
	});
});

function makeRef(
	link: string,
	startLine: number,
	startCol: number,
	startOffset: number,
	endLine: number,
	endCol: number,
	endOffset: number,
): ReferenceCache {
	return {
		link,
		original: `[[${link}]]`,
		displayText: link,
		position: {
			start: { line: startLine, col: startCol, offset: startOffset },
			end: { line: endLine, col: endCol, offset: endOffset },
		},
	} as ReferenceCache;
}

describe("buildReferencePreview", () => {
	it("builds preview with context around link", () => {
		const text = "Some text before the [[Target#header]] and some text after the link";
		const index = createFileTextIndex(text);
		const ref = makeRef(
			"Target#header",
			0, 21, 21,
			0, 38, 38,
		);
		const preview = buildReferencePreview(index, ref);
		expect(preview).toContain("[[Target#header]]");
		expect(preview).toContain("before");
	});

	it("handles link at start of line", () => {
		const text = "[[Target#header]] rest of line";
		const index = createFileTextIndex(text);
		const ref = makeRef("Target#header", 0, 0, 0, 0, 17, 17);
		const preview = buildReferencePreview(index, ref);
		expect(preview).toContain("[[Target#header]]");
		expect(preview).toContain("rest");
	});

	it("handles link at end of line", () => {
		const text = "Some text before [[Target#header]]";
		const index = createFileTextIndex(text);
		const ref = makeRef("Target#header", 0, 17, 17, 0, 34, 34);
		const preview = buildReferencePreview(index, ref);
		expect(preview).toContain("[[Target#header]]");
		expect(preview).toContain("before");
	});

	it("handles multiline block context", () => {
		const text = "First paragraph.\n\nSecond paragraph has [[Target#header]] link here.\n\nThird paragraph.";
		const index = createFileTextIndex(text);
		// "[[Target#header]]" starts at offset 39, ends at 57
		const ref = makeRef("Target#header", 2, 21, 39, 2, 39, 57);
		const preview = buildReferencePreview(index, ref);
		expect(preview).toContain("[[Target#header]]");
		// Should include context from same paragraph block only
		expect(preview).not.toContain("First paragraph");
		expect(preview).not.toContain("Third paragraph");
	});

	it("truncates long previews with ellipsis", () => {
		const longBefore = "word ".repeat(50);
		const text = `${longBefore}[[Target#header]] and more`;
		const index = createFileTextIndex(text);
		const linkStart = longBefore.length;
		const linkEnd = linkStart + "[[Target#header]]".length;
		const ref = makeRef("Target#header", 0, linkStart, linkStart, 0, linkEnd, linkEnd);
		const preview = buildReferencePreview(index, ref);
		expect(preview.length).toBeLessThanOrEqual(142); // 140 + "..."
	});

	it("handles self-reference (empty linkpath)", () => {
		const text = "See [[#my header]] for details";
		const index = createFileTextIndex(text);
		const ref = makeRef("#my header", 0, 4, 4, 0, 18, 18);
		const preview = buildReferencePreview(index, ref);
		expect(preview).toContain("[[#my header]]");
	});
});

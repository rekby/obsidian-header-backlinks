import { describe, it, expect } from "vitest";
import { normalizeHeader } from "../backlink-resolver";

describe("normalizeHeader", () => {
	it("returns lowercase trimmed text", () => {
		expect(normalizeHeader("  Hello World  ")).toBe("hello world");
	});

	it("collapses multiple spaces", () => {
		expect(normalizeHeader("foo   bar   baz")).toBe("foo bar baz");
	});

	it("collapses tabs and mixed whitespace", () => {
		expect(normalizeHeader("foo\t\tbar  baz")).toBe("foo bar baz");
	});

	it("lowercases mixed-case text", () => {
		expect(normalizeHeader("My Header Title")).toBe("my header title");
	});

	it("handles empty string", () => {
		expect(normalizeHeader("")).toBe("");
	});

	it("handles string with only spaces", () => {
		expect(normalizeHeader("   ")).toBe("");
	});

	it("handles single word", () => {
		expect(normalizeHeader("Title")).toBe("title");
	});

	it("preserves special characters", () => {
		expect(normalizeHeader("Header (with) [brackets]")).toBe("header (with) [brackets]");
	});

	it("handles unicode text", () => {
		expect(normalizeHeader("Заголовок Текст")).toBe("заголовок текст");
	});
});

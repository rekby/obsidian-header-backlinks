import { ReferenceCache } from "obsidian";

const PREVIEW_WORDS_BEFORE = 6;
const PREVIEW_WORDS_AFTER = 6;
const PREVIEW_MAX_LENGTH = 140;

export interface FileTextIndex {
	lines: string[];
	lineStarts: number[];
	text: string;
}

export function createFileTextIndex(text: string): FileTextIndex {
	const lines = text.split(/\r?\n/);
	const lineStarts: number[] = [];
	let offset = 0;

	for (const line of lines) {
		lineStarts.push(offset);
		// Find the actual separator length at this position in the original text
		offset += line.length;
		if (offset < text.length) {
			offset += text[offset] === "\r" ? 2 : 1;
		}
	}

	return { lines, lineStarts, text };
}

export function buildReferencePreview(index: FileTextIndex, ref: ReferenceCache): string {
	const startLine = ref.position.start.line;
	const endLine = ref.position.end.line;
	const blockStartLine = findBlockStartLine(index.lines, startLine);
	const blockEndLine = findBlockEndLine(index.lines, endLine);
	const blockStartOffset = index.lineStarts[blockStartLine] ?? 0;
	const blockEndOffset = getLineEndOffset(index, blockEndLine);
	const linkStartOffset = ref.position.start.offset;
	const linkEndOffset = ref.position.end.offset;
	const beforeText = collapseWhitespace(index.text.slice(blockStartOffset, linkStartOffset));
	const linkText = collapseWhitespace(index.text.slice(linkStartOffset, linkEndOffset));
	const afterText = collapseWhitespace(index.text.slice(linkEndOffset, blockEndOffset));
	const beforeWords = takeLastWords(beforeText, PREVIEW_WORDS_BEFORE);
	const afterWords = takeFirstWords(afterText, PREVIEW_WORDS_AFTER);

	return clampPreview(joinPreviewParts(beforeWords, linkText, afterWords));
}

function findBlockStartLine(lines: string[], lineNumber: number): number {
	let line = lineNumber;
	while (line > 0 && lines[line - 1]?.trim() !== "") {
		line--;
	}
	return line;
}

function findBlockEndLine(lines: string[], lineNumber: number): number {
	let line = lineNumber;
	while (line + 1 < lines.length && lines[line + 1]?.trim() !== "") {
		line++;
	}
	return line;
}

function getLineEndOffset(index: FileTextIndex, lineNumber: number): number {
	const lineStart = index.lineStarts[lineNumber] ?? index.text.length;
	const line = index.lines[lineNumber] ?? "";
	return lineStart + line.length;
}

function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function takeLastWords(text: string, limit: number): string {
	if (!text) return "";
	const words = text.split(/\s+/);
	return words.slice(-limit).join(" ");
}

function takeFirstWords(text: string, limit: number): string {
	if (!text) return "";
	const words = text.split(/\s+/);
	return words.slice(0, limit).join(" ");
}

function joinPreviewParts(before: string, link: string, after: string): string {
	return [before, link, after].filter((part) => part.length > 0).join(" ");
}

function clampPreview(text: string): string {
	if (text.length <= PREVIEW_MAX_LENGTH) return text;
	return `${text.slice(0, PREVIEW_MAX_LENGTH - 1).trimEnd()}...`;
}

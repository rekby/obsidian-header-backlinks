import { App, EditorPosition, MarkdownView, SuggestModal, TFile } from "obsidian";
import { HeaderBacklinkSource } from "./types";

export async function openBacklinkSource(app: App, source: HeaderBacklinkSource): Promise<void> {
	const file = app.vault.getAbstractFileByPath(source.sourceFilePath);
	if (!(file instanceof TFile)) return;

	const leaf = app.workspace.getLeaf(false);
	await leaf.openFile(file, { active: true });
	const view = leaf.view;
	if (!(view instanceof MarkdownView)) return;

	const position: EditorPosition = {
		line: source.lineNumber,
		ch: source.columnNumber,
	};

	view.editor.setCursor(position);
	view.editor.scrollIntoView({
		from: position,
		to: { line: source.lineNumber, ch: source.columnNumber + 1 },
	}, true);
	app.workspace.setActiveLeaf(leaf, { focus: true });
}

export class BacklinkOccurrencesModal extends SuggestModal<HeaderBacklinkSource> {
	private readonly fileName: string;
	private readonly onChoose: (source: HeaderBacklinkSource) => void;
	private readonly sources: HeaderBacklinkSource[];

	constructor(app: App, fileName: string, sources: HeaderBacklinkSource[], onChoose: (source: HeaderBacklinkSource) => void) {
		super(app);
		this.fileName = fileName;
		this.sources = sources;
		this.onChoose = onChoose;
		this.emptyStateText = "No links found";
	}

	getSuggestions(query: string): HeaderBacklinkSource[] {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return this.sources;

		return this.sources.filter((source) => {
			const candidate = formatOccurrenceLabel(source).toLowerCase();
			return candidate.includes(normalizedQuery);
		});
	}

	renderSuggestion(source: HeaderBacklinkSource, el: HTMLElement): void {
		el.createDiv({ text: formatOccurrenceLabel(source) });
	}

	onChooseSuggestion(source: HeaderBacklinkSource): void {
		this.onChoose(source);
	}

	onOpen(): void {
		void super.onOpen();
		this.setTitle(this.fileName);
		this.setPlaceholder(this.fileName);
		this.setInstructions([
			{ command: "Enter", purpose: "Jump to link" },
			{ command: "Esc", purpose: "Close" },
		]);
	}
}

function formatOccurrenceLabel(source: HeaderBacklinkSource): string {
	return `${source.lineNumber + 1}: ${source.previewText}`;
}

import { App, editorInfoField, Menu, setIcon } from "obsidian";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { BacklinkResolver } from "./backlink-resolver";
import { HeaderBacklinkSource } from "./types";
import { BacklinkOccurrencesModal, openBacklinkSource } from "./source-navigation";

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;
const RENAME_HEADING_CMD = "editor:rename-heading";

interface ObsidianCommand {
	name?: string;
}

interface ObsidianCommandsAPI {
	findCommand(id: string): ObsidianCommand | undefined;
	executeCommandById(id: string): void;
}

interface AppWithCommands {
	commands?: ObsidianCommandsAPI;
}

export const backlinkVersionEffect = StateEffect.define<number>();

export const backlinkVersionField = StateField.define<number>({
	create: () => 0,
	update(value, tr) {
		for (const e of tr.effects) {
			if (e.is(backlinkVersionEffect)) return e.value;
		}
		return value;
	},
});

class AnchorWidget extends WidgetType {
	constructor(
		private readonly sources: HeaderBacklinkSource[],
		private readonly app: App,
		private readonly headingLine: number,
	) {
		super();
	}

	eq(other: AnchorWidget): boolean {
		if (this.sources.length !== other.sources.length) return false;
		for (let i = 0; i < this.sources.length; i++) {
			const a = this.sources[i];
			const b = other.sources[i];
			if (!a || !b) return false;
			if (a.sourceFilePath !== b.sourceFilePath || a.lineNumber !== b.lineNumber) {
				return false;
			}
		}
		return true;
	}

	toDOM(): HTMLElement {
		const wrapper = activeDocument.createElement("span");
		wrapper.className = "header-backlink-anchor-wrapper";

		const el = activeDocument.createElement("span");
		el.className = "header-backlink-anchor";
		el.setAttribute("aria-label", `${this.sources.length} backlink(s)`);
		setIcon(el, "anchor");

		el.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			this.showContextMenu(evt);
		});

		wrapper.appendChild(el);
		return wrapper;
	}

	ignoreEvent(): boolean {
		return false;
	}

	private showContextMenu(evt: MouseEvent): void {
		const menu = new Menu();
		this.addRenameItem(menu);
		this.addBacklinkItems(menu);
		menu.showAtMouseEvent(evt);
	}

	private addRenameItem(menu: Menu): void {
		const commands = (this.app as unknown as AppWithCommands).commands;
		const renameCmd = commands?.findCommand(RENAME_HEADING_CMD);
		if (!renameCmd) return;

		menu.addItem((item) => {
			item.setTitle(renameCmd.name ?? "Rename this heading...");
			item.setIcon("pencil");
			item.onClick(() => {
				const editor = this.app.workspace.activeEditor?.editor;
				if (!editor) return;
				editor.setCursor({ line: this.headingLine, ch: 0 });
				commands?.executeCommandById(RENAME_HEADING_CMD);
			});
		});
		menu.addSeparator();
	}

	private addBacklinkItems(menu: Menu): void {
		for (const group of groupSourcesByFile(this.sources)) {
			menu.addItem((item) => {
				item.setTitle(group.title);
				item.onClick(() => { this.navigateToGroup(group); });
			});
		}
	}

	private navigateToGroup(group: { fileName: string; sources: HeaderBacklinkSource[] }): void {
		const first = group.sources[0];
		if (group.sources.length === 1 && first) {
			void openBacklinkSource(this.app, first);
			return;
		}

		new BacklinkOccurrencesModal(
			this.app,
			group.fileName,
			group.sources,
			(source) => { void openBacklinkSource(this.app, source); },
		).open();
	}
}

export function stripTrailingHashes(text: string): string {
	return text.replace(/\s+#+\s*$/, "");
}

export function groupSourcesByFile(sources: HeaderBacklinkSource[]): {
	fileName: string;
	sources: HeaderBacklinkSource[];
	title: string;
}[] {
	const groups = new Map<string, HeaderBacklinkSource[]>();

	for (const source of sources) {
		const existing = groups.get(source.sourceFilePath);
		if (existing) {
			existing.push(source);
		} else {
			groups.set(source.sourceFilePath, [source]);
		}
	}

	return Array.from(groups.entries())
		.map(([, fileSources]) => {
			const sortedSources = [...fileSources].sort((a, b) => {
				if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber;
				return a.columnNumber - b.columnNumber;
			});
			const fileName = sortedSources[0]?.sourceFileName ?? "";

			return {
				fileName,
				sources: sortedSources,
				title: sortedSources.length > 1 ? `${fileName} >` : fileName,
			};
		})
		.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function buildDecorations(view: EditorView, resolver: BacklinkResolver): DecorationSet {
	const info = view.state.field(editorInfoField);
	const file = info.file;
	if (!file) return Decoration.none;

	const builder = new RangeSetBuilder<Decoration>();

	for (const { from, to } of view.visibleRanges) {
		let pos = from;
		while (pos <= to) {
			const line = view.state.doc.lineAt(pos);
			const match = HEADING_RE.exec(line.text);
			const headingText = match?.[2];
			if (headingText !== undefined) {
				const rawHeading = stripTrailingHashes(headingText);
				const sources = resolver.getBacklinksForHeader(file.path, rawHeading);
				if (sources.length > 0) {
					builder.add(
						line.from,
						line.from,
						Decoration.widget({
							widget: new AnchorWidget(sources, info.app, line.number - 1),
							side: -1,
						}),
					);
				}
			}
			pos = line.to + 1;
		}
	}

	return builder.finish();
}

export function createEditorExtension(resolver: BacklinkResolver) {
	const decorationPlugin = ViewPlugin.fromClass(
		class BacklinkDecorationPlugin {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, resolver);
			}

			update(update: ViewUpdate) {
				const versionChanged =
					update.startState.field(backlinkVersionField) !==
					update.state.field(backlinkVersionField);

				if (update.docChanged || update.viewportChanged || versionChanged) {
					this.decorations = buildDecorations(update.view, resolver);
				}
			}
		},
		{ decorations: (v) => v.decorations },
	);

	return [backlinkVersionField, decorationPlugin];
}

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
	private sources: HeaderBacklinkSource[];
	private app: App;
	private headingLine: number;

	constructor(sources: HeaderBacklinkSource[], app: App, headingLine: number) {
		super();
		this.sources = sources;
		this.app = app;
		this.headingLine = headingLine;
	}

	eq(other: AnchorWidget): boolean {
		if (this.sources.length !== other.sources.length) return false;
		for (let i = 0; i < this.sources.length; i++) {
			const a = this.sources[i]!;
			const b = other.sources[i]!;
			if (a.sourceFilePath !== b.sourceFilePath || a.lineNumber !== b.lineNumber) {
				return false;
			}
		}
		return true;
	}

	toDOM(): HTMLElement {
		const wrapper = document.createElement("span");
		wrapper.className = "header-backlink-anchor-wrapper";

		const el = document.createElement("span");
		el.className = "header-backlink-anchor";
		el.setAttribute("aria-label", `${this.sources.length} backlink(s)`);
		setIcon(el, "anchor");

		el.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			const menu = new Menu();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any -- commands API is not in Obsidian's public types
			const renameCmd = (this.app as any).commands?.findCommand("editor:rename-heading") as { name?: string } | undefined;
			if (renameCmd) {
				menu.addItem((item) => {
					item.setTitle(renameCmd.name ?? "Rename this heading...");
					item.setIcon("pencil");
					item.onClick(() => {
						const editor = this.app.workspace.activeEditor?.editor;
						if (editor) {
							editor.setCursor({ line: this.headingLine, ch: 0 });
							// eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any -- executeCommandById is not in Obsidian's public types
							(this.app as any).commands.executeCommandById("editor:rename-heading");
						}
					});
				});
				menu.addSeparator();
			}
			for (const group of groupSourcesByFile(this.sources)) {
				menu.addItem((item) => {
					item.setTitle(group.title);
					item.onClick(() => {
						if (group.sources.length === 1) {
							void openBacklinkSource(this.app, group.sources[0]!);
							return;
						}

						new BacklinkOccurrencesModal(
							this.app,
							group.fileName,
							group.sources,
							(source) => {
								void openBacklinkSource(this.app, source);
							},
						).open();
					});
				});
			}
			menu.showAtMouseEvent(evt);
		});

		wrapper.appendChild(el);
		return wrapper;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

export function stripTrailingHashes(text: string): string {
	return text.replace(/\s+#+\s*$/, "");
}

export function groupSourcesByFile(sources: HeaderBacklinkSource[]): Array<{
	fileName: string;
	sources: HeaderBacklinkSource[];
	title: string;
}> {
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
	const file = info?.file;
	if (!file) return Decoration.none;

	const builder = new RangeSetBuilder<Decoration>();

	for (const { from, to } of view.visibleRanges) {
		let pos = from;
		while (pos <= to) {
			const line = view.state.doc.lineAt(pos);
			const match = line.text.match(HEADING_RE);
			if (match) {
				const rawHeading = stripTrailingHashes(match[2]!);
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
	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, resolver);
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.startState.field(backlinkVersionField) !==
						update.state.field(backlinkVersionField)
				) {
					this.decorations = buildDecorations(update.view, resolver);
				}
			}
		},
		{ decorations: (v) => v.decorations },
	);

	return [backlinkVersionField, plugin];
}

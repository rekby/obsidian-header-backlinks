import { App, editorInfoField, Menu, setIcon } from "obsidian";
import {
	EditorView,
	GutterMarker,
	ViewUpdate,
	gutter,
} from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import { BacklinkResolver } from "./backlink-resolver";
import { HeaderBacklinkSource } from "./types";

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

class AnchorGutterMarker extends GutterMarker {
	private sources: HeaderBacklinkSource[];
	private app: App;

	constructor(sources: HeaderBacklinkSource[], app: App) {
		super();
		this.sources = sources;
		this.app = app;
	}

	eq(other: AnchorGutterMarker): boolean {
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
		const el = document.createElement("span");
		el.className = "header-backlink-anchor";
		el.setAttribute("aria-label", `${this.sources.length} backlink(s)`);
		setIcon(el, "anchor");

		el.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			const menu = new Menu();
			for (const source of this.sources) {
				menu.addItem((item) => {
					item.setTitle(source.sourceFileName);
					item.onClick(() => {
						this.app.workspace.openLinkText(
							source.sourceFilePath,
							"",
							false,
						);
					});
				});
			}
			menu.showAtMouseEvent(evt);
		});

		return el;
	}
}

function stripTrailingHashes(text: string): string {
	return text.replace(/\s+#+\s*$/, "");
}

export function createEditorExtension(resolver: BacklinkResolver) {
	const anchorGutter = gutter({
		class: "cm-header-backlink-gutter",
		lineMarker(view, line) {
			const info = view.state.field(editorInfoField);
			const file = info?.file;
			if (!file) return null;

			const docLine = view.state.doc.lineAt(line.from);
			const match = docLine.text.match(HEADING_RE);
			if (!match) return null;

			const rawHeading = stripTrailingHashes(match[2]!);
			const sources = resolver.getBacklinksForHeader(file.path, rawHeading);
			if (sources.length === 0) return null;

			return new AnchorGutterMarker(sources, info.app);
		},
		lineMarkerChange(update: ViewUpdate): boolean {
			if (update.docChanged) return true;
			return (
				update.startState.field(backlinkVersionField) !==
				update.state.field(backlinkVersionField)
			);
		},
	});

	return [backlinkVersionField, anchorGutter];
}

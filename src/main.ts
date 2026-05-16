import { MarkdownView, Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";
import { BacklinkResolver } from "./backlink-resolver";
import { backlinkVersionEffect, createEditorExtension } from "./editor-extension";

export default class HandleHeaderLinkPlugin extends Plugin {
	private resolver!: BacklinkResolver;

	onload() {
		this.resolver = new BacklinkResolver(this.app, () => {
			this.notifyEditors();
		});

		this.registerEditorExtension(createEditorExtension(this.resolver));

		const scheduleInvalidate = () => { this.resolver.scheduleInvalidate(); };
		this.registerEvent(this.app.metadataCache.on("changed", scheduleInvalidate));
		this.registerEvent(this.app.metadataCache.on("deleted", scheduleInvalidate));
		this.registerEvent(this.app.metadataCache.on("resolved", scheduleInvalidate));
	}

	onunload() {
		this.resolver.destroy();
	}

	private notifyEditors(): void {
		const version = this.resolver.getVersion();
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				const cm = (leaf.view.editor as unknown as { cm?: EditorView }).cm;
				if (cm) {
					cm.dispatch({ effects: backlinkVersionEffect.of(version) });
				}
			}
		});
	}
}

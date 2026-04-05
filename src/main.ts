import { MarkdownView, Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";
import { BacklinkResolver } from "./backlink-resolver";
import { backlinkVersionEffect, createEditorExtension } from "./editor-extension";

export default class HandleHeaderLinkPlugin extends Plugin {
	private resolver!: BacklinkResolver;

	async onload() {
		this.resolver = new BacklinkResolver(this.app, () => {
			this.notifyEditors();
		});

		this.registerEditorExtension(createEditorExtension(this.resolver));

		this.app.workspace.onLayoutReady(() => {
			void this.resolver.rebuildNow();
		});

		const scheduleBuild = () => this.resolver.scheduleBuild();
		this.registerEvent(this.app.metadataCache.on("changed", scheduleBuild));
		this.registerEvent(this.app.metadataCache.on("deleted", scheduleBuild));
		this.registerEvent(this.app.metadataCache.on("resolved", scheduleBuild));
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

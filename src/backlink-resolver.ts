import { App, TFile, ReferenceCache } from "obsidian";
import { buildReferencePreview, createFileTextIndex } from "./source-preview";
import { HeaderBacklinksMap, HeaderBacklinkSource } from "./types";

export function normalizeHeader(text: string): string {
	return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export class BacklinkResolver {
	private app: App;
	private map: HeaderBacklinksMap = new Map();
	private rebuildTimeout: ReturnType<typeof setTimeout> | null = null;
	private rebuildSequence: Promise<void> = Promise.resolve();
	private version = 0;
	private onChanged: (() => void) | null = null;

	constructor(app: App, onChanged: () => void) {
		this.app = app;
		this.onChanged = onChanged;
	}

	getVersion(): number {
		return this.version;
	}

	getBacklinksForHeader(filePath: string, headerText: string): HeaderBacklinkSource[] {
		const fileMap = this.map.get(filePath);
		if (!fileMap) return [];
		return fileMap.get(normalizeHeader(headerText)) ?? [];
	}

	async buildMap(): Promise<void> {
		const newMap: HeaderBacklinksMap = new Map();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;

			const refs: ReferenceCache[] = [
				...(cache.links ?? []),
				...(cache.embeds ?? []),
			];
			if (refs.length === 0) continue;

			const sourceText = await this.app.vault.cachedRead(file);
			const textIndex = createFileTextIndex(sourceText);

			for (const ref of refs) {
				const hashIndex = ref.link.indexOf("#");
				if (hashIndex === -1) continue;

				const linkpath = ref.link.substring(0, hashIndex);
				const headerFragment = ref.link.substring(hashIndex + 1);
				if (!headerFragment) continue;

				let targetFile: TFile | null;
				if (linkpath === "") {
					targetFile = file;
				} else {
					targetFile = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
				}
				if (!targetFile) continue;

				const normalizedHeader = normalizeHeader(headerFragment);

				let fileMap = newMap.get(targetFile.path);
				if (!fileMap) {
					fileMap = new Map();
					newMap.set(targetFile.path, fileMap);
				}

				let sources = fileMap.get(normalizedHeader);
				if (!sources) {
					sources = [];
					fileMap.set(normalizedHeader, sources);
				}

				sources.push({
					sourceFilePath: file.path,
					sourceFileName: file.basename,
					lineNumber: ref.position.start.line,
					columnNumber: ref.position.start.col,
					previewText: buildReferencePreview(textIndex, ref),
				});
			}
		}

		this.map = newMap;
		this.version++;

		let totalHeaders = 0;
		for (const fileMap of newMap.values()) {
			totalHeaders += fileMap.size;
		}
		console.debug(`[HandleHeaderLink] Built backlinks map: ${newMap.size} files, ${totalHeaders} headers, version=${this.version}`);
	}

	rebuildNow(): Promise<void> {
		this.rebuildSequence = this.rebuildSequence
			.catch(() => undefined)
			.then(async () => {
				await this.buildMap();
				this.onChanged?.();
			});

		return this.rebuildSequence;
	}

	scheduleBuild(): void {
		if (this.rebuildTimeout !== null) {
			clearTimeout(this.rebuildTimeout);
		}
		this.rebuildTimeout = setTimeout(() => {
			this.rebuildTimeout = null;
			void this.rebuildNow();
		}, 150);
	}

	destroy(): void {
		if (this.rebuildTimeout !== null) {
			clearTimeout(this.rebuildTimeout);
			this.rebuildTimeout = null;
		}
		this.onChanged = null;
	}
}

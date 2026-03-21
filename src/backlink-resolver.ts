import { App, TFile, ReferenceCache } from "obsidian";
import { HeaderBacklinksMap, HeaderBacklinkSource } from "./types";

export function normalizeHeader(text: string): string {
	return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export class BacklinkResolver {
	private app: App;
	private map: HeaderBacklinksMap = new Map();
	private rebuildTimeout: ReturnType<typeof setTimeout> | null = null;
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

	buildMap(): void {
		const newMap: HeaderBacklinksMap = new Map();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;

			const refs: ReferenceCache[] = [
				...(cache.links ?? []),
				...(cache.embeds ?? []),
			];

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
				});
			}
		}

		this.map = newMap;
		this.version++;

		let totalHeaders = 0;
		for (const fileMap of newMap.values()) {
			totalHeaders += fileMap.size;
		}
		console.log(`[HandleHeaderLink] Built backlinks map: ${newMap.size} files, ${totalHeaders} headers, version=${this.version}`);
	}

	scheduleBuild(): void {
		if (this.rebuildTimeout !== null) {
			clearTimeout(this.rebuildTimeout);
		}
		this.rebuildTimeout = setTimeout(() => {
			this.rebuildTimeout = null;
			this.buildMap();
			this.onChanged?.();
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

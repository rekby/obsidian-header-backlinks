import { App, TFile, ReferenceCache } from "obsidian";
import { buildReferencePreview, createFileTextIndex, FileTextIndex } from "./source-preview";
import { HeaderBacklinksMap, HeaderBacklinkSource } from "./types";

const DEBOUNCE_MS = 150;

export function normalizeHeader(text: string): string {
	return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export class BacklinkResolver {
	private map: HeaderBacklinksMap = new Map();
	private rebuildTimeout: number | null = null;
	private rebuildSequence: Promise<void> = Promise.resolve();
	private version = 0;
	private onChanged: (() => void) | null = null;

	constructor(
		private readonly app: App,
		onChanged: () => void,
	) {
		this.onChanged = onChanged;
	}

	getVersion(): number {
		return this.version;
	}

	getBacklinksForHeader(filePath: string, headerText: string): HeaderBacklinkSource[] {
		return this.map.get(filePath)?.get(normalizeHeader(headerText)) ?? [];
	}

	async buildMap(): Promise<void> {
		const newMap: HeaderBacklinksMap = new Map();

		for (const file of this.app.vault.getMarkdownFiles()) {
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
				this.processReference(newMap, file, textIndex, ref);
			}
		}

		this.map = newMap;
		this.version++;
		this.logMapStats(newMap);
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
			window.clearTimeout(this.rebuildTimeout);
		}
		this.rebuildTimeout = window.setTimeout(() => {
			this.rebuildTimeout = null;
			void this.rebuildNow();
		}, DEBOUNCE_MS);
	}

	destroy(): void {
		if (this.rebuildTimeout !== null) {
			window.clearTimeout(this.rebuildTimeout);
			this.rebuildTimeout = null;
		}
		this.onChanged = null;
	}

	private processReference(
		map: HeaderBacklinksMap,
		sourceFile: TFile,
		textIndex: FileTextIndex,
		ref: ReferenceCache,
	): void {
		const hashIndex = ref.link.indexOf("#");
		if (hashIndex === -1) return;

		const linkpath = ref.link.substring(0, hashIndex);
		const headerFragment = ref.link.substring(hashIndex + 1);
		if (!headerFragment) return;

		const targetFile = linkpath === ""
			? sourceFile
			: this.app.metadataCache.getFirstLinkpathDest(linkpath, sourceFile.path);
		if (!targetFile) return;

		const fileMap = getOrCreate(
			map, targetFile.path, () => new Map<string, HeaderBacklinkSource[]>(),
		);
		const sources = getOrCreate(
			fileMap, normalizeHeader(headerFragment), () => [] as HeaderBacklinkSource[],
		);

		sources.push({
			sourceFilePath: sourceFile.path,
			sourceFileName: sourceFile.basename,
			lineNumber: ref.position.start.line,
			columnNumber: ref.position.start.col,
			previewText: buildReferencePreview(textIndex, ref),
		});
	}

	private logMapStats(map: HeaderBacklinksMap): void {
		let totalHeaders = 0;
		for (const fileMap of map.values()) {
			totalHeaders += fileMap.size;
		}
		console.debug(
			`[HandleHeaderLink] Built backlinks map: ${map.size} files, ${totalHeaders} headers, version=${this.version}`,
		);
	}
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
	let value = map.get(key);
	if (value === undefined) {
		value = create();
		map.set(key, value);
	}
	return value;
}

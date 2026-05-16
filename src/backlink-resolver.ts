import { App, ReferenceCache } from "obsidian";
import { buildReferencePreview, createFileTextIndex } from "./source-preview";
import { HeaderBacklinkSource } from "./types";

const DEBOUNCE_MS = 150;

export function normalizeHeader(text: string): string {
	return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export class BacklinkResolver {
	private fileCache: Map<string, Map<string, HeaderBacklinkSource[]>> = new Map();
	private invalidateTimeout: number | null = null;
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

	getBacklinksForHeader(targetPath: string, headerText: string): HeaderBacklinkSource[] {
		const fileMap = this.getOrBuildFileMap(targetPath);
		return fileMap.get(normalizeHeader(headerText)) ?? [];
	}

	invalidate(): void {
		this.fileCache.clear();
		this.version++;
		this.onChanged?.();
	}

	scheduleInvalidate(): void {
		if (this.invalidateTimeout !== null) {
			window.clearTimeout(this.invalidateTimeout);
		}
		this.invalidateTimeout = window.setTimeout(() => {
			this.invalidateTimeout = null;
			this.invalidate();
		}, DEBOUNCE_MS);
	}

	async loadPreviews(sources: HeaderBacklinkSource[]): Promise<void> {
		const bySource = new Map<string, HeaderBacklinkSource[]>();
		for (const source of sources) {
			if (source.previewText) continue;
			const bucket = bySource.get(source.sourceFilePath);
			if (bucket) {
				bucket.push(source);
			} else {
				bySource.set(source.sourceFilePath, [source]);
			}
		}

		await Promise.all(
			Array.from(bySource.entries()).map(async ([path, items]) => {
				const file = this.app.vault.getFileByPath(path);
				if (!file) return;
				const cache = this.app.metadataCache.getCache(path);
				if (!cache) return;

				const text = await this.app.vault.cachedRead(file);
				const index = createFileTextIndex(text);
				const refs: ReferenceCache[] = [
					...(cache.links ?? []),
					...(cache.embeds ?? []),
				];

				for (const item of items) {
					const ref = refs.find(
						(r) =>
							r.position.start.line === item.lineNumber &&
							r.position.start.col === item.columnNumber,
					);
					if (ref) {
						item.previewText = buildReferencePreview(index, ref);
					}
				}
			}),
		);
	}

	destroy(): void {
		if (this.invalidateTimeout !== null) {
			window.clearTimeout(this.invalidateTimeout);
			this.invalidateTimeout = null;
		}
		this.fileCache.clear();
		this.onChanged = null;
	}

	private getOrBuildFileMap(targetPath: string): Map<string, HeaderBacklinkSource[]> {
		const cached = this.fileCache.get(targetPath);
		if (cached) return cached;
		const built = this.buildFileMap(targetPath);
		this.fileCache.set(targetPath, built);
		return built;
	}

	private buildFileMap(targetPath: string): Map<string, HeaderBacklinkSource[]> {
		const map = new Map<string, HeaderBacklinkSource[]>();
		const resolvedLinks = this.app.metadataCache.resolvedLinks;

		for (const sourcePath of Object.keys(resolvedLinks)) {
			const targets = resolvedLinks[sourcePath];
			if (!targets || !(targetPath in targets)) continue;

			const cache = this.app.metadataCache.getCache(sourcePath);
			if (!cache) continue;

			const refs: ReferenceCache[] = [
				...(cache.links ?? []),
				...(cache.embeds ?? []),
			];

			const sourceBasename = basenameOf(sourcePath);
			for (const ref of refs) {
				this.processReference(map, sourcePath, sourceBasename, targetPath, ref);
			}
		}

		return map;
	}

	private processReference(
		map: Map<string, HeaderBacklinkSource[]>,
		sourcePath: string,
		sourceBasename: string,
		targetPath: string,
		ref: ReferenceCache,
	): void {
		const hashIndex = ref.link.indexOf("#");
		if (hashIndex === -1) return;

		const linkpath = ref.link.substring(0, hashIndex);
		const headerFragment = ref.link.substring(hashIndex + 1);
		if (!headerFragment) return;

		const resolvedTarget = linkpath === ""
			? sourcePath
			: this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path;
		if (resolvedTarget !== targetPath) return;

		const headerKey = normalizeHeader(headerFragment);
		const sources = getOrCreate(map, headerKey, () => [] as HeaderBacklinkSource[]);

		sources.push({
			sourceFilePath: sourcePath,
			sourceFileName: sourceBasename,
			lineNumber: ref.position.start.line,
			columnNumber: ref.position.start.col,
			previewText: "",
		});
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

function basenameOf(path: string): string {
	const slash = path.lastIndexOf("/");
	const name = slash >= 0 ? path.substring(slash + 1) : path;
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.substring(0, dot) : name;
}

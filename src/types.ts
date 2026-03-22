export interface HeaderBacklinkSource {
	sourceFilePath: string;
	sourceFileName: string;
	lineNumber: number;
	columnNumber: number;
	previewText: string;
}

/** filePath -> normalizedHeader -> sources[] */
export type HeaderBacklinksMap = Map<string, Map<string, HeaderBacklinkSource[]>>;

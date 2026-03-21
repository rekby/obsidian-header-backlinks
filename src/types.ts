export interface HeaderBacklinkSource {
	sourceFilePath: string;
	sourceFileName: string;
	lineNumber: number;
}

/** filePath -> normalizedHeader -> sources[] */
export type HeaderBacklinksMap = Map<string, Map<string, HeaderBacklinkSource[]>>;

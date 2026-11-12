import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { CallerInfo } from "./caller";


/** A canonical file URL; source coordinates are metadata, never part of href. */
export class FileURL<
    TPathName extends string = string,
    TLineno extends `${number}` = `${number}`,
    TColno extends `${number}` = `${number}`
> extends URL {
    readonly lineno: TLineno;
    readonly colno: TColno;

    constructor(filepath: TPathName, lineno: TLineno, colno: TColno) {
        super(pathToFileURL(filepath));
        for (const coordinate of [ lineno, colno ]) {
            if (!/^[1-9]\d*$/.test(coordinate) || !Number.isSafeInteger(Number(coordinate))) {
                throw new RangeError("Source coordinates must be positive safe integers");
            }
        }
        this.lineno = lineno;
        this.colno = colno;
    }

    get filePath(): TPathName {
        return fileURLToPath(this) as TPathName;
    }

    private get packageFile(): string | undefined {
        let directory = this.dirName;
        while (true) {
            const candidate = path.join(directory, "package.json");
            if (existsSync(candidate)) {
                return candidate;
            }
            const parent = path.dirname(directory);
            if (parent === directory) {
                return undefined;
            }
            directory = parent;
        }
    }

    get packagePath(): string {
        const packageFile = this.packageFile;
        return packageFile ? path.dirname(packageFile) : this.dirName;
    }

    get packageName(): string {
        const packageFile = this.packageFile;
        if (packageFile) {
            try {
                const content: unknown = JSON.parse(readFileSync(packageFile, "utf-8"));
                if (
                    content
                    && typeof content === "object"
                    && "name" in content
                    && typeof content.name === "string"
                    && content.name.length > 0
                ) {
                    return content.name;
                }
            } catch {
                // Package metadata is optional, including for virtual or missing source files.
            }
        }
        return path.basename(this.packagePath);
    }
    get relPath(): string {
        return path.relative(this.packagePath, this.filePath);
    }
    get baseName(): string {
        return path.basename(this.filePath);
    }
    get dirName(): string {
        return path.dirname(this.filePath);
    }
    get fileExtension(): string {
        return path.extname(this.filePath);
    }
    get lineNumber(): TLineno {
        return this.lineno;
    }
    get columnNumber(): TColno {
        return this.colno;
    }
    get location(): `${TPathName}:${TLineno}:${TColno}` {
        return `${this.filePath}:${this.lineNumber}:${this.columnNumber}` as `${TPathName}:${TLineno}:${TColno}`;
    }
    get vscodeLink(): string {
        return `vscode://file${this.pathname}:${this.lineNumber}:${this.columnNumber}`;
    }

    oscHyperLink(label: string): string {
        return `\x1b]8;;${this.vscodeLink}\x07${label}\x1b]8;;\x07`;
    }

    static fromFilePath<
        TPathName extends string,
        TLineno extends `${number}`,
        TColno extends `${number}`
    >(
        filepath: TPathName,
        lineno: TLineno,
        colno: TColno
    ): FileURL<TPathName, TLineno, TColno> {
        return new FileURL<TPathName, TLineno, TColno>(filepath, lineno, colno);
    }

    private static parseLocation(location: string): [string, `${number}`, `${number}`] {
        const match = /^(.*):([1-9]\d*):([1-9]\d*)$/.exec(location);
        if (!match || !match[1]) {
            throw new TypeError("Expected a source location in path:line:column format");
        }
        return [ match[1], match[2] as `${number}`, match[3] as `${number}` ];
    }

    static fromLocation(location: string): FileURL {
        const [ filepath, lineno, colno ] = FileURL.parseLocation(location);
        return new FileURL(filepath, lineno, colno);
    }

    static fromVSCodeLink(link: string): FileURL {
        const url = new URL(link);
        if (
            url.protocol !== "vscode:"
            || url.hostname !== "file"
            || url.port
            || url.username
            || url.password
            || url.search
            || url.hash
        ) {
            throw new TypeError("Expected an encoded vscode://file source link");
        }
        const [ pathname, lineno, colno ] = FileURL.parseLocation(url.pathname);
        const fileURL = new URL("file:///");
        fileURL.pathname = pathname;
        return new FileURL(fileURLToPath(fileURL), lineno, colno);
    }

    /** A canonical file href carries no source coordinates; use fromLocation for those. */
    static fromHref(href: string): FileURL<string, "1", "1"> {
        return new FileURL(fileURLToPath(href), "1", "1");
    }

    static fromFileURL<
        TPathName extends string,
        TLineno extends `${number}`,
        TColno extends `${number}`
    >(fileURL: FileURL<TPathName, TLineno, TColno>): FileURL<TPathName, TLineno, TColno>;
    static fromFileURL(fileURL: URL): FileURL<string, "1", "1">;
    static fromFileURL(fileURL: URL): FileURL {
        return fileURL instanceof FileURL
            ? new FileURL(fileURL.filePath, fileURL.lineNumber, fileURL.columnNumber)
            : FileURL.fromHref(fileURL.href);
    }

    static fromCallerInfo(caller: CallerInfo): FileURL {
        if (!caller.file) {
            throw new Error("Caller file is required");
        }
        return new FileURL(caller.file, caller.line, caller.column);
    }
}

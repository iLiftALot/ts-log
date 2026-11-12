import path from "node:path";
import { formatWithOptions, type InspectOptions } from "node:util";

import { config } from "dotenv";

import { getCallerInfo } from "./caller";
import { LOG_LEVEL_APPEARANCE, ansiColorDepth, ansiText, type ANSIDepth, type LogLevel } from "./color";
import { TimeZonedDate } from "./date";
import { FileURL } from "./url";


config({ quiet: true });

export interface LoggerOptions extends InspectOptions {
    /** Enable OSC 8 links only when the output terminal is known to support them. */
    hyperlinks?: boolean;
}

/**
 * A versatile logging utility that provides color-coded, timestamped log messages with source information.
 * Supports multiple log levels and adapts its output based on the environment (production or development).
 *
 * @class Logger
 */
export class Logger {
    /** Automatically determine the environment (true if production) */
    private readonly isProduction = process.env.NODE_ENV === "production";
    private readonly DEFAULT_INSPECT_OPTIONS: InspectOptions = {
        showHidden: !this.isProduction,
        depth: Infinity,
        maxArrayLength: Infinity,
        maxStringLength: Infinity,
        compact: false,
        sorted: false,
        numericSeparator: true,
        showProxy: !this.isProduction // Internal structure of Proxy-wrapped objects
    };

    private readonly inspectOptions: InspectOptions;
    private readonly hyperlinks: boolean;

    constructor(options: LoggerOptions = {}) {
        const { hyperlinks = true, ...inspectOptions } = options;
        this.inspectOptions = { ...this.DEFAULT_INSPECT_OPTIONS, ...inspectOptions };
        this.hyperlinks = hyperlinks;
    }

    private colorDepth(stream: NodeJS.WriteStream): ANSIDepth {
        if (this.inspectOptions.colors === false) {
            return 1;
        }
        const depth = ansiColorDepth(stream);
        return this.inspectOptions.colors === true && depth === 1 ? 4 : depth;
    }

    /**
     * Helper to generate consistent, color-coded prefixes with timestamps.
     * @param logLevel The log level for which to generate the prefix
     * @returns A formatted string containing the timestamp, log level, and source information
     */
    private getPrefix(logLevel: LogLevel): string {
        if (!Object.hasOwn(LOG_LEVEL_APPEARANCE, logLevel)) {
            throw new Error(`Invalid log level: ${logLevel}`);
        }

        const timestamp = new TimeZonedDate().toISOString(3);
        const levelText = logLevel.toUpperCase();

        if (typeof window !== "undefined") {
            return `[${timestamp}] [${levelText}]:`;
        }

        let srcUrl: FileURL | undefined;
        let label = "<unknown>";
        try {
            const caller = getCallerInfo();
            if (path.isAbsolute(caller.file)) {
                srcUrl = FileURL.fromCallerInfo(caller);
                label = `${srcUrl.baseName}:${
                    caller.functionName ? caller.functionName + ":" : ""
                }${srcUrl.lineNumber}`;
            }
        } catch {
            // Optional source metadata must never prevent a message from being logged.
        }

        const stream = logLevel === "warn" || logLevel === "error"
            ? process.stderr
            : process.stdout;

        const depth = this.colorDepth(stream);
        const maxWidth = Math.max(
            ...Object.keys(LOG_LEVEL_APPEARANCE).map((key) => key.length)
        );
        const padding = " ".repeat(maxWidth - levelText.length);

        const location = this.hyperlinks && stream.isTTY && depth >= 4 && srcUrl
            ? srcUrl.oscHyperLink(label)
            : label;

        const coloredTimestamp = ansiText(
            timestamp,
            { foreground: "FG_GREEN", styles: [ "DIM" ] },
            depth
        );
        const level = ansiText(
            levelText,
            LOG_LEVEL_APPEARANCE[logLevel],
            depth
        );
        const source = ansiText(
            location,
            {
                foreground: depth >= 24 ? { kind: "rgb", value: [ 128, 128, 128 ] } : "FG_BRIGHT_BLACK",
                styles: [ "DIM", "ITALIC" ]
            },
            depth
        );

        return `${coloredTimestamp} [${level}]${padding} ${source} -`;
    }

    private formatArgs(
        stream: NodeJS.WriteStream,
        args: unknown[]
    ): string {
        return formatWithOptions(
            {
                ...this.inspectOptions,
                colors: this.colorDepth(stream) >= 4
            },
            ...args
        );
    }

    log(...args: unknown[]): void {
        if (this.isProduction) {
            return;
        }
        console.log(this.getPrefix("log"), this.formatArgs(process.stdout, args));
    }

    debug(...args: unknown[]): void {
        if (this.isProduction) {
            return;
        }
        console.debug(this.getPrefix("debug"), this.formatArgs(process.stdout, args));
    }

    info(...args: unknown[]): void {
        if (this.isProduction) {
            return;
        }
        console.info(this.getPrefix("info"), this.formatArgs(process.stdout, args));
    }

    warn(...args: unknown[]): void {
        if (this.isProduction) {
            return;
        }
        console.warn(this.getPrefix("warn"), this.formatArgs(process.stderr, args));
    }

    error(...args: unknown[]): void {
        if (this.isProduction) {
            return;
        }
        console.error(this.getPrefix("error"), this.formatArgs(process.stderr, args));
    }

    /** Advanced Browser Styling Example (Optional UI flare for frontend developers) */
    success(message: string, ...args: unknown[]): void {
        if (this.isProduction) {
            return;
        }

        if (typeof window !== "undefined") {
            // Advanced CSS styling strictly for Browser Developer Tools
            console.log(
                `%c${this.getPrefix("success")} %c${message}`,
                "color: #0edd98; font-weight: bold;", // Prefix style
                "color: inherit;", // Message style
                ...args
            );
        } else {
            // Node.js fallback
            console.log(this.getPrefix("success"), this.formatArgs(process.stdout, [ message, ...args ]));
        }
    }

    /** Test method to demonstrate all logging levels */
    static test(): void {
        const instance = new Logger();
        instance.log("This is a log message.");
        instance.debug("This is a debug message.");
        instance.info("This is an info message.");
        instance.warn("This is a warning message.");
        instance.error("This is an error message.");
        instance.success("This is a success message.");
    }
}

const logger = new Logger();
export default logger;

/** Tests the Logger class by invoking all available logging methods with sample messages. */
export function testLogger(): void {
    Logger.test();
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
    testLogger();
}

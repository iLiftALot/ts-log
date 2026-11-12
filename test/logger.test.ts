import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { runInNewContext } from "node:vm";

import { Temporal } from "@js-temporal/polyfill";
import { getCallerInfo } from "src/caller";
import { ansiColorDepth, ansiText } from "src/color";
import { TimeZonedDate } from "src/date";
import { Logger } from "src/index";
import { asPositiveInteger } from "src/types";
import { FileURL } from "src/url";


const environmentKeys = [ "NODE_ENV", "FORCE_COLOR", "NO_COLOR", "NODE_DISABLE_COLORS" ];
let environment: Record<string, string | undefined>;

beforeEach(() => {
    environment = Object.fromEntries(environmentKeys.map((key) => [ key, process.env[key] ]));
    for (const key of environmentKeys) delete process.env[key];
    process.env.NODE_ENV = "development";
});

afterEach(() => {
    for (const [ key, value ] of Object.entries(environment)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
});

function withEnv<T>(values: Record<string, string | undefined>, callback: () => T): T {
    const previous = Object.fromEntries(Object.keys(values).map((key) => [ key, process.env[key] ]));
    for (const [ key, value ] of Object.entries(values)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
    try {
        return callback();
    } finally {
        for (const [ key, value ] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

function captureConsole<T>(callback: () => T): { result: T; calls: unknown[][] } {
    const calls: unknown[][] = [];
    const methods = [ "log", "debug", "info", "warn", "error" ] as const;
    const originals = methods.map((key) => [ key, console[key] ] as const);
    for (const key of methods) {
        console[key] = (...args: unknown[]) => {
            calls.push(args);
        };
    }
    try {
        return { result: callback(), calls };
    } finally {
        for (const [ key, value ] of originals) console[key] = value;
    }
}

test("importing the logger singleton does not alter global inspection defaults", () => {
    const modulePath = path.join(__dirname, `index${path.extname(__filename)}`);
    const script = [
        'const assert = require("node:assert/strict");',
        'const { inspect } = require("node:util");',
        "const before = { ...inspect.defaultOptions };",
        "require(process.argv[1]);",
        "assert.deepEqual(inspect.defaultOptions, before);"
    ]
        .join("\n");
    const result = spawnSync(process.execPath, [
        ...process.execArgv.filter((argument) => argument !== "--test"),
        "-e",
        script,
        modulePath
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || String(result.error));
});

test("Logger uses instance inspect options without mutating global defaults", () => {
    const original = { ...inspect.defaultOptions };
    const logger = new Logger({ depth: 0, colors: false, sorted: true });
    assert.deepEqual(inspect.defaultOptions, original);
    const { calls } = captureConsole(() => logger.log({ z: { nested: { value: 1 } }, a: 2 }));
    assert.match(String(calls[0]?.[1]), /\[Object\]/);
    assert.ok(String(calls[0]?.[1]).indexOf("a:") < String(calls[0]?.[1]).indexOf("z:"));
    assert.doesNotMatch(String(calls[0]?.[1]), /\x1b\[/);
    const verbose = new Logger({ depth: Infinity, colors: false });
    assert.match(String(captureConsole(() => verbose.log({ nested: { value: 1 } })).calls[0]?.[1]), /value: 1/);
    assert.match(String(captureConsole(() => logger.log({ nested: { value: 1 } })).calls[0]?.[1]), /\[Object\]/);
    assert.deepEqual(inspect.defaultOptions, original);
});

test("Logger success formats message and substitutions with Node formatArgs semantics", () => {
    const logger = new Logger({ colors: false });
    const { calls } = captureConsole(() => logger.success("value: %d / %s", 42, "ok"));
    assert.equal(calls[0]?.[1], "value: 42 / ok");
});

test("production Logger silences every level", () => {
    withEnv({ NODE_ENV: "production" }, () => {
        const logger = new Logger();
        const { calls } = captureConsole(() => {
            logger.log("x");
            logger.debug("x");
            logger.info("x");
            logger.warn("x");
            logger.error("x");
            logger.success("x");
        });
        assert.equal(calls.length, 0);
    });
});

test("colors:false suppresses message and prefix ANSI even under FORCE_COLOR", () => {
    withEnv({ FORCE_COLOR: "3", NO_COLOR: undefined, NODE_DISABLE_COLORS: undefined }, () => {
        const { calls } = captureConsole(() => new Logger({ colors: false }).log({ value: 1 }));
        assert.doesNotMatch(String(calls[0]?.[0]) + String(calls[0]?.[1]), /\x1b\[/);
    });
});

test("getCallerInfo resolves the immediate caller at the documented stack depth", () => {
    function knownCaller() {
        return getCallerInfo(1);
    }
    const caller = knownCaller();
    assert.equal(caller.functionName, "knownCaller");
    assert.equal(path.basename(caller.file), "logger.test.ts");
    assert.ok(Number(caller.line) > 0);
    assert.ok(Number(caller.column) > 0);
});

test("getPrefix degrades virtual caller sources to unknown rather than throwing", () => {
    const logger = new Logger({ colors: false });
    const { calls } = captureConsole(() => runInNewContext('logger.log("virtual source")', { logger }));
    assert.equal(calls.length, 1);
    assert.match(String(calls[0]?.[0]), /<unknown>/);
    assert.equal(calls[0]?.[1], "virtual source");
});

test("FileURL is a URL with canonical encoded href and separate location metadata", () => {
    const raw = "/tmp/a b#c?d%é:part.ts";
    const file = FileURL.fromFilePath(raw, "12", "7");
    assert.ok(file instanceof URL);
    assert.equal(file.filePath, raw);
    assert.equal(file.lineNumber, "12");
    assert.equal(file.columnNumber, "7");
    assert.equal(file.href, pathToFileURL(raw).href);
    assert.equal(file.pathname, pathToFileURL(raw).pathname);
    assert.equal(String(file), file.href);
    assert.equal(fileURLToPath(file), raw);
    assert.equal(file.href.includes(":12:7"), false);
});

test("FileURL location, VS Code link, href, native URL, and instance factories preserve intended metadata", () => {
    const raw = "/tmp/name:with spaces#?.ts";
    const original = FileURL.fromFilePath(raw, "21", "4");
    assert.equal(FileURL.fromLocation(original.location).filePath, raw);
    const fromLocation = FileURL.fromLocation(original.location);
    assert.equal(fromLocation.lineNumber, "21");
    assert.equal(fromLocation.columnNumber, "4");
    const fromEditor = FileURL.fromVSCodeLink(original.vscodeLink);
    assert.equal(fromEditor.filePath, raw);
    assert.equal(fromEditor.lineNumber, "21");
    assert.equal(fromEditor.columnNumber, "4");
    const fromHref = FileURL.fromHref(original.href);
    assert.equal(fromHref.filePath, raw);
    assert.equal(fromHref.lineNumber, "1");
    assert.equal(fromHref.columnNumber, "1");
    const native = FileURL.fromFileURL(new URL(original.href));
    assert.equal(native.lineNumber, "1");
    assert.equal(native.columnNumber, "1");
    const copied = FileURL.fromFileURL(original);
    assert.equal(copied.lineNumber, "21");
    assert.equal(copied.columnNumber, "4");
});

test("FileURL parses colon-containing locations from the right and validates coordinates", () => {
    const file = FileURL.fromLocation("/tmp/a:b:c.ts:8:9");
    assert.equal(file.filePath, "/tmp/a:b:c.ts");
    assert.throws(() => FileURL.fromFilePath("/tmp/a.ts", "0", "1"), RangeError);
    assert.throws(() => FileURL.fromFilePath("/tmp/a.ts", "1", `${Number.MAX_SAFE_INTEGER + 1}`), RangeError);
    assert.throws(() => FileURL.fromFilePath("/tmp/a.ts", "1.5", "1"), RangeError);
});

test("FileURL.fromCallerInfo preserves caller metadata", () => {
    const file = FileURL.fromCallerInfo({
        file: "/tmp/caller.ts",
        functionName: "caller",
        line: "17",
        column: "6"
    });
    assert.equal(file.filePath, "/tmp/caller.ts");
    assert.equal(file.lineNumber, "17");
    assert.equal(file.columnNumber, "6");
});

test("Logger hyperlinks default off and can be disabled for terminal prefixes", () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    try {
        Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
        withEnv({ FORCE_COLOR: "3", NO_COLOR: undefined, NODE_DISABLE_COLORS: undefined }, () => {
            const plain = new Logger();
            const linked = new Logger({ hyperlinks: true });
            const prefix = () => String(captureConsole(() => linked.log("link")).calls[0]?.[0]);
            assert.match(String(captureConsole(() => plain.log("plain")).calls[0]?.[0]), /\x1b\]8;;/);
            assert.match(prefix(), /\x1b\]8;;vscode:\/\/file\//);
            Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
            assert.doesNotMatch(prefix(), /\x1b\]8;;/);
        });
    } finally {
        if (descriptor) {
            Object.defineProperty(process.stdout, "isTTY", descriptor);
        } else {
            Reflect.deleteProperty(process.stdout, "isTTY");
        }
    }
});

test("FileURL package metadata falls back to containing directory and finds ancestor manifests", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "logger-fileurl-"));
    try {
        const project = path.join(root, "project");
        const nested = path.join(project, "src", "missing");
        mkdirSync(nested, { recursive: true });
        writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "fixture" }));
        const missing = FileURL.fromFilePath(path.join(nested, "not-created.ts"), "1", "1");
        assert.equal(missing.packageName, "fixture");
        assert.equal(missing.packagePath, project);
        const noManifest = FileURL.fromFilePath(path.join(root, "loose", "file.ts"), "1", "1");
        assert.equal(noManifest.packagePath, path.join(root, "loose"));
        assert.equal(noManifest.packageName, "loose");
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("ansiText emits combined codes without a redundant opening reset", () => {
    const styled = ansiText("hello", { foreground: "FG_RED", styles: [ "BOLD", "ITALIC" ] }, 4);
    assert.equal(styled, "\x1b[1;3;31mhello\x1b[0m");
    assert.equal(ansiText("plain", { styles: [ "BOLD" ] }, 1), "plain");
});

test("ansiText validates untyped RGB and palette values and preserves outer styles when nested", () => {
    assert.throws(() => ansiText("x", { foreground: { kind: "rgb", value: [ 256, 0, 0 ] } } as never, 24), RangeError);
    assert.throws(() => ansiText("x", { foreground: { kind: "palette", value: -1 } } as never, 8), RangeError);
    const inner = ansiText("inner", { foreground: "FG_RED" }, 4);
    const outer = ansiText(`outer ${inner} tail`, { styles: [ "BOLD" ] }, 4);
    assert.equal(outer, "\x1b[1mouter \x1b[31minner\x1b[0m\x1b[1m tail\x1b[0m");
});

test("ansiColorDepth honors stream structure, FORCE_COLOR, disable flags, and valid depths", () => {
    const stream = { isTTY: true, getColorDepth: () => 99 } as NodeJS.WriteStream;
    assert.equal(ansiColorDepth(stream), 1);
    withEnv({ FORCE_COLOR: "2", NO_COLOR: undefined, NODE_DISABLE_COLORS: undefined }, () => {
        assert.equal(ansiColorDepth({ isTTY: false } as NodeJS.WriteStream), 8);
    });
    withEnv({ FORCE_COLOR: undefined, NO_COLOR: "yes", NODE_DISABLE_COLORS: undefined }, () => {
        assert.equal(ansiColorDepth(stream), 1);
    });
    withEnv({ FORCE_COLOR: undefined, NO_COLOR: "", NODE_DISABLE_COLORS: "" }, () => {
        assert.equal(ansiColorDepth({ isTTY: true, getColorDepth: () => 24 } as NodeJS.WriteStream), 24);
    });
});

test("TimeZonedDate accepts Temporal.ZonedDateTime and explicit-offset ISO inputs", () => {
    const zdt = Temporal.ZonedDateTime.from("2024-01-15T12:34:56.123456789-05:00[America/New_York]");
    const date = new TimeZonedDate(zdt);
    assert.equal(date.getFullYear(), 2024);
    assert.equal(date.getMonth(), 0);
    assert.equal(date.getDate(), 15);
    assert.equal(date.getDay(), 1);
    assert.equal(date.getHours(), 12);
    assert.equal(date.getMinutes(), 34);
    assert.equal(date.getSeconds(), 56);
    assert.equal(date.getMilliseconds(), 123);
    assert.equal(TimeZonedDate.from("2024-01-15T17:34:56Z").getHours(), 12);
    assert.throws(() => TimeZonedDate.from("2024-01-15T12:34:56"));
});

test("TimeZonedDate add is immutable and performs calendar arithmetic across DST", () => {
    const beforeSpring = TimeZonedDate.from("2024-03-09T17:00:00Z");
    const nextDay = beforeSpring.add({ days: 1 });
    assert.equal(beforeSpring.toISOString(), "2024-03-09T12:00:00-05:00");
    assert.equal(nextDay.toISOString(), "2024-03-10T12:00:00-04:00");
    assert.equal(nextDay.getTime() - beforeSpring.getTime(), 23 * 60 * 60 * 1000);
    const beforeFall = TimeZonedDate.from("2024-11-02T16:00:00Z");
    assert.equal(beforeFall.add({ days: 1 }).toISOString(), "2024-11-03T12:00:00-05:00");
    assert.equal(beforeSpring.add({ hours: 24 }).getHours(), 13);
    assert.equal(beforeFall.add({ days: 1 }).getTime() - beforeFall.getTime(), 25 * 60 * 60 * 1000);
});

test("TimeZonedDate with rejects DST gaps, folds, and overflow", () => {
    const base = TimeZonedDate.from("2024-03-01T17:00:00Z");
    assert.throws(() => base.with({ month: 3, day: 10, hour: 2, minute: 30 }));
    assert.throws(() => TimeZonedDate.from("2024-11-03T17:00:00Z").with({ hour: 1, minute: 30 }));
    assert.throws(() => base.with({ month: 2, day: 30 }));
});

test("TimeZonedDate ISO serialization supports precision and preserves nanoseconds", () => {
    const date = TimeZonedDate.from("2024-01-15T17:34:56.123456789Z");
    assert.equal(date.toISOString(), "2024-01-15T12:34:56.123456789-05:00");
    assert.equal(date.toISOString(3), "2024-01-15T12:34:56.123-05:00");
    assert.match(date.toISOString("auto"), /\.123456789-05:00$/);
    assert.match(date.toUTCISOString("auto"), /\.123456789Z$/);
    assert.equal(Temporal.Instant.from(date.toUTCISOString("auto")).epochNanoseconds, 1705340096123456789n);
});

test("TimeZonedDate default JSON serialization omits zero milliseconds and prefix uses millisecond precision", () => {
    const date = TimeZonedDate.from("2024-01-15T17:34:56Z");
    assert.equal(date.toJSON(), "2024-01-15T12:34:56-05:00");
    const logger = new Logger() as unknown as { getPrefix(level: string): string };
    withEnv({ FORCE_COLOR: "0" }, () => {
        assert.match(logger.getPrefix("log"), /\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}/);
    });
});

test("historical sub-minute offsets use exact UTC fallback serialization", () => {
    const historical = TimeZonedDate.from("1880-01-01T00:00:00Z");
    assert.notEqual(historical.getTimezoneOffset() % 1, 0);
    assert.match(historical.toISOString(), /Z$/);
    assert.equal(Temporal.Instant.from(historical.toISOString()).epochMilliseconds, historical.getTime());
});

test("asPositiveInteger accepts nonnegative safe integers and rejects invalid values", () => {
    assert.equal(asPositiveInteger(0), 0);
    assert.equal(asPositiveInteger(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
    for (const value of [ -1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity ]) {
        assert.throws(() => asPositiveInteger(value));
    }
});

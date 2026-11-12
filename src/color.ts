import type { NonNegativeIntegerLessThan } from "./types";


type ANSIByte = NonNegativeIntegerLessThan<256>;
type RGBTuple = readonly [ANSIByte, ANSIByte, ANSIByte];

/** Represents the different log levels available for the custom logger */
export type LogLevel = "log" | "debug" | "info" | "warn" | "error" | "success";

interface ANSIStyleCodeByLabel {
    RESET: "0";
    BOLD: "1";
    DIM: "2";
    ITALIC: "3";
    UNDERLINE: "4";
    BLINK: "5";
    INVERSE: "7";
    HIDDEN: "8";
    STRIKETHROUGH: "9";
    RESET_BOLD_DIM: "22";
    RESET_ITALIC: "23";
    RESET_UNDERLINE: "24";
    RESET_BLINK: "25";
    RESET_INVERSE: "27";
    RESET_HIDDEN: "28";
    RESET_STRIKETHROUGH: "29";
    OVERLINE: "53";
    RESET_OVERLINE: "55";
}

/** Represents the ANSI escape sequences used for styling and coloring text in the terminal */
type ANSIStyleCode = ANSIStyleCodeByLabel[keyof ANSIStyleCodeByLabel];

interface ANSIStyleMap extends ReadonlyMap<keyof ANSIStyleCodeByLabel, ANSIStyleCode> {
    get<K extends keyof ANSIStyleCodeByLabel>(key: K): ANSIStyleCodeByLabel[K];
}

type ANSIForegroundColorCode<K extends keyof ANSIColorCodeByLabel = keyof ANSIColorCodeByLabel> = K extends
    `FG_${string}` ? ANSIColorCodeByLabel[K] : never;
type ANSIBackgroundColorCode<K extends keyof ANSIColorCodeByLabel = keyof ANSIColorCodeByLabel> = K extends
    `BG_${string}` ? ANSIColorCodeByLabel[K] : never;
/** Represents the ANSI color codes for foreground & background colors */
type ANSIColorCode = ANSIForegroundColorCode | ANSIBackgroundColorCode;

interface ANSIColorCodeByLabel {
    FG_BLACK: "30";
    FG_RED: "31";
    FG_GREEN: "32";
    FG_YELLOW: "33";
    FG_BLUE: "34";
    FG_MAGENTA: "35";
    FG_CYAN: "36";
    FG_WHITE: "37";
    FG_DEFAULT: "39";
    FG_BRIGHT_BLACK: "90";
    FG_BRIGHT_RED: "91";
    FG_BRIGHT_GREEN: "92";
    FG_BRIGHT_YELLOW: "93";
    FG_BRIGHT_BLUE: "94";
    FG_BRIGHT_MAGENTA: "95";
    FG_BRIGHT_CYAN: "96";
    FG_BRIGHT_WHITE: "97";
    BG_BLACK: "40";
    BG_RED: "41";
    BG_GREEN: "42";
    BG_YELLOW: "43";
    BG_BLUE: "44";
    BG_MAGENTA: "45";
    BG_CYAN: "46";
    BG_WHITE: "47";
    BG_DEFAULT: "49";
    BG_BRIGHT_BLACK: "100";
    BG_BRIGHT_RED: "101";
    BG_BRIGHT_GREEN: "102";
    BG_BRIGHT_YELLOW: "103";
    BG_BRIGHT_BLUE: "104";
    BG_BRIGHT_MAGENTA: "105";
    BG_BRIGHT_CYAN: "106";
    BG_BRIGHT_WHITE: "107";
}
interface ANSIColorMap extends ReadonlyMap<keyof ANSIColorCodeByLabel, ANSIColorCode> {
    get<K extends keyof ANSIColorCodeByLabel>(key: K): ANSIColorCodeByLabel[K];
}

type ANSIForegroundLabel = Extract<keyof ANSIColorCodeByLabel, `FG_${string}`>;
type ANSIBackgroundLabel = Extract<keyof ANSIColorCodeByLabel, `BG_${string}`>;
type ANSIActiveStyle = Exclude<
    keyof ANSIStyleCodeByLabel,
    "RESET" | `RESET_${string}`
>;
type ANSIExtendedColor =
    | { kind: "rgb"; value: RGBTuple }
    | { kind: "palette"; value: ANSIByte };

interface ANSITextOptions {
    foreground?: ANSIForegroundLabel | ANSIExtendedColor;
    background?: ANSIBackgroundLabel | ANSIExtendedColor;
    styles?: readonly ANSIActiveStyle[];
}

/**
 * Represents the depth of ANSI color support in the terminal.
 * * 1: No color support
 * * 4: Basic 16-color support (standard ANSI colors) - The original 8 colors plus their bright variants
 * * 8: 256-color support (extended ANSI colors) - Palette of 256 distinct colors
 * * 24: True color (16 million colors) support - Full RGB color specification
 */
export type ANSIDepth = 1 | 4 | 8 | 24;

declare global {
    namespace NodeJS {
        interface WriteStream {
            getColorDepth: () => ANSIDepth | number;
        }
    }
}

/** Requires every label and its corresponding code before exposing a readonly map. */
function createStyleMap(codes: Readonly<ANSIStyleCodeByLabel>): ANSIStyleMap {
    return new Map(Object.entries(codes)) as ANSIStyleMap;
}

/** Requires every label and its corresponding code before exposing a readonly map. */
function createColorMap(codes: Readonly<ANSIColorCodeByLabel>): ANSIColorMap {
    return new Map(Object.entries(codes)) as ANSIColorMap;
}

/**
 * Determines the ANSI color depth supported by the given write stream.
 * @param stream The write stream to check for color support (defaults to process.stdout)
 * @returns The ANSI color depth (1, 4, 8, or 24)
 */
export function ansiColorDepth(stream: NodeJS.WriteStream = process.stdout): ANSIDepth {
    const forced = process.env.FORCE_COLOR;

    if (forced !== undefined) {
        // dprint-ignore
        switch (forced) {
            case [ "", "true", "1" ].includes(forced) ? forced : "": return 4;
            case "2": return 8;
            case "3": return 24;
            default: return 1;
        }
    }

    if (process.env.NO_COLOR || process.env.NODE_DISABLE_COLORS) {
        return 1;
    }

    if (!stream.isTTY) {
        return 1;
    }
    const depth = stream.getColorDepth?.() ?? 4;
    return depth === 4 || depth === 8 || depth === 24 ? depth : 1;
}

function ansiByte(value: number): ANSIByte {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new RangeError("ANSI color values must be integers from 0 to 255");
    }
    return value as ANSIByte;
}

function ansiRGB(value: readonly [number, number, number]): RGBTuple {
    return [ ansiByte(value[0]), ansiByte(value[1]), ansiByte(value[2]) ];
}

function ansiColorParameters(
    color: keyof ANSIColorCodeByLabel | ANSIExtendedColor,
    target: "38" | "48",
    depth: ANSIDepth
): string[] {
    if (typeof color === "string") {
        const code = COLOR_MAP.get(color);
        if (!code) {
            throw new RangeError(`Unknown ANSI color: ${color}`);
        }
        return depth >= 4 ? [ code ] : [];
    }

    if (color.kind === "rgb") {
        const channels = ansiRGB(color.value);
        return depth >= 24 ? [ target, "2", ...channels.map(String) ] : [];
    }

    const index = ansiByte(color.value);
    return depth >= 8 ? [ target, "5", String(index) ] : [];
}

/**
 * Formats the given text with ANSI color and style codes according to the specified options and color depth.
 * If the depth is less than 4 or the text is empty, the original text is returned unmodified.
 *
 * @param {string} text The text to format
 * @param {ANSITextOptions} [options={}] The ANSI text options including foreground, background, and styles
 * @param {ANSIDepth} [depth=ansiColorDepth()] The ANSI color depth (1, 4, 8, or 24)
 * @returns The formatted text with ANSI escape codes applied according to the specified options and color depth
 */
export function ansiText(
    text: string,
    options: ANSITextOptions = {},
    depth: ANSIDepth = ansiColorDepth()
): string {
    if (depth < 4 || !text) {
        return text;
    }

    const codes: string[] = (options.styles ?? []).map((style) => {
        const code = STYLE_MAP.get(style);
        if (!code) {
            throw new RangeError(`Unknown ANSI style: ${style}`);
        }
        return code;
    });

    if (options.foreground) {
        codes.push(...ansiColorParameters(options.foreground, "38", depth));
    }

    if (options.background) {
        codes.push(...ansiColorParameters(options.background, "48", depth));
    }

    if (!codes.length) {
        return text;
    }

    const reset = `\x1b[${STYLE_MAP.get("RESET")}m`;
    // Do not reset on entry: an inner color must inherit outer bold/italic styles.
    const start = `\x1b[${codes.join(";")}m`;

    return `${start}${text.replaceAll(reset, reset + start)}${reset}`;
}

const STYLE_MAP = createStyleMap({
    RESET: "0",
    BOLD: "1",
    DIM: "2",
    ITALIC: "3",
    UNDERLINE: "4",
    BLINK: "5",
    INVERSE: "7",
    HIDDEN: "8",
    STRIKETHROUGH: "9",
    RESET_BOLD_DIM: "22",
    RESET_ITALIC: "23",
    RESET_UNDERLINE: "24",
    RESET_BLINK: "25",
    RESET_INVERSE: "27",
    RESET_HIDDEN: "28",
    RESET_STRIKETHROUGH: "29",
    OVERLINE: "53",
    RESET_OVERLINE: "55"
});
const COLOR_MAP = createColorMap({
    FG_BLACK: "30",
    FG_RED: "31",
    FG_GREEN: "32",
    FG_YELLOW: "33",
    FG_BLUE: "34",
    FG_MAGENTA: "35",
    FG_CYAN: "36",
    FG_WHITE: "37",
    FG_DEFAULT: "39",
    FG_BRIGHT_BLACK: "90",
    FG_BRIGHT_RED: "91",
    FG_BRIGHT_GREEN: "92",
    FG_BRIGHT_YELLOW: "93",
    FG_BRIGHT_BLUE: "94",
    FG_BRIGHT_MAGENTA: "95",
    FG_BRIGHT_CYAN: "96",
    FG_BRIGHT_WHITE: "97",
    BG_BLACK: "40",
    BG_RED: "41",
    BG_GREEN: "42",
    BG_YELLOW: "43",
    BG_BLUE: "44",
    BG_MAGENTA: "45",
    BG_CYAN: "46",
    BG_WHITE: "47",
    BG_DEFAULT: "49",
    BG_BRIGHT_BLACK: "100",
    BG_BRIGHT_RED: "101",
    BG_BRIGHT_GREEN: "102",
    BG_BRIGHT_YELLOW: "103",
    BG_BRIGHT_BLUE: "104",
    BG_BRIGHT_MAGENTA: "105",
    BG_BRIGHT_CYAN: "106",
    BG_BRIGHT_WHITE: "107"
});
export const LOG_LEVEL_APPEARANCE = {
    log: { foreground: "FG_BRIGHT_WHITE", styles: [ "BOLD" ] },
    debug: { foreground: "FG_BRIGHT_MAGENTA", styles: [ "BOLD" ] },
    info: { foreground: "FG_BRIGHT_CYAN", styles: [ "BOLD" ] },
    success: { foreground: "FG_BRIGHT_GREEN", styles: [ "BOLD" ] },
    warn: { foreground: "FG_BRIGHT_YELLOW", styles: [ "BOLD" ] },
    error: { foreground: "FG_BRIGHT_RED", styles: [ "BOLD" ] }
} as const satisfies Record<LogLevel, ANSITextOptions>;

import { fileURLToPath } from "node:url";
import { getCallSites } from "node:util";


export interface CallerInfo {
    file: string;
    functionName: string;
    line: `${number}`;
    column: `${number}`;
}

export function getCallerInfo(frameIndex = 3): CallerInfo {
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= 200) {
        throw new RangeError("Call site index must be an integer from 0 to 199");
    }
    // 0: getCallerInfo, 1: getPrefix, 2: debug/log/etc., 3: caller
    const mapped = getCallSites(Math.max(10, frameIndex + 1), { sourceMap: true })[frameIndex];
    if (!mapped) {
        throw new Error("Failed to get caller info: mapped call site is missing.");
    }

    return {
        file: mapped.scriptName.startsWith("file:")
            ? fileURLToPath(mapped.scriptName)
            : mapped.scriptName,
        functionName: mapped.functionName,
        line: `${mapped.lineNumber}`,
        column: `${mapped.columnNumber}`
    };
}

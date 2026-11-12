declare const nonNegativeInteger: unique symbol;

/** Non-negative integer literals, or a validated value when no literal type is supplied. */
export type PositiveInteger<T extends number = number> = number extends T
    ? number & { readonly [nonNegativeInteger]: true }
    : T extends T
        ? `${T}` extends `${bigint}`
            ? `${T}` extends `-${string}` ? never : T
            : never
        : never;

/** Generates a union of numbers from 0 up to N - 1 */
export type Enumerate<N extends number, Acc extends number[] = []> = Acc["length"] extends N
    ? Acc[number]
    : Enumerate<N, [...Acc, Acc["length"]]>;

/** Represents a non-negative integer that is strictly less than a specified upper bound N */
export type NonNegativeIntegerLessThan<N extends number> = Enumerate<N>;

export function asPositiveInteger(value: number): PositiveInteger {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError("Expected a non-negative safe integer");
    }
    return value as PositiveInteger;
}

import type { NonNegativeIntegerLessThan, PositiveInteger, asPositiveInteger } from "src/types";


type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

export type IntegerTypeChecks = [
    Expect<Equal<PositiveInteger<0>, 0>>,
    Expect<Equal<PositiveInteger<42>, 42>>,
    Expect<Equal<PositiveInteger<-1>, never>>,
    Expect<Equal<PositiveInteger<1.5>, never>>,
    Expect<Equal<PositiveInteger<-1 | 0 | 1 | 1.5>, 0 | 1>>,
    Expect<Equal<number extends PositiveInteger ? true : false, false>>,
    Expect<Equal<PositiveInteger extends number ? true : false, true>>,
    Expect<Equal<ReturnType<typeof asPositiveInteger>, PositiveInteger>>,
    Expect<Equal<NonNegativeIntegerLessThan<4>, 0 | 1 | 2 | 3>>
];

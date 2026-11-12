import { Temporal } from "@js-temporal/polyfill";


export class TimeZonedDate {
    static readonly TIME_ZONE = "America/New_York";
    private readonly value: Temporal.ZonedDateTime;

    constructor(value = Temporal.Now.zonedDateTimeISO(TimeZonedDate.TIME_ZONE)) {
        this.value = value
            .withTimeZone(TimeZonedDate.TIME_ZONE)
            .withCalendar("iso8601");
    }

    // Input must identify an instant using Z or an explicit offset.
    static from(iso: string): TimeZonedDate {
        return new TimeZonedDate(
            Temporal.Instant.from(iso).toZonedDateTimeISO(TimeZonedDate.TIME_ZONE)
        );
    }

    getHours(): number {
        return this.value.hour;
    }
    getMinutes(): number {
        return this.value.minute;
    }
    getSeconds(): number {
        return this.value.second;
    }
    getMilliseconds(): number {
        return this.value.millisecond;
    }
    getFullYear(): number {
        return this.value.year;
    }
    getMonth(): number {
        return this.value.month - 1;
    }
    getDate(): number {
        return this.value.day;
    }
    getDay(): number {
        return this.value.dayOfWeek % 7;
    }
    getTime(): number {
        return this.value.epochMilliseconds;
    }
    getTimezoneOffset(): number {
        return -this.value.offsetNanoseconds / 60_000_000_000;
    }

    add(duration: Parameters<Temporal.ZonedDateTime["add"]>[0]): TimeZonedDate {
        return new TimeZonedDate(this.value.add(duration, { overflow: "reject" }));
    }

    with(fields: Parameters<Temporal.ZonedDateTime["with"]>[0]): TimeZonedDate {
        return new TimeZonedDate(this.value.with(fields, {
            disambiguation: "reject",
            offset: "ignore",
            overflow: "reject"
        }));
    }

    /** Preserve precision by default; callers can explicitly request milliseconds for display. */
    toISOString(fractionalSecondDigits: 3 | "auto" = "auto"): string {
        // Historical second-based offsets cannot round-trip in the minute-offset ISO format.
        if (this.value.offsetNanoseconds % 60_000_000_000 !== 0) {
            return this.toUTCISOString(fractionalSecondDigits);
        }
        return this.value.toString({
            fractionalSecondDigits,
            timeZoneName: "never",
            calendarName: "never"
        });
    }

    toUTCISOString(fractionalSecondDigits: 3 | "auto" = "auto"): string {
        return this.value.toInstant().toString({ fractionalSecondDigits });
    }

    toLocaleString(): string {
        return this.value.toLocaleString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            fractionalSecondDigits: 3,
            hourCycle: "h23"
        });
    }

    toJSON(): string {
        return this.toISOString();
    }
}

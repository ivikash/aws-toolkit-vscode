/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as crypto from 'crypto'
import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import { default as stripAnsi } from 'strip-ansi'
import { isCloud9 } from '../extensionUtilities'
import { getLogger } from '../logger'

/**
 * Truncates string `s` if it exceeds `n` chars.
 *
 * If `n` is negative, truncates at start instead of end.
 *
 * @param s String to truncate
 * @param n Truncate after this length
 * @param suffix String appended to truncated value (default: "…")
 */
export function truncate(s: string, n: number, suffix?: string): string {
    suffix = suffix ?? '…'
    if (s.length <= Math.abs(n)) {
        return s
    }
    const start = n < 0 ? s.length - Math.abs(n) : 0
    const end = n < 0 ? s.length : n
    const truncated = s.substring(start, end)
    return n < 0 ? suffix + truncated : truncated + suffix
}

/**
 * Indents a given string with spaces.
 *
 * @param {string} s - The input string to be indented.
 * @param {number} [size=4] - The number of spaces to use for indentation. Defaults to 4.
 * @param {boolean} [clear=false] - If true, the function will clear any existing indentation and apply the new indentation.
 * @returns {string} The indented string.
 *
 * @example
 * const indentedString = indent('Hello\nWorld', 2);
 * console.log(indentedString); // Output: "  Hello\n  World"
 *
 * @example
 * const indentedString = indent('  Hello\n    World', 4, true);
 * console.log(indentedString); // Output: "    Hello\n    World"
 */
export function indent(s: string, size: number = 4, clear: boolean = false): string {
    const n = Math.abs(size)
    const spaces = ''.padEnd(n, ' ')
    if (size < 0) {
        throw Error() // TODO: implement "dedent" for negative size.
    }
    if (clear) {
        return s.replace(/^[ \t]*([^\n])/, `${spaces}$1`).replace(/(\n+)[ \t]*([^ \t\n])/g, `$1${spaces}$2`)
    }
    return spaces + s.replace(/(\n+)(.)/g, `$1${spaces}$2`)
}

/**
 * Creates a (shallow) clone of `obj` and truncates its top-level string properties.
 *
 * @param obj Object to copy and truncate
 * @param len Truncate top-level string properties exceeding this length
 * @param propNames Only truncate properties in this list
 * @param suffix String appended to truncated values (default: "…")
 */
export function truncateProps(obj: object, len: number, propNames?: string[], suffix?: string): object {
    if (len <= 0) {
        throw Error(`invalid len: ${len}`)
    }
    // Shallow-copy to avoid modifying the original object.
    const r = { ...obj }

    if (propNames) {
        for (const propName of propNames) {
            try {
                const val = (r as any)[propName]
                if (val !== undefined && typeof val === 'string') {
                    ;(r as any)[propName] = truncate(val, len, suffix)
                }
            } catch {
                // Do nothing ("best effort").
            }
        }
    } else {
        for (const propName of Object.getOwnPropertyNames(r)) {
            try {
                ;(r as any)[propName] = truncate((r as any)[propName], len, suffix)
            } catch {
                // Do nothing ("best effort").
            }
        }
    }

    return r
}

export function removeAnsi(text: string): string {
    try {
        return stripAnsi(text)
    } catch (err) {
        getLogger().error('Unexpected error while removing Ansi from text: %O', err as Error)

        // Fall back to original text so callers aren't impacted
        return text
    }
}

/**
 * Hashes are not guaranteed to be stable across toolkit versions. We may change the implementation.
 */
export function getStringHash(text: string | Buffer): string {
    const hash = crypto.createHash('sha256')

    hash.update(text)

    return hash.digest('hex')
}

/**
 * Temporary util while Cloud9 does not have codicon support
 */
export function addCodiconToString(codiconName: string, text: string): string {
    return isCloud9() ? text : `$(${codiconName}) ${text}`
}

/**
 * Go allows function signatures to be multi-line, so we should parse these into something more usable.
 *
 * @param text String to parse
 *
 * @returns Final output without any new lines or comments
 */
export function stripNewLinesAndComments(text: string): string {
    const blockCommentRegExp = /\/\*.*\*\//
    let result: string = ''

    text.split(/\r|\n/).map((s) => {
        const commentStart: number = s.search(/\/\//)
        s = s.replace(blockCommentRegExp, '')
        result += commentStart === -1 ? s : s.substring(0, commentStart)
    })

    return result
}

/**
 * Inserts some text into a file.
 * Very slow for large files so don't use it for that purpose.
 *
 * @param filePath Path to the file to write to
 * @param text String that will be inserted
 * @param line Optional line number to use (0 indexed)
 */
export async function insertTextIntoFile(text: string, filePath: string, line: number = 0) {
    const oldData: Buffer = fs.readFileSync(filePath)
    const lines: string[] = oldData.toString().split(/\r?\n/)
    lines.splice(line, 0, text)

    const newData: Buffer = Buffer.from(lines.join('\n'))
    const fd: number = fs.openSync(filePath, 'w+')

    fs.writeSync(fd, newData, 0, newData.length, 0)

    fs.close(fd, (err) => {
        if (err) {
            throw err
        }
    })
}

export function toTitleCase(str: string): string {
    return str.charAt(0).toUpperCase().concat(str.slice(1))
}

/**
 * converts keys in an object from camelCase to snake_case
 * e.g.
 * {
 *   fooBar: "fi"
 * }
 *
 * to
 * {
 *   foo_bar: "fi"
 * }
 */
export function toSnakeCase(obj: Record<string, any>) {
    const snakeObj: Record<string, string> = {}

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const snakeKey = key.replace(/([a-z])([A-Z]+)/g, '$1_$2').toLowerCase()
            snakeObj[snakeKey] = obj[key]
        }
    }

    return snakeObj
}

/**
 * Gets a relative date between the from date and now date (default: current time)
 * e.g. "in 1 minute", '1 minute ago'
 * works on the scales of seconds, minutes, hours, days, weeks, months, years
 * @param from start Date
 * @param now end Date (default: current time)
 * @returns string representation of relative date
 */
export function getRelativeDate(from: Date, now: Date = new Date()): string {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'long' })

    const second = 1000
    const minute = second * 60
    const hour = minute * 60
    const day = hour * 24
    const week = day * 7

    // Prevent clock skew showing future date - adjust 5 seconds
    const fromAdj = new Date(from.valueOf() - 5 * second)

    const diff = fromAdj.valueOf() - now.valueOf()
    const absDiff = Math.abs(diff)
    // seconds
    if (absDiff < minute) {
        // magnitude is less than a minute
        return rtf.format(Math.floor(diff / second), 'second')
    }
    // minutes
    if (absDiff < hour) {
        // magnitude is less than an hour
        return rtf.format(Math.floor(diff / minute), 'minute')
    }
    // hours
    if (absDiff < day) {
        // magnitude is less than a day
        return rtf.format(Math.floor(diff / hour), 'hour')
    }
    // days
    if (absDiff < week) {
        // magnitude is less than a week
        return rtf.format(Math.floor(diff / day), 'day')
    }
    // weeks
    if (
        (Math.abs(fromAdj.getUTCMonth() - now.getUTCMonth()) === 0 &&
            Math.abs(fromAdj.getUTCFullYear() - now.getUTCFullYear()) === 0) || // same month of same year
        (fromAdj.getUTCMonth() - now.getUTCMonth() === 1 && fromAdj.getUTCDate() < now.getUTCDate()) || // different months, but less than a month apart in terms of numeric days
        (now.getUTCMonth() - fromAdj.getUTCMonth() === 1 && now.getUTCDate() < fromAdj.getUTCDate()) // same as above but in the opposite direction
    ) {
        return rtf.format(Math.floor(diff / week), 'week')
    }
    // months
    if (
        Math.abs(fromAdj.getUTCFullYear() - now.getUTCFullYear()) === 0 || // same year, and all the other conditions above didn't pass
        (fromAdj.getUTCFullYear() - now.getUTCFullYear() === 1 && fromAdj.getUTCMonth() < now.getUTCMonth()) || // different years, but less than a year apart in terms of months
        (now.getUTCFullYear() - fromAdj.getUTCFullYear() === 1 && now.getUTCMonth() < fromAdj.getUTCMonth()) // same as the above, but in reverse
    ) {
        // add/subtract months to make up for the difference between years
        let adjMonths = 0
        if (fromAdj.getUTCFullYear() > now.getUTCFullYear()) {
            adjMonths = 12
        } else if (fromAdj.getUTCFullYear() < now.getUTCFullYear()) {
            adjMonths = -12
        }
        return rtf.format(Math.floor(fromAdj.getUTCMonth() - now.getUTCMonth() + adjMonths), 'month')
    }
    // years
    // if all conditionals above have failed, we're looking in terms of a > 1 year gap
    return rtf.format(Math.floor(fromAdj.getUTCFullYear() - now.getUTCFullYear()), 'year')
}

/**
 * Format for rendering readable dates.
 *
 * Same format used in the S3 console, but it's also locale-aware.
 * This specifically combines a separate date and time format
 * in order to avoid a comma between the date and time.
 *
 * US: Jan 5, 2020 5:30:20 PM GMT-0700
 * GB: 5 Jan 2020 17:30:20 GMT+0100
 */
export function formatLocalized(d: Date = new Date(), cloud9 = isCloud9()): string {
    const dateFormat = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
    const timeFormat = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        timeZoneName: cloud9 ? 'short' : 'shortOffset',
    })

    return `${dateFormat.format(d)} ${timeFormat.format(d)}`
}
/**
 * Matches Insights console timestamp, e.g.: 2019-03-04T11:40:08.781-08:00
 * TODO: Do we want this this verbose? Log stream just shows HH:mm:ss
 */
export function formatDateTimestamp(forceUTC: boolean, d: Date = new Date()): string {
    let offsetString: string
    if (!forceUTC) {
        // manually adjust offset seconds if looking for a GMT timestamp:
        // the date is created in local time, but `getISOString` will always output unadjusted GMT
        d = new Date(d.getTime() - d.getTimezoneOffset() * 1000 * 60)
        offsetString = '+00:00'
    } else {
        // positive offset means GMT-n, negative offset means GMT+n
        // offset is in minutes
        offsetString = `${d.getTimezoneOffset() <= 0 ? '+' : '-'}${(d.getTimezoneOffset() / 60)
            .toString()
            .padStart(2, '0')}:00`
    }
    const iso = d.toISOString()
    // trim 'Z' (last char of iso string) and add offset string
    return `${iso.substring(0, iso.length - 1)}${offsetString}`
}

/**
 * To satisfy a pentesting concern, encodes HTML to mitigate risk of HTML injection
 */
export function encodeHTML(str: string) {
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * cleans up a filename of invalid characters, whitespaces and emojis
 * "foo🤷bar/zu b.txt" => "foo_bar_zu_b.txt"
 * @param input filename
 * @param replaceString optionally override default substitution
 * @returns a cleaned name you can safely use as a file or directory name
 */
export function sanitizeFilename(input: string, replaceString = '_'): string {
    return (
        input
            // replace invalid chars
            .replace(/[\/|\\:*?"<>\s]/g, replaceString)
            // replace emojis https://edvins.io/how-to-strip-emojis-from-string-in-java-script
            .replace(
                /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
                replaceString
            )
    )
}

// Given number of milliseconds elapsed (ex. 4,500,000) return hr / min / sec it represents (ex. "1 hr 15 min")
export function convertToTimeString(durationInMs: number) {
    const time = new Date(durationInMs)
    const hours = time.getUTCHours()
    const minutes = time.getUTCMinutes()
    const seconds = time.getUTCSeconds()
    let timeString = `${seconds} sec`
    if (minutes > 0) {
        timeString = `${minutes} min ${timeString}`
    }
    if (hours > 0) {
        timeString = `${hours} hr ${timeString}`
    }
    return timeString
}

// Given Date object, return timestamp it represents (ex. "01/01/23, 12:00 AM")
export function convertDateToTimestamp(date: Date) {
    return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/**
 * A helper function to generate a random string for a specified length
 *
 * @param length - The length of the generated string. Defaults to 32 if length not provided.
 */
export function getRandomString(length = 32) {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

/**
 * Convert a base 64 string to a base 64 url string
 *
 * See: https://datatracker.ietf.org/doc/html/rfc4648#section-5
 * @param base64 a base 64 string
 * @returns a base 64 url string
 */
export function toBase64URL(base64: string) {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function undefinedIfEmpty(str: string | undefined): string | undefined {
    if (str && str.trim().length > 0) {
        return str
    }

    return undefined
}

export function decodeBase64(base64Str: string): string {
    return Buffer.from(base64Str, 'base64').toString()
}
/**
 * Extracts the file path and selection context from the message.
 *
 * @param {any} message - The message object containing the file and selection context.
 * @returns {Object} - An object with `filePath` and `selection` properties.
 */
export function extractFileAndCodeSelectionFromMessage(message: any) {
    const filePath = message?.context?.activeFileContext?.filePath
    const selection = message?.context?.focusAreaContext?.selectionInsideExtendedCodeBlock as vscode.Selection
    return { filePath, selection }
}

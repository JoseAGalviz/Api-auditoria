/**
 * Utility functions for data validation and transformation
 */

/**
 * Converts value to number or null
 * @param {*} v - Value to convert
 * @returns {number|null}
 */
export const toNumber = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

/**
 * Converts value to integer (defaults to 0)
 * @param {*} v - Value to convert
 * @returns {number}
 */
export const toInt = (v) => {
    const n = toNumber(v);
    return n === null ? 0 : Math.round(n);
};

/**
 * Extracts date portion from date string or object
 * @param {string|Date} d - Date to clean
 * @returns {string|null}
 */
export const cleanDate = (d) => {
    if (!d) return null;
    if (typeof d === "string") return d.split("T")[0];
    try {
        return d.toISOString().split("T")[0];
    } catch {
        return null;
    }
};

/**
 * Trims string values
 * @param {*} v - Value to clean
 * @returns {*}
 */
export const cleanString = (v) => (typeof v === "string" ? v.trim() : v);

/**
 * Cleans monetary amount to 2 decimal places
 * @param {*} v - Value to clean
 * @returns {number}
 */
export const cleanAmount = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/**
 * Pads number with leading zero if needed
 * @param {number} n - Number to pad
 * @returns {string}
 */
export const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

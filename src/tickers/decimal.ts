// Exact arithmetic and formatting for on-chain integer amounts.

/** Prices and USD values are fixed-point integers with this many decimal places. */
const FIXED_DECIMALS = 18

/**
 * Formats an amount with `decimals` implied decimal places, e.g. (1234500n, 6) -> "1.2345".
 * Keeps at most `maxFraction` decimal places and drops trailing zeros.
 */
export function formatUnits(value: bigint, decimals: number, maxFraction = decimals): string {
  const fractionDigits = Math.min(decimals, maxFraction)
  const digits = (value / 10n ** BigInt(decimals - fractionDigits)).toString().padStart(fractionDigits + 1, '0')
  const split = digits.length - fractionDigits
  const whole = digits.slice(0, split)
  const fraction = digits.slice(split).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

/** The price of one base unit in quote units, as a fixed-point number. */
export function price(quote: bigint, quoteDecimals: number, base: bigint, baseDecimals: number): bigint {
  return (quote * 10n ** BigInt(baseDecimals + FIXED_DECIMALS)) / (base * 10n ** BigInt(quoteDecimals))
}

/** The value of `amount`, with `decimals` decimal places, at a fixed-point `price`. */
export function valueAt(amount: bigint, decimals: number, price: bigint): bigint {
  return (amount * price) / 10n ** BigInt(decimals)
}

/** A whole number as a fixed-point number. */
export const toFixed = (value: number) => BigInt(value) * 10n ** BigInt(FIXED_DECIMALS)

/** Formats a fixed-point number, keeping at most `maxFraction` decimal places. */
export const formatFixed = (value: bigint, maxFraction?: number) => formatUnits(value, FIXED_DECIMALS, maxFraction)

// Exact arithmetic and formatting for on-chain integer amounts.

/** Decimal places kept in prices. */
const PRICE_DECIMALS = 18

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

/**
 * The price of one base unit in quote units, as a fixed-point integer: compare prices directly,
 * format them with `formatPrice`.
 */
export function price(quote: bigint, quoteDecimals: number, base: bigint, baseDecimals: number): bigint {
  return (quote * 10n ** BigInt(baseDecimals + PRICE_DECIMALS)) / (base * 10n ** BigInt(quoteDecimals))
}

export const formatPrice = (price: bigint) => formatUnits(price, PRICE_DECIMALS)

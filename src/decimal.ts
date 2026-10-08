// Exact decimal formatting for on-chain integer amounts.

export const PRICE_PRECISION = 18

/** Formats an integer amount with `decimals` implied decimal places, without trailing zeros. */
export function formatUnits(value: bigint, decimals: number, maxFraction = decimals): string {
  const negative = value < 0n
  let abs = negative ? -value : value
  if (maxFraction < decimals) abs /= 10n ** BigInt(decimals - maxFraction)
  const digits = Math.min(decimals, maxFraction)
  const str = abs.toString().padStart(digits + 1, '0')
  const whole = str.slice(0, str.length - digits)
  const fraction = str.slice(str.length - digits).replace(/0+$/, '')
  return (negative ? '-' : '') + whole + (fraction ? `.${fraction}` : '')
}

/**
 * (num / 10^numDecimals) / (den / 10^denDecimals), as an integer scaled by 10^PRICE_PRECISION.
 * Format the result with `formatUnits(result, PRICE_PRECISION)`.
 */
export function scaledRatio(num: bigint, numDecimals: number, den: bigint, denDecimals: number): bigint {
  return (num * 10n ** BigInt(denDecimals + PRICE_PRECISION)) / (den * 10n ** BigInt(numDecimals))
}

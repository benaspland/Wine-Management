/**
 * Reading numbers out of text inputs.
 *
 * A number input holds text, and the text is briefly empty every time
 * you clear it to type something else. Parsing on each keystroke and
 * falling back to a default — `parseInt(value) || 30` — means the field
 * refuses to be emptied: backspace the last digit and it snaps to 30,
 * or to 0, before you can type the replacement.
 *
 * So the input keeps its string, and these turn it into a number once,
 * at the point of saving, where a blank can be reported honestly.
 */

/** Blank means "not recorded", so it becomes undefined rather than 0. */
export function toNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function toInt(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

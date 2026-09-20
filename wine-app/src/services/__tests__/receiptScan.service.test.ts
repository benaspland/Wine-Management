/**
 * Reading a purchase off a picture is the more dangerous of the two AI
 * features, not the lesser one: a blurred 8 and a 9 look alike, and a
 * price read wrong is indistinguishable from a price read right. These
 * are the checks that hold when the prompt's restraint does not.
 */

import { describe, it, expect } from 'vitest'
import { plausibleLine, plausibleDate, buildScanPrompt, type ScanPayload } from '../receiptScan.service'

const NOW = new Date('2026-09-20T12:00:00Z')

function line(overrides: Partial<ScanPayload['wines'][number]> = {}): ScanPayload['wines'][number] {
  return {
    producer: 'Chateau Meyney',
    name: 'Saint-Estephe',
    vintage: 2018,
    quantity: 6,
    format: 'Bottle',
    price_per_bottle: 32.5,
    ...overrides,
  }
}

describe('plausibleLine', () => {
  it('reads an ordinary line off an invoice', () => {
    const wine = plausibleLine(line(), NOW)!
    expect(wine).toMatchObject({
      producer: 'Chateau Meyney',
      name: 'Saint-Estephe',
      vintage: 2018,
      quantity: 6,
      format: 'Bottle',
      purchase_price: 32.5,
    })
    expect(wine.rejected).toEqual([])
  })

  it('drops a line with nothing to call the wine', () => {
    // A price with no wine attached is not a wine
    expect(plausibleLine(line({ producer: null, name: null }), NOW)).toBeNull()
  })

  it('keeps a line that has only a producer', () => {
    // A Bordeaux château is its own wine and needs no cuvée
    const wine = plausibleLine(line({ name: null }), NOW)!
    expect(wine.producer).toBe('Chateau Meyney')
    expect(wine.name).toBe('')
  })

  it.each([
    ['next year', 2028],
    ['a typo for a century ago', 1723],
    ['not a whole year', 2018.5],
  ])('refuses a vintage that is %s', (_label, vintage) => {
    const wine = plausibleLine(line({ vintage }), NOW)!
    expect(wine.rejected).toContain('vintage')
    // Falls back to this year rather than discarding the whole line,
    // because the form can be corrected and a lost line cannot
    expect(wine.vintage).toBe(2026)
  })

  it('accepts the current year and the one after it', () => {
    // En primeur and the current release are both legitimate
    expect(plausibleLine(line({ vintage: 2026 }), NOW)!.rejected).toEqual([])
    expect(plausibleLine(line({ vintage: 2027 }), NOW)!.rejected).toEqual([])
  })

  it.each([
    ['none', 0],
    ['negative', -6],
    ['absurd', 5000],
    ['fractional', 2.5],
  ])('refuses a quantity that is %s', (_label, quantity) => {
    const wine = plausibleLine(line({ quantity }), NOW)!
    expect(wine.rejected).toContain('quantity')
    expect(wine.quantity).toBe(1)
  })

  it.each([
    ['free', 0],
    ['negative', -32],
  ])('refuses a price that is %s', (_label, price) => {
    const wine = plausibleLine(line({ price_per_bottle: price }), NOW)!
    expect(wine.rejected).toContain('price')
    expect(wine.purchase_price).toBeUndefined()
  })

  it('keeps a genuinely expensive bottle', () => {
    expect(plausibleLine(line({ price_per_bottle: 4200 }), NOW)!.purchase_price).toBe(4200)
  })

  it('falls back to a standard bottle for a size it does not recognise', () => {
    expect(plausibleLine(line({ format: 'Jeroboam-ish' }), NOW)!.format).toBe('Bottle')
    expect(plausibleLine(line({ format: null }), NOW)!.format).toBe('Bottle')
    expect(plausibleLine(line({ format: 'Magnum' }), NOW)!.format).toBe('Magnum')
  })

  it('reports a missing vintage rather than a missing line', () => {
    // Non-vintage champagne is a real thing to buy
    const wine = plausibleLine(line({ vintage: null }), NOW)!
    expect(wine.vintage).toBe(2026)
    expect(wine.rejected).toEqual([])
  })
})

describe('plausibleDate', () => {
  it('keeps an order date that has already happened', () => {
    expect(plausibleDate('2026-03-14', NOW)).toBe('2026-03-14')
  })

  it('refuses a date in the future, which has been misread', () => {
    expect(plausibleDate('2027-01-01', NOW)).toBeUndefined()
  })

  it('refuses anything that is not a plain date', () => {
    expect(plausibleDate('14 March 2026', NOW)).toBeUndefined()
    expect(plausibleDate('2026-13-45', NOW)).toBeUndefined()
    expect(plausibleDate(null, NOW)).toBeUndefined()
  })
})

describe('the instruction', () => {
  it('says it is transcribing, not researching', () => {
    const prompt = buildScanPrompt().replace(/\s+/g, ' ')
    expect(prompt).toMatch(/transcribing, not\s*researching/)
    expect(prompt).toMatch(/A null is a correct answer/)
  })

  it('tells it how to turn a line total into a price per bottle, and when not to', () => {
    const prompt = buildScanPrompt().replace(/\s+/g, ' ')
    expect(prompt).toMatch(/divide it by the quantity/)
    expect(prompt).toMatch(/nearly right/)
  })

  it('gives today, so a future date can be recognised as a misreading', () => {
    expect(buildScanPrompt()).toContain(new Date().toISOString().split('T')[0])
  })
})

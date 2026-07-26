/**
 * The pure parts of the photo pipeline. Decoding and canvas encoding
 * need a real browser, so those are exercised in the Playwright pass;
 * what matters here is that the sizing maths never upscales, never
 * distorts, and that the size estimate used to cap a photo is honest.
 */

import { describe, it, expect } from 'vitest'
import { fitWithin, dataUrlBytes, isStoredImage } from '../image.service'

describe('fitWithin', () => {
  it('scales a large portrait photo down by its longest edge', () => {
    // A typical phone camera frame
    expect(fitWithin(3024, 4032, 900)).toEqual({ width: 675, height: 900 })
  })

  it('scales a large landscape photo down by its longest edge', () => {
    expect(fitWithin(4032, 3024, 900)).toEqual({ width: 900, height: 675 })
  })

  it('preserves aspect ratio', () => {
    const { width, height } = fitWithin(4000, 3000, 900)
    expect(width / height).toBeCloseTo(4 / 3, 2)
  })

  it('leaves an image already within bounds untouched', () => {
    // Upscaling only adds bytes without adding detail
    expect(fitWithin(400, 600, 900)).toEqual({ width: 400, height: 600 })
    expect(fitWithin(900, 900, 900)).toEqual({ width: 900, height: 900 })
  })

  it('never rounds a dimension away to zero', () => {
    const { width, height } = fitWithin(4000, 3, 900)
    expect(width).toBe(900)
    expect(height).toBeGreaterThanOrEqual(1)
  })

  it('handles degenerate dimensions without producing NaN', () => {
    expect(fitWithin(0, 0, 900)).toEqual({ width: 0, height: 0 })
  })
})

describe('dataUrlBytes', () => {
  it('measures the decoded size, not the base64 length', () => {
    // "hello" is 5 bytes, 8 base64 characters
    expect(dataUrlBytes('data:image/jpeg;base64,aGVsbG8=')).toBe(5)
  })

  it('accounts for both padding lengths', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,YQ==')).toBe(1)
    expect(dataUrlBytes('data:image/jpeg;base64,YWI=')).toBe(2)
    expect(dataUrlBytes('data:image/jpeg;base64,YWJj')).toBe(3)
  })

  it('is roughly three quarters of the encoded length for real payloads', () => {
    const payload = 'A'.repeat(40_000)
    const bytes = dataUrlBytes(`data:image/jpeg;base64,${payload}`)
    expect(bytes).toBe(30_000)
  })
})

describe('isStoredImage', () => {
  it('distinguishes a photo held on the device from a linked one', () => {
    expect(isStoredImage('data:image/jpeg;base64,abc')).toBe(true)
    expect(isStoredImage('https://example.com/bottle.jpg')).toBe(false)
    expect(isStoredImage('')).toBe(false)
    expect(isStoredImage(undefined)).toBe(false)
  })
})

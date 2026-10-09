import { describe, it, expect } from 'vitest'
import { withoutPhotos, PHOTO_PLACEHOLDER } from '../backup.service'

describe('withoutPhotos', () => {
  it('removes photos wherever they are, including inside the history log', () => {
    const backup = {
      tables: {
        wines: [{ id: 'w1', name: 'Tondonia', image_url: 'data:image/jpeg;base64,AAAA', quantity_at_home: 3 }],
        audit_log: [{ details: { old_values: { image_url: 'data:image/png;base64,BBBB' }, fields_changed: ['name'] } }],
      },
    }
    const slim = withoutPhotos(backup)
    expect(slim.tables.wines[0].image_url).toBe(PHOTO_PLACEHOLDER)
    expect(slim.tables.audit_log[0].details.old_values.image_url).toBe(PHOTO_PLACEHOLDER)
    expect(slim.tables.wines[0].quantity_at_home).toBe(3)
    expect(slim.tables.audit_log[0].details.fields_changed).toEqual(['name'])
  })

  it('keeps photo links that are addresses rather than embedded images', () => {
    expect(withoutPhotos({ image_url: 'https://example.com/a.jpg' }).image_url).toBe('https://example.com/a.jpg')
  })

  it('leaves the original untouched', () => {
    const wine = { image_url: 'data:image/jpeg;base64,AAAA' }
    withoutPhotos(wine)
    expect(wine.image_url).toBe('data:image/jpeg;base64,AAAA')
  })
})

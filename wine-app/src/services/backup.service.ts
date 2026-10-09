/**
 * A backup with the photos taken out.
 *
 * Photos are stored inside the data as images written out in full, and
 * each edit to a wine also copies its photo into the history log — so
 * they are nearly all of a backup's size. Without them it is small
 * enough to attach to a message, which is what you want when sending
 * the data to someone to look at. It is not a full backup: restoring
 * it brings back everything except the pictures.
 */
export const PHOTO_PLACEHOLDER = '[photo removed]'

export function withoutPhotos<T>(value: T): T {
  if (typeof value === 'string') {
    return (value.startsWith('data:') ? PHOTO_PLACEHOLDER : value) as T
  }
  if (Array.isArray(value)) return value.map(withoutPhotos) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, withoutPhotos(inner)])
    ) as T
  }
  return value
}

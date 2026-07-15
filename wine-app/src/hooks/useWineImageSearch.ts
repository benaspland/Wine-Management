import { useState } from 'react'
import { searchWineImages, type ImageResult } from '../services/imageSearch.service'

/** Image search state for the wine form's bottle-image picker. */
export function useWineImageSearch() {
  const [results, setResults] = useState<ImageResult[]>([])
  const [searching, setSearching] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const search = async (producer: string, name: string, vintage?: number) => {
    setSearching(true)
    setPickerOpen(true)
    try {
      setResults(await searchWineImages(producer, name, vintage))
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const closePicker = () => setPickerOpen(false)

  return { results, searching, pickerOpen, search, closePicker }
}

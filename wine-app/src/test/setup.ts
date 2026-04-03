import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.electronAPI if needed
Object.defineProperty(window, 'electronAPI', {
  value: undefined,
  writable: true,
})

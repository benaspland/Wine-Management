/// <reference types="vite/client" />

// Fontsource packages export bare CSS with no type declarations
declare module '@fontsource-variable/inter'
declare module '@fontsource/noto-serif/*'
/// <reference types="vite-plugin-pwa/client" />

/** Stamped at build time by vite.config.ts; absent under the test runner. */
declare const __BUILD_TIME__: string | undefined

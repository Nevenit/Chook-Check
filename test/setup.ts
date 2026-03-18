// Vitest global setup
// Polyfill IndexedDB for Dexie tests (no-op in tests that don't use it)
import "fake-indexeddb/auto";

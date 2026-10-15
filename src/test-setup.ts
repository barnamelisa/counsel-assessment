import '@testing-library/jest-dom/vitest';
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: window.localStorage,
});
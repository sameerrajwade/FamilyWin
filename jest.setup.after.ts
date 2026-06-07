// Runs AFTER Jest test framework is set up — Jest globals (expect, beforeAll, etc.) are available here
import '@testing-library/jest-native/extend-expect';

// Silence React Warning: messages from console.error (they're expected in tests)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && (
      args[0].includes('Warning:') ||
      args[0].includes('act(') ||
      args[0].includes('not wrapped in act')
    )) return;
    originalError(...args);
  };
});
afterAll(() => { console.error = originalError; });

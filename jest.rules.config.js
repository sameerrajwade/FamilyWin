/**
 * jest.rules.config.js
 * Standalone config for the Firestore security-rules suite. Runs in a plain Node
 * environment (NOT jest-expo / React Native) against the Firestore emulator.
 *
 *   firebase emulators:exec --only firestore "npx jest --config jest.rules.config.js"
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/rules/**/*.test.js'],
  transform: {},
  testTimeout: 20000,
};

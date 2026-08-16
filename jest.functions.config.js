/**
 * jest.functions.config.js
 * Standalone config for the Cloud Functions integration tests. Runs in Node
 * against the firestore + functions emulators (which load firebase/functions).
 *
 *   firebase emulators:exec --project demo-lootboard --only firestore,functions \
 *     "npx jest --config jest.functions.config.js"
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/functions/**/*.test.js'],
  transform: {},
  testTimeout: 60000,
  // Serialize suites: they share one emulator backend, and running trigger-heavy
  // suites in parallel workers floods the async trigger queue so another suite's
  // polls time out. One worker keeps trigger latency deterministic.
  maxWorkers: 1,
};

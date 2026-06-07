module.exports = {
  extends: ['expo'],
  rules: {
    // @/ path alias is resolved by TypeScript (tsc --noEmit passes cleanly).
    // ESLint's import resolver doesn't know about it — suppress false positives.
    'import/no-unresolved': 'off',
    // Warnings only for unused vars — don't block build
    'no-unused-vars': 'warn',
    '@typescript-eslint/no-unused-vars': 'warn',
    // Reanimated hooks intentionally omit animated values from deps arrays
    'react-hooks/exhaustive-deps': 'warn',
    'no-console': 'off',
  },
  ignorePatterns: ['node_modules/', 'android/', 'ios/', 'preview/'],
};

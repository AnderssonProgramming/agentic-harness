import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'build', 'coverage', 'node_modules'] },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  comments.recommended,
  {
    // CLAUDE.md: every disabled rule must carry a written reason after "--".
    rules: {
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'vite.config.ts'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ClassDeclaration',
          message: 'Classes are forbidden (CLAUDE.md). Use functions.',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports (CLAUDE.md).',
        },
      ],
    },
  },
  {
    // ADR-07, B-08: storage is reached only through a feature's api/ layer.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/features/*/api/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: "Use the feature's api/ layer (ADR-07)." },
        { name: 'sessionStorage', message: "Use the feature's api/ layer (ADR-07)." },
      ],
      'no-restricted-properties': [
        'error',
        { property: 'localStorage', message: "Use the feature's api/ layer (ADR-07)." },
        { property: 'sessionStorage', message: "Use the feature's api/ layer (ADR-07)." },
      ],
    },
  },
  {
    files: ['vite.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '.claude/skills/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);

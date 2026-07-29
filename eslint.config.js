import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  // `sito-vetrina/` è un sito statico a sé: non entra nella build
  // dell'applicazione e ha le sue regole (JavaScript da browser, senza moduli).
  { ignores: ['dist', 'node_modules', 'coverage', 'sito-vetrina'] },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      // I nomi in PascalCase sono componenti: ESLint di base non vede l'uso
      // dentro il JSX, quindi li segnalerebbe come inutilizzati. L'alternativa
      // sarebbe aggiungere eslint-plugin-react solo per `jsx-uses-vars`.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^(_|[A-Z])' },
      ],
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]

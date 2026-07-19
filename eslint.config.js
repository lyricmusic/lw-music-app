import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

const publicApiPattern = {
  group: ['@/entities/*/*', '@/features/*/*', '@/pages/*/*', '@/widgets/*/*'],
  message: 'Импортируйте слайс только через его публичный index.ts.',
}

function restrictLayers(layers) {
  return [
    'error',
    {
      patterns: [
        publicApiPattern,
        {
          group: layers.map(layer => `@/${layer}/**`),
          message: 'Этот импорт нарушает направление зависимостей FSD.',
        },
      ],
    },
  ]
}

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'server/**', 'serverless/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictLayers([
        'app',
        'pages',
        'widgets',
        'features',
        'entities',
      ]),
    },
  },
  {
    files: ['src/entities/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictLayers([
        'app',
        'pages',
        'widgets',
        'features',
      ]),
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictLayers(['app', 'pages', 'widgets']),
    },
  },
  {
    files: ['src/widgets/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictLayers(['app', 'pages']),
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictLayers(['app']),
    },
  },
]

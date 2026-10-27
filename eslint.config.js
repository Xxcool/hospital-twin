// TypeScript 7 由 tsc 检查语义；Babel 仅解析 TS/TSX，ESLint 检查通用与 Hooks 规则。
import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'assets/**', 'docs/**', 'tools/**', 'work/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          presets: ['@babel/preset-typescript'],
          plugins: ['@babel/plugin-syntax-jsx'],
        },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': hooks },
    rules: {
      // 类型声明、类型作用域与未使用符号交给 tsc，避免 JS 规则误判 TS 语法。
      'no-undef': 'off',
      'no-irregular-whitespace': ['error', { skipStrings: true, skipJSXText: true }],
      'no-unused-vars': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];

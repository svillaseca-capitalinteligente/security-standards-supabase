// Política de seguridad aplicada a lint (ESLint flat config).
//
// NO es un preset de "buenas prácticas" advisory. Es POLÍTICA: las reglas de
// seguridad/correctitud están en `error` y rompen el build en CI. Corrige el
// agujero central de un config todo-en-`warn`: acá lo inseguro NO pasa.
//
// Peers: eslint@>=9, typescript-eslint@>=8, eslint-plugin-react-hooks@>=5.
// Requiere TS configurado (usa projectService para reglas type-aware).

import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/build/**', '**/out/**', '**/node_modules/**'] },

  // Base type-checked estricta: pone en `error` no-floating-promises,
  // no-unsafe-*, no-explicit-any, etc. (lo que el config advisory omitía).
  ...tseslint.configs.strictTypeChecked,

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: { parserOptions: { projectService: true } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // ── Correctitud asíncrona (bugs reales que el advisory no veía) ──
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // ── Type-safety: `any` y accesos unsafe = error, no warning ──
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // ── Ejecución dinámica de código ──
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // ── React hooks: dependencias mal declaradas = bugs de estado/seguridad ──
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // ── Higiene ──
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Los tests pueden relajar type-checking, pero nunca las reglas de seguridad.
  {
    files: ['**/*.test.{ts,tsx}'],
    ...tseslint.configs.disableTypeChecked,
  },
);

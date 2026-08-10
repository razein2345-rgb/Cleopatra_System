import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    // shadcn/ui components intentionally co-export variant helpers (e.g. buttonVariants)
    // alongside the component, which is safe but trips react-refresh's export-shape check.
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // React context modules intentionally co-export a provider component and its
    // matching useX() hook from the same file — the standard context pattern.
    files: ['src/state/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Dashboard widget/data-provider modules intentionally co-export a plain
    // registration object (DashboardWidgetDefinition) or a useX() context hook
    // alongside their component — the same class of deliberate co-export as
    // the two exemptions above, see REFINEMENTS.md §2.
    files: ['src/lib/dashboard/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
]);

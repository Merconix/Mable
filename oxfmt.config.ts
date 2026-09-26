import type { OxfmtConfig } from 'oxfmt';

export default {
  printWidth: 100,
  tabWidth: 2,
  singleQuote: true,
  trailingComma: 'es5',
  ignorePatterns: [
    'dist',
    'node_modules',
    'src/app/generated',
    'src-tauri/ios-project.yml',
    // Copied verbatim from the Firebase console; formatting it would drift.
    'src-tauri/gen/android/app/google-services.json',
    // knope rewrites these on every release; reformatting them breaks the next fmt:check.
    'package.json',
    'src-tauri/tauri.conf.json',
    'pnpm-lock.yaml',
    'LICENSE',
    'README.md',
    'CHANGELOG.md',
    './changeset',
  ],
} satisfies OxfmtConfig;

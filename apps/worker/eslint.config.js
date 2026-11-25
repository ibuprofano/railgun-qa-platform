const base = require('@railgun-qa/config');
const globals = require('globals');

// Same posture as apps/api's PrismaClient rule (ADR 0008): task code gets a client from
// withTenantContext, never a raw connection. Only the connection and context modules
// (and tests, which set up fixtures) may import pg values; type-only imports are fine.
module.exports = [
  ...base,
  { ignores: ['dist/**'] },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'pg',
              importNames: ['Pool', 'Client'],
              allowTypeImports: true,
              message:
                'Task code must not open its own connections. Use withTenantContext (src/tenant-context.ts) with the shared pool from src/db.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/db.ts', 'src/tenant-context.ts', 'src/**/*.spec.ts', 'test/**/*.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
  {
    // Plain CommonJS run by Node directly: the font fetch script, and the PDF render thread,
    // which runs unchanged under ts-node-dev, Jest and dist (report-pipeline design.md decision 5).
    files: ['scripts/**/*.js', 'src/**/*.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];

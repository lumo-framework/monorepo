import baseConfig from '../../eslint.config.js';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        ...baseConfig[1].languageOptions.globals,
        // Cloudflare Workers globals
        URL: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        MessageBatch: 'readonly',
        Message: 'readonly',
        Queue: 'readonly',
        KVNamespace: 'readonly',
        ExecutionContext: 'readonly',
      },
    },
  },
];

module.exports = {
  root: true,
  plugins: ['@typescript-eslint'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      parser: '@typescript-eslint/parser',
      extends: ['plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
      plugins: ['@typescript-eslint/eslint-plugin', 'prettier'],
      rules: {
        'prettier/prettier': 'error',
        '@typescript-eslint/interface-name-prefix': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        'no-empty-function': 'off',
        '@typescript-eslint/no-empty-function': [
          'warn',
          { allow: ['arrowFunctions', 'asyncFunctions', 'asyncMethods', 'overrideMethods'] },
        ],
      },
    },
  ],
  env: {
    node: true,
  },
};

const nativeConfig = require('eslint-config-universe/flat/native');
const webConfig = require('eslint-config-universe/flat/web');

module.exports = [
  ...nativeConfig,
  ...webConfig,
  {
    ignores: ['build/', 'plugin/build/', 'cli/dist/', 'node_modules/'],
  },
];

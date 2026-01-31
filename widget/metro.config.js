const path = require('path');

const exampleRoot = path.resolve(__dirname, '../example');
const exampleNodeModules = path.resolve(exampleRoot, 'node_modules');
const reactNativePath = path.resolve(exampleNodeModules, 'react-native');

module.exports = {
  projectRoot: __dirname,
  watchFolders: [
    path.resolve(__dirname, '..'),
  ],
  resolver: {
    nodeModulesPaths: [
      exampleNodeModules,
      path.resolve(__dirname, '..', 'node_modules'),
    ],
    blockList: [
      new RegExp(path.resolve(__dirname, '..', 'node_modules', 'react') + '/.*'),
      new RegExp(path.resolve(__dirname, '..', 'node_modules', 'react-native') + '/.*'),
    ],
  },
  serializer: {
    getPolyfills: () =>
      require(path.resolve(exampleNodeModules, '@react-native/js-polyfills'))(),
    getModulesRunBeforeMainModule: () => [
      require.resolve(path.join(reactNativePath, 'Libraries/Core/InitializeCore')),
    ],
  },
  transformer: {
    assetRegistryPath: path.resolve(exampleNodeModules, 'react-native/Libraries/Image/AssetRegistry'),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  server: {
    port: 8082,
  },
};

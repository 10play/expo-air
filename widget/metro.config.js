const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const exampleRoot = path.resolve(__dirname, '../example');
const exampleNodeModules = path.resolve(exampleRoot, 'node_modules');

const config = getDefaultConfig(__dirname);

// Watch the monorepo root so edits to the library are picked up
config.watchFolders = [path.resolve(__dirname, '..')];

// Resolve from example's node_modules (complete install), then widget's, then parent's
config.resolver.nodeModulesPaths = [
  exampleNodeModules,
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '..', 'node_modules'),
];

// Block duplicate react/react-native from the parent (library) node_modules
// and block example app source files (but not its node_modules)
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(path.resolve(__dirname, '..', 'node_modules', 'react') + '/.*'),
  new RegExp(path.resolve(__dirname, '..', 'node_modules', 'react-native') + '/.*'),
  new RegExp(exampleRoot + '/(?!node_modules).*'),
];

module.exports = config;

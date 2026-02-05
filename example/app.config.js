const baseConfig = require("./app.json");

const bundleSuffix = process.env.EXPO_AIR_BUNDLE_SUFFIX;
const nameSuffix = process.env.EXPO_AIR_APP_NAME_SUFFIX;

module.exports = {
  ...baseConfig.expo,
  // Add branch suffix to app name so you can tell them apart on the home screen
  name: nameSuffix
    ? `${baseConfig.expo.name} (${nameSuffix})`
    : baseConfig.expo.name,
  ios: {
    ...baseConfig.expo.ios,
    // Add branch suffix to bundle ID so multiple worktrees can install on the same device
    bundleIdentifier: bundleSuffix
      ? `${baseConfig.expo.ios.bundleIdentifier}.${bundleSuffix}`
      : baseConfig.expo.ios.bundleIdentifier,
  },
  android: {
    ...baseConfig.expo.android,
    // Same for Android package name
    package: bundleSuffix
      ? `${baseConfig.expo.android.package}.${bundleSuffix.replace(/-/g, "_")}`
      : baseConfig.expo.android.package,
  },
};

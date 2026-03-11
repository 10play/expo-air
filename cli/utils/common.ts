// Barrel re-exports for backward compatibility.
// New code should import from the specific module directly.
export { waitForPort } from "./ports.js";
export type { ExtraTunnelConfig, ExpoAirConfig } from "./config.js";
export { writeLocalConfig, readExpoAirConfig, updateEnvFile } from "./config.js";
export { updateInfoPlist, updateAndroidManifest, resolveAndroidJavaHome } from "./platform.js";
export { getPackageRoot, isInstalledFromNpm, hasPrebuiltWidgetBundle, resolveProjectRoot, validateExpoProject, getAppBundleId } from "./project.js";
export type { PackageManager } from "./packageManager.js";
export { detectPackageManager, getExecCommand, getInstallCommand, getRunScriptCommand } from "./packageManager.js";
export { maskSecret, appendSecret } from "./secret.js";
export { getGitBranchSuffix } from "./git.js";

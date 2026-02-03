// Reexport the native module. On web, it will be resolved to ExpoAirModule.web.ts
// and on native platforms to ExpoAirModule.ts
export { default } from "./ExpoAirModule";
export { default as ExpoAirView } from "./ExpoAirView";
export * from "./ExpoAir.types";

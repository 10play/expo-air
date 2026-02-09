// Reexport the native module. On web, it will be resolved to ExpoAirModule.web.ts
// and on native platforms to ExpoAirModule.ts
export { default } from "./ExpoAirModule";
export * from "./ExpoAir.types";

import { NativeModule, requireNativeModule } from "expo";

import { ActionConfig, ExpoAirModuleEvents } from "./ExpoAir.types";

declare class ExpoAirModule extends NativeModule<ExpoAirModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
  show(options?: { size?: number; color?: string }): void;
  hide(): void;
  expand(): void;
  collapse(): void;
  setServerUrl(url: string): void;
  getServerUrl(): string;
  setAction(config: ActionConfig | null): void;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoAirModule>("ExpoAir");

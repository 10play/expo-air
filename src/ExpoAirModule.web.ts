import { registerWebModule, NativeModule } from "expo";

import { ExpoAirModuleEvents } from "./ExpoAir.types";

class ExpoAirModule extends NativeModule<ExpoAirModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit("onChange", { value });
  }
  hello() {
    return "Hello world! 👋";
  }
}

export default registerWebModule(ExpoAirModule, "ExpoAirModule");

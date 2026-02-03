import { requireNativeView } from "expo";
import * as React from "react";

import { ExpoAirViewProps } from "./ExpoAir.types";

const NativeView: React.ComponentType<ExpoAirViewProps> =
  requireNativeView("ExpoAir");

export default function ExpoAirView(props: ExpoAirViewProps) {
  return <NativeView {...props} />;
}

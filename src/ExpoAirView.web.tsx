import * as React from "react";

import { ExpoAirViewProps } from "./ExpoAir.types";

export default function ExpoAirView(props: ExpoAirViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}

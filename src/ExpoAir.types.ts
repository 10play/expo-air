import type { StyleProp, ViewStyle } from "react-native";

export type OnLoadEventPayload = {
  url: string;
};

export type ExpoAirModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
  onPress: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onDragEnd: (params: { x: number; y: number }) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type ExpoAirViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};

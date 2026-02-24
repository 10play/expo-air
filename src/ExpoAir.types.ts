export interface ActionConfig {
  label: string;
  textStyle?: { color?: string; fontWeight?: string };
}

export type ExpoAirModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
  onPress: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onDragEnd: (params: { x: number; y: number }) => void;
  onActionPress: () => void;
};

export type ChangeEventPayload = {
  value: string;
};

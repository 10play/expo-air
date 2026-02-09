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

/**
 * Design constants for consistent spacing, colors, and sizing across the widget.
 * All components should use these values to maintain visual consistency.
 */

// Spacing
export const SPACING = {
  /** Extra small spacing - 4px */
  XS: 4,
  /** Small spacing - 8px */
  SM: 8,
  /** Medium spacing - 12px */
  MD: 12,
  /** Large spacing - 16px */
  LG: 16,
  /** Extra large spacing - 20px */
  XL: 20,
  /** 2x extra large spacing - 24px */
  XXL: 24,
} as const;

// Layout
export const LAYOUT = {
  /** Horizontal padding for main content areas */
  CONTENT_PADDING_H: SPACING.LG,
  /** Vertical padding for sections */
  SECTION_PADDING_V: SPACING.MD,
  /** Gap between elements in a row */
  ELEMENT_GAP: SPACING.MD,
  /** Border radius for the main container */
  BORDER_RADIUS_LG: 32,
  /** Border radius for buttons and pills */
  BORDER_RADIUS_MD: 20,
  /** Border radius for small elements */
  BORDER_RADIUS_SM: 14,
} as const;

// Colors
export const COLORS = {
  // Backgrounds
  BACKGROUND: "#000",
  BACKGROUND_ELEVATED: "rgba(255,255,255,0.03)",
  BACKGROUND_INTERACTIVE: "rgba(255,255,255,0.08)",
  BACKGROUND_INPUT: "rgba(255,255,255,0.1)",
  BACKGROUND_BUTTON: "rgba(255,255,255,0.15)",

  // Text
  TEXT_PRIMARY: "#fff",
  TEXT_SECONDARY: "rgba(255,255,255,0.6)",
  TEXT_TERTIARY: "rgba(255,255,255,0.5)",
  TEXT_MUTED: "rgba(255,255,255,0.4)",

  // Borders
  BORDER: "rgba(255,255,255,0.08)",

  // Status colors
  STATUS_SUCCESS: "#30D158",
  STATUS_ERROR: "#FF3B30",
  STATUS_INFO: "#007AFF",
  STATUS_NEUTRAL: "#8E8E93",
} as const;

// Typography
export const TYPOGRAPHY = {
  SIZE_XS: 11,
  SIZE_SM: 13,
  SIZE_MD: 14,
  SIZE_LG: 15,
  SIZE_XL: 17,

  WEIGHT_NORMAL: "400" as const,
  WEIGHT_MEDIUM: "500" as const,
  WEIGHT_SEMIBOLD: "600" as const,
} as const;

// Component-specific sizes
export const SIZES = {
  /** Status indicator dot */
  STATUS_DOT: 8,
  /** Close button touch target */
  CLOSE_BUTTON: 30,
  /** Submit button */
  SUBMIT_BUTTON: 40,
  /** CTA button vertical padding */
  CTA_PADDING_V: 6,
  /** CTA button horizontal padding */
  CTA_PADDING_H: 12,
} as const;

export const workspacePalette = {
  background: "#f6f8fb",
  backgroundSoft: "#eef3f8",
  surface: "#ffffff",
  surfaceSoft: "#f1f5f9",
  surfaceRaised: "#ffffff",
  ink: "#172033",
  inkSoft: "#64748b",
  line: "#d8dee8",
  lineStrong: "#b8c2d1",
  primary: "#0f766e",
  primaryStrong: "#0b5d56",
  primarySoft: "#d9f2ef",
  info: "#2563eb",
  success: "#168a4a",
  warning: "#b76500",
  danger: "#b4233f"
} as const;

export const darkWorkspacePalette = {
  background: "#0d1117",
  backgroundSoft: "#111827",
  surface: "#171f2b",
  surfaceSoft: "#1d2735",
  surfaceRaised: "#202b39",
  ink: "#edf2f7",
  inkSoft: "#a8b3c2",
  line: "#2d3a4c",
  lineStrong: "#40516a",
  primary: "#4fc4b8",
  primaryStrong: "#2aa99c",
  primarySoft: "#123b38",
  info: "#7aa7ff",
  success: "#58d68d",
  warning: "#f2b45f",
  danger: "#f19aaa"
} as const;

export const surfaceRadiusPx = {
  panel: 8,
  control: 7,
  badge: 999
} as const;

export const semanticColorNames = ["success", "warning", "danger", "info"] as const;

import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Same zigzag "Z" mark as components/layout/Logo.tsx, rendered via
// next/og's satori-based renderer for the browser tab favicon — kept in
// sync manually since ImageResponse can't reuse a plain React SVG component.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #2563eb 0%, #020617 100%)",
          borderRadius: 7,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
          <path
            d="M28 28H72L28 72H72"
            stroke="white"
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS applies its own rounded-square mask over this, so no border-radius
// here and a bit more internal padding than the favicon (icon.tsx).
export default function AppleIcon() {
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
        }}
      >
        <svg width="108" height="108" viewBox="0 0 100 100" fill="none">
          <path
            d="M28 28H72L28 72H72"
            stroke="white"
            strokeWidth="15"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}

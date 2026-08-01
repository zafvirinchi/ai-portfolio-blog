import { ImageResponse } from "next/og";

export const alt = "Zafrul Islam | Full Stack Developer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          background: "linear-gradient(135deg, #020617 0%, #172554 55%, #0f172a 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 220,
            height: 220,
            borderRadius: 48,
            background: "linear-gradient(135deg, #2563eb 0%, #020617 100%)",
          }}
        >
          <svg width="132" height="132" viewBox="0 0 100 100" fill="none">
            <path
              d="M28 28H72L28 72H72"
              stroke="white"
              strokeWidth="14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700, color: "white" }}>
            Zafrul TechStack
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#93c5fd", marginTop: 12 }}>
            Full Stack Developer &middot; Portfolio &amp; AI Assistant
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

import { ImageResponse } from "next/og";

/**
 * 180×180 PNG Apple touch icon, generated at request time via @vercel/og.
 * iOS Safari looks for /apple-touch-icon.png + /apple-touch-icon-152x152.png
 * etc. — Next.js routes all of those to this single file. Clean white tile
 * with the blue Snappeal shield centred so the home-screen icon reads as
 * native-app quality.
 */
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 132,
            height: 148,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {/* Canonical Snappeal shield + hollow check — mirrors
              components/Logo.tsx so the home-screen icon is identical
              to the in-app mark. */}
          <svg
            width="140"
            height="140"
            viewBox="0 0 80 80"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M40 4 C 24 4, 14 6, 10 10 C 8 12, 8 16, 8 24 V 44 C 8 58, 18 68, 40 76 C 62 68, 72 58, 72 44 V 24 C 72 16, 72 12, 70 10 C 66 6, 56 4, 40 4 Z"
              fill="#0b1f44"
            />
            <path
              d="M24 42 L 35 53 L 56 30"
              fill="none"
              stroke="#ffffff"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}

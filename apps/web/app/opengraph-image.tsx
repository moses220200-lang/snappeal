import { ImageResponse } from "next/og";

/**
 * 1200×630 social-share image. Generated at request time via @vercel/og so
 * we don't have to commit a binary. Layout mirrors the landing-page hero:
 * ParkingRabbit shield + headline left, yellow ticket-stub right.
 */
export const runtime = "edge";
export const alt = "ParkingRabbit — pay or challenge your London parking ticket";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "radial-gradient(60% 50% at 15% 30%, rgba(0,122,255,0.10) 0%, transparent 60%), radial-gradient(50% 40% at 90% 10%, rgba(0,122,255,0.08) 0%, transparent 60%), #fafafa",
          padding: 64,
          alignItems: "center",
          justifyContent: "space-between",
          color: "#0a1929",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif",
        }}
      >
        {/* LEFT — wordmark + headline */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* Canonical ParkingRabbit shield — mirrors components/Logo.tsx so
                the OG card uses the same mark as the favicon + app. */}
            <svg
              width="76"
              height="76"
              viewBox="0 0 80 80"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M40 4 C 24 4, 14 6, 10 10 C 8 12, 8 16, 8 24 V 44 C 8 58, 18 68, 40 76 C 62 68, 72 58, 72 44 V 24 C 72 16, 72 12, 70 10 C 66 6, 56 4, 40 4 Z"
                fill="#0b1f44"
              />
              <g fill="#ffffff">
                <path d="M33 14 C 30 16 28.5 22 29 30 C 29.5 36 32 39 35 38 C 37 34 37.5 25 36 18 C 35.3 14.5 34 13.5 33 14 Z" />
                <path d="M45 16 C 47 15 48.5 16.5 49 20 C 49.5 26 49 32 47.5 35.5 C 45.5 38 43 36 42.5 32 C 42 26 43 19.5 45 16 Z" />
                <circle cx="38" cy="42" r="8" />
                <path d="M22 58 C 22 49 28 43 38 43 C 52 43 58 51 58 60 C 58 68 50 71 40 71 C 30 71 24 66 22 58 Z" />
                <ellipse cx="29" cy="67" rx="4.5" ry="3.5" />
                <circle cx="55" cy="62" r="3" />
              </g>
            </svg>
            <div
              style={{
                fontSize: 44,
                fontWeight: 800,
                letterSpacing: -1.5,
                color: "#0a1929",
              }}
            >
              ParkingRabbit
            </div>
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              marginTop: 40,
              color: "#0a1929",
            }}
          >
            Don&apos;t pay that parking ticket.
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              marginTop: 18,
              color: "#007aff",
              letterSpacing: -1,
            }}
          >
            We&apos;ll appeal it for you — £2.99.
          </div>
          <div
            style={{
              fontSize: 24,
              color: "#6e6e73",
              marginTop: 22,
            }}
          >
            AI drafts and submits your London PCN appeal in minutes.
          </div>
        </div>

        {/* RIGHT — yellow PCN ticket */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="320"
            height="320"
            viewBox="0 0 320 320"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern
                id="ogDiamondHatch"
                patternUnits="userSpaceOnUse"
                width="10"
                height="10"
                patternTransform="rotate(45)"
              >
                <rect width="10" height="10" fill="#0a0a0a" />
                <rect x="1.4" y="1.4" width="7.2" height="7.2" fill="#ffffff" />
              </pattern>
            </defs>
            <rect width="320" height="320" rx="16" fill="#ffffff" stroke="#cfcfd4" strokeWidth="1" />
            <rect width="320" height="28" fill="#e6e6ea" />
            <rect x="36" y="60" width="248" height="232" fill="url(#ogDiamondHatch)" />
            <rect x="56" y="80" width="208" height="192" fill="#fdd420" />
            <text
              x="160"
              y="138"
              textAnchor="middle"
              fontFamily="Helvetica, Arial, sans-serif"
              fontSize="30"
              fontWeight={900}
              fill="#0a0a0a"
              letterSpacing={-0.6}
            >
              PENALTY
            </text>
            <text
              x="160"
              y="172"
              textAnchor="middle"
              fontFamily="Helvetica, Arial, sans-serif"
              fontSize="30"
              fontWeight={900}
              fill="#0a0a0a"
              letterSpacing={-0.6}
            >
              CHARGE
            </text>
            <text
              x="160"
              y="206"
              textAnchor="middle"
              fontFamily="Helvetica, Arial, sans-serif"
              fontSize="30"
              fontWeight={900}
              fill="#0a0a0a"
              letterSpacing={-0.6}
            >
              NOTICE
            </text>
            <text
              x="160"
              y="246"
              textAnchor="middle"
              fontFamily="Helvetica, Arial, sans-serif"
              fontSize="18"
              fontWeight={800}
              fill="#0a0a0a"
              letterSpacing={0.8}
            >
              WARNING
            </text>
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}

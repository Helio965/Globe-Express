import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org", port: "", pathname: "/wikipedia/commons/**" },
      { protocol: "https", hostname: "thumb.wikimedia.org", port: "", pathname: "/wikipedia/commons/**" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" }
    ] }];
  }
};
export default config;

/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL || "http://127.0.0.1:8010"

const nextConfig = {
  reactStrictMode: true,
  // The dev badge sits exactly where the canvas toolbar is.
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }]
  },
}

export default nextConfig

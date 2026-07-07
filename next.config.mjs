/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for Docker deploys (see Dockerfile).
  output: "standalone",
  serverExternalPackages: ["fluent-ffmpeg"],
};

export default nextConfig;

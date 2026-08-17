/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @cro/shared ships TypeScript-built ESM from the workspace.
  transpilePackages: ['@cro/shared'],
};

export default nextConfig;

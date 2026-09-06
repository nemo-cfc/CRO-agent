import { loadRootEnv } from '../../scripts/load-root-env.mjs';

loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Both workspace packages ship TypeScript source rather than a build step,
  // so Next compiles them as part of the app.
  transpilePackages: ['@cro/shared', '@cro/worker'],
  // Chromium and its launcher must stay external: bundling a package that
  // resolves a binary at runtime breaks the path it computes.
  serverExternalPackages: ['playwright-core', 'playwright', '@sparticuz/chromium', 'groq-sdk'],
  webpack: (config) => {
    // The worker is written for NodeNext, where relative imports carry a `.js`
    // suffix even though the file on disk is `.ts`. Node resolves that; webpack
    // does not, so every cross-file import in the pipeline fails to resolve
    // without this mapping.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;

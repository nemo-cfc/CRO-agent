import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // Both workspace packages ship TypeScript source rather than a build step,
  // so Next compiles them as part of the app.
  transpilePackages: ['@cro/shared', '@cro/worker'],
  // Chromium and its launcher must stay external: bundling a package that
  // resolves a binary at runtime breaks the path it computes.
  serverExternalPackages: ['playwright-core', 'playwright', '@sparticuz/chromium'],
  webpack: (config) => {
    // The worker is written for NodeNext, where relative imports carry a `.js`
    // suffix even though the file on disk is `.ts`. Node resolves that; webpack
    // does not, so every cross-file import in the pipeline fails to resolve
    // without this mapping.
    config.resolve.alias = { ...config.resolve.alias, '@cro/shared': path.resolve(appDir, '../../packages/shared/src'), '@cro/worker': path.resolve(appDir, '../worker/src'), '@cro/worker/pipeline$': path.resolve(appDir, '../worker/src/pipeline/run.ts'), '@cro/worker/url$': path.resolve(appDir, '../worker/src/pipeline/url.ts') };
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;

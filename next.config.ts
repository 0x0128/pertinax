import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pertinax reads the inventory, catalog and runs straight from disk on the server.
  // Keep Promptfoo out of the bundle: it is only ever spawned as a CLI.
  serverExternalPackages: ['promptfoo'],
  outputFileTracingIncludes: {
    '/**': ['./catalog/**/*', './inventory/**/*', './examples/**/*'],
  },
};

export default nextConfig;

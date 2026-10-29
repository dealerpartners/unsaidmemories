/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Original pages link to each other as *.html — route those to the clean routes, content unchanged.
    return [
      { source: '/index.html', destination: '/' },
      { source: '/:slug.html', destination: '/:slug' },
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), { canvas: 'commonjs canvas' }];
    } else {
      config.resolve.fallback = { ...config.resolve.fallback, canvas: false };
    }
    return config;
  },
};
export default nextConfig;

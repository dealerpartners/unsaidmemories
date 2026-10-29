/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

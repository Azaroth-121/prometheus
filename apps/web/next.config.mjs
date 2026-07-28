/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@prometheus/shared-types', '@prometheus/database', '@prometheus/auth', '@prometheus/ui'],
};

export default nextConfig;

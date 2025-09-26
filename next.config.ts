import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ① Игнорировать ошибки ESLint при билде (чтобы не блокировали деплой)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ② Твои alias / любые правки webpack — оставляем
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

export default nextConfig;

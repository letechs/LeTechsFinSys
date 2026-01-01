/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disable to avoid double rendering issues
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  },
  // Content Security Policy headers
  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // For development: allow localhost variants for local development
    // For production: use only the API URL from environment variable (no localhost)
    const cspConnectSrc = isDevelopment && (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1'))
      ? "'self' http://localhost:5000 http://127.0.0.1:5000 ws: wss:"
      : `'self' ${apiUrl} ws: wss:`;
    
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `connect-src ${cspConnectSrc}; default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';`,
          },
        ],
      },
    ]
  },
  // Add webpack config to handle potential issues
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  },
}

module.exports = nextConfig


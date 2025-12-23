/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'i.scdn.co',
                pathname: '/image/**',
            },
        ],
    },
    // Allow embedding in iframes (for Kartra and other platforms)
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'X-Frame-Options',
                        value: 'ALLOWALL', // Allow embedding from anywhere
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: "frame-ancestors 'self' https://*.kartra.com https://kartra.com https://*.crateoftheweek.com *;",
                    },
                ],
            },
        ];
    },
};

module.exports = nextConfig;

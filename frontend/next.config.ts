// next.config.js
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Other Next.js config options…

  async rewrites() {
    return [
      {
        source: '/threads/:path*',           // any request to /threads/...
        destination: 'http://localhost:5000/threads/:path*'
      },
      {
        source: '/threads',                  // optionally proxy /threads (no ID)
        destination: 'http://localhost:5000/threads'
      },
      // repeat for any other Flask endpoints, e.g.:
      {
        source: '/threads/:path*/chat',
        destination: 'http://localhost:5000/threads/:path*/chat'
      },
      {
        source: '/threads/:path*/step',
        destination: 'http://localhost:5000/threads/:path*/step'
      },
      {
        source: '/threads/:path*/close',
        destination: 'http://localhost:5000/threads/:path*/close'
      },
      {
        source: '/threads/:path*/escalate',
        destination: 'http://localhost:5000/threads/:path*/escalate'
      },
       {
        source: '/threads/:path*/solution',
        destination: 'http://localhost:5000/threads/:path*/solution'
      },
      // and so on for your other endpoints...
    ]
  }
};

export default nextConfig;

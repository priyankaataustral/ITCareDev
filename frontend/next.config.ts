// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We need to use static export because Azure Static Web Apps is a static hosting service.
  // This will generate all the necessary HTML, CSS, and JS at build time.
  output: 'export',

  // The 'rewrites' feature is a server-side concept that does not work with 'output: "export"'.
  // It should be removed to prevent conflicts and ensure a clean build.
  async rewrites() {
    return [];
  }
};

export default nextConfig;

/*
 *
 * --- Frontend Code Example (e.g., in a React component or utility file) ---
 *
 * This section shows how to update your frontend code to use the live backend API URL.
 * You must replace all your hardcoded 'localhost' calls with this pattern.
 *
 * 1. Create a .env.local file in the root of your project:
 * NEXT_PUBLIC_API_BASE=https://<your-app-service-name>.azurewebsites.net
 *
 * 2. Update your API calls to use this environment variable.
 * For example, if you have a function to fetch threads:
 */
//
// const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE;
//
// const getThreads = async () => {
//   try {
//     // Use the environment variable to get the base URL
//     const response = await fetch(`${API_BASE_URL}/threads`);
//     if (!response.ok) {
//       throw new Error('Network response was not ok');
//     }
//     const data = await response.json();
//     return data;
//   } catch (error) {
//     console.error('There was a problem with the fetch operation:', error);
//   }
// };
//
// // Example of calling the function:
// // getThreads().then(data => console.log(data));
//

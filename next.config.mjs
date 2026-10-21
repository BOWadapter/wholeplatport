/** @type {import('next').NextConfig} */
const nextConfig = {
  // Genera un servidor autocontenido en .next/standalone para la imagen Docker.
  output: 'standalone',
  images: {
    unoptimized: true,
  },
}

export default nextConfig

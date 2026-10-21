import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { PlatportProvider } from '@/components/platport-context'
import '@/app/globals.css'

export const metadata: Metadata = {
  title: 'Whole Platport Lite',
  description: 'Simulación académica de inteligencia de portafolio crypto.',
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b1014',
  colorScheme: 'dark light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <PlatportProvider>{children}</PlatportProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

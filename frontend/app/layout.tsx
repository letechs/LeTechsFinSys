import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: {
    default: 'LeTechs - Professional Trading Software Solutions',
    template: '%s | LeTechs'
  },
  description: 'LeTechs Finsys Technologies LLC provides cutting-edge trading software solutions including copy trading platforms, automated trading systems, Expert Advisors (EAs), and custom trading applications for MetaTrader 4 and MetaTrader 5.',
  keywords: [
    'copy trading',
    'MT5 copy trading',
    'automated trading',
    'trading software',
    'Expert Advisor',
    'EA trading',
    'MetaTrader 5',
    'MetaTrader 4',
    'trading automation',
    'forex trading software',
    'trading platform',
    'LeTechs',
    'Dubai trading software',
    'trading solutions'
  ],
  authors: [{ name: 'LeTechs Finsys Technologies LLC' }],
  creator: 'LeTechs Finsys Technologies LLC',
  publisher: 'LeTechs Finsys Technologies LLC',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://letechs.io'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://letechs.io',
    siteName: 'LeTechs',
    title: 'LeTechs - Professional Trading Software Solutions',
    description: 'Professional trading software solutions including copy trading platforms, automated trading systems, and Expert Advisors for MT4/MT5.',
    images: [
      {
        url: '/og-image.jpg', // You'll need to create this image (1200x630px recommended)
        width: 1200,
        height: 630,
        alt: 'LeTechs Trading Software Solutions',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LeTechs - Professional Trading Software Solutions',
    description: 'Professional trading software solutions including copy trading platforms, automated trading systems, and Expert Advisors for MT4/MT5.',
    images: ['/og-image.jpg'], // You'll need to create this image
    creator: '@letechs', // Update with your Twitter handle if you have one
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    // Optional: Uncomment when you add these files
    // apple: [
    //   { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    // ],
    // other: [
    //   {
    //     rel: 'mask-icon',
    //     url: '/safari-pinned-tab.svg',
    //     color: '#2563eb',
    //   },
    // ],
  },
  manifest: '/site.webmanifest',
  verification: {
    // Add verification codes here when you have them
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
    // bing: 'your-bing-verification-code',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}


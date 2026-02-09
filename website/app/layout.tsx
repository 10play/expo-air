import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s | expo-air',
    default: 'expo-air - Vibe Coding for React Native',
  },
  description:
    'AI-powered on-device development SDK for React Native/Expo. Send prompts to Claude directly from your iOS device.',
  metadataBase: new URL('https://expo-air.dev'),
  openGraph: {
    title: 'expo-air - Vibe Coding for React Native',
    description:
      'AI-powered on-device development SDK for React Native/Expo.',
    siteName: 'expo-air',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'expo-air - Vibe Coding for React Native',
    description:
      'AI-powered on-device development SDK for React Native/Expo.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}

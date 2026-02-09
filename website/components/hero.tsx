'use client';

import Link from 'next/link';
import { Logo } from './logo';
import { motion } from 'framer-motion';

export function Hero() {
  return (
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center px-6 py-24 text-center">
      {/* Subtle radial green glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4CD964] opacity-[0.04] blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 flex flex-col items-center"
      >
        <Logo className="mb-8 h-16 w-auto" animated />

        <h1 className="mb-4 max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">
          Vibing everywhere with{' '}
          <span className="bg-gradient-to-r from-[#4CD964] to-[#4ade80] bg-clip-text text-transparent">
            expo
          </span>
        </h1>

        <p className="mb-8 max-w-xl text-lg text-fd-muted-foreground">
          Keep working on your app everywhere, send prompts to your AI tool
          while on the go, test in real time, commit and create a pr.
        </p>

        <div className="flex gap-4">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/10play/expo-air"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-fd-border px-6 py-3 font-medium transition-colors hover:bg-fd-accent"
          >
            GitHub
          </a>
        </div>
      </motion.div>
    </section>
  );
}

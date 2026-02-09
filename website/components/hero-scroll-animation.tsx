'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Logo } from './logo';
import { IPhoneFrame } from './iphone-frame';

export function HeroScrollAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [logoTargetY, setLogoTargetY] = useState(-200);
  const [logoFinalScale, setLogoFinalScale] = useState(0.38);
  const [skipMountAnimation, setSkipMountAnimation] = useState(false);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Calculate logo target Y position
  useEffect(() => {
    const updateTarget = () => {
      const vh = window.innerHeight;
      const isMobile = window.innerWidth < 768; // matches md: breakpoint
      const phoneHeight = isMobile
        ? Math.min(vh * 0.55, 500)
        : Math.min(vh * 0.7, 700);

      // Dynamic Island bottom is at y=58 out of 884 in SVG coordinates
      // Logo should sit just below it
      const diBottomFromPhoneTop = phoneHeight * (58 / 884);
      // Logo center offset from viewport center to just below DI
      // Phone is centered, so phone top = (vh - phoneHeight) / 2
      // DI bottom in viewport = (vh - phoneHeight) / 2 + diBottomFromPhoneTop
      // Logo target center = DI bottom + small gap
      // But logo starts at viewport center (it's in a centered absolute div)
      // So offset = target - center = ((vh - phoneHeight) / 2 + diBottomFromPhoneTop + 20) - vh / 2
      //           = -phoneHeight / 2 + diBottomFromPhoneTop + 20
      const targetOffset =
        -phoneHeight / 2 + diBottomFromPhoneTop + 5;
      setLogoTargetY(targetOffset);
      setLogoFinalScale(isMobile ? 0.25 : 0.38);
    };

    if (window.scrollY > 100) {
      setSkipMountAnimation(true);
    }

    updateTarget();
    window.addEventListener('resize', updateTarget);
    return () => window.removeEventListener('resize', updateTarget);
  }, []);

  // --- Track 1: Text content fade out ---
  const textOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.25], [0, -80]);

  // --- Track 2: Buttons (slightly earlier fade) ---
  const buttonsOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  // --- Track 3: iPhone frame rises from bottom ---
  const iphoneY = useTransform(scrollYProgress, [0.15, 0.55], [600, 0]);
  const iphoneOpacity = useTransform(scrollYProgress, [0.15, 0.3], [0, 1]);
  const iphoneScale = useTransform(scrollYProgress, [0.15, 0.55], [0.85, 1]);

  // --- Track 4: Logo shrinks and repositions ---
  // Logo starts 100px above center (mimicking original flex column layout)
  const LOGO_INITIAL_OFFSET = -150;
  const logoScale = useTransform(scrollYProgress, [0.25, 0.65], [1, logoFinalScale]);
  const logoY = useTransform(
    scrollYProgress,
    [0.25, 0.65],
    [LOGO_INITIAL_OFFSET, logoTargetY]
  );

  // --- Background glow fade ---
  const glowOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);

  const mountInitial = skipMountAnimation ? false : { opacity: 0, y: 20 };
  const mountAnimate = { opacity: 1, y: 0 };

  return (
    <section ref={containerRef} className="relative h-[200vh]">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Background glow */}
        <motion.div
          style={{ opacity: glowOpacity }}
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4CD964] opacity-[0.04] blur-[120px]" />
        </motion.div>

        {/* iPhone frame layer — absolute centered */}
        <motion.div
          style={{
            y: iphoneY,
            opacity: iphoneOpacity,
            scale: iphoneScale,
          }}
          className="absolute inset-0 z-10 flex items-center justify-center"
        >
          <IPhoneFrame className="h-[55vh] max-h-[500px] w-auto md:h-[70vh] md:max-h-[700px]" />
        </motion.div>

        {/* Logo layer — absolute centered, offset above center */}
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <motion.div
            initial={skipMountAnimation ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div style={{ scale: logoScale, y: logoY }}>
              <Logo className="h-16 w-auto" animated />
            </motion.div>
          </motion.div>
        </div>

        {/* Text layer — absolute centered, fades out */}
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <motion.div
            initial={mountInitial}
            animate={mountAnimate}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <motion.div
              style={{ opacity: textOpacity, y: textY }}
              className="flex flex-col items-center px-6 pt-28 text-center"
            >
              <h1 className="mb-4 max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">
                Vibing everywhere with{' '}
                <span className="bg-gradient-to-r from-[#4CD964] to-[#4ade80] bg-clip-text text-transparent">
                  expo
                </span>
              </h1>

              <p className="mb-8 max-w-xl text-lg text-fd-muted-foreground">
                Keep working on your app everywhere, send prompts to your AI
                tool while on the go, test in real time, commit and create a pr.
              </p>

              <motion.div
                style={{ opacity: buttonsOpacity }}
                className="flex gap-4"
              >
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
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

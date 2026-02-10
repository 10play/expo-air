"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
} from "framer-motion";
import {
  Smartphone,
  Terminal as TerminalIcon,
  Zap,
  GitBranch,
  Copy,
  Check,
} from "lucide-react";
import { Logo } from "./logo";
import { IPhoneFrame } from "./iphone-frame";

const PROMPT_MESSAGE = "what can I do with expo air?";
const TERMINAL_COMMANDS = "npx expo-air init\nnpx expo-air fly";

const features = [
  {
    icon: Smartphone,
    title: "On-Device Widget",
    description:
      "Floating overlay on your iOS device. Tap, type a prompt, watch your code change.",
  },
  {
    icon: TerminalIcon,
    title: "Claude-Powered",
    description:
      "Powered by the Claude Agent SDK. Full agentic coding capabilities from your phone.",
  },
  {
    icon: Zap,
    title: "Real-Time Updates",
    description:
      "Changes appear instantly via Expo Metro hot reload. No manual refresh needed.",
  },
  {
    icon: GitBranch,
    title: "Git Integration",
    description:
      "Monitor git status, view diffs, and track changes directly from the widget.",
  },
];

export function HeroScrollAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [logoTargetY, setLogoTargetY] = useState(-200);
  const [logoFinalScale, setLogoFinalScale] = useState(0.38);
  const [skipMountAnimation, setSkipMountAnimation] = useState(false);
  const [typedChars, setTypedChars] = useState(0);
  const [sent, setSent] = useState(false);
  const [showTypingDots, setShowTypingDots] = useState(false);
  const [headerBlue, setHeaderBlue] = useState(false);
  const [logoDotBlue, setLogoDotBlue] = useState(false);
  const [logoNoShadow, setLogoNoShadow] = useState(false);
  const [phoneWidth, setPhoneWidth] = useState<number | null>(null);
  const [textTopOffset, setTextTopOffset] = useState<number | null>(null);
  const [logoInitialOffset, setLogoInitialOffset] = useState(-150);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Calculate logo target Y position
  useEffect(() => {
    const updateTarget = () => {
      const vh = window.innerHeight;
      const isMobile = window.innerWidth < 768;

      // On mobile, fit the phone by whichever dimension is tighter:
      // max width = viewport - 24px (12px each side)
      // max height = 88% of viewport height
      // Pick the smaller of the two to ensure the frame fits fully.
      const PHONE_ASPECT = 430 / 884; // width / height
      let phoneHeight: number;
      const HEADER_H = 56; // fixed navbar height (h-14)
      if (isMobile) {
        const maxW = window.innerWidth - 24;
        const maxH = (vh - HEADER_H) * 0.92;
        const w = Math.min(maxW, maxH * PHONE_ASPECT);
        setPhoneWidth(w);
        phoneHeight = w / PHONE_ASPECT;
      } else {
        setPhoneWidth(null);
        phoneHeight = Math.min(vh * 0.7, 700);
      }

      const diBottomFromPhoneTop = phoneHeight * (58 / 884);
      const targetOffset = -phoneHeight / 2 + diBottomFromPhoneTop + 5;
      setLogoTargetY(targetOffset);
      setLogoFinalScale(0.38);

      // Center the entire content block (logo + title + subtitle + buttons)
      // in the usable area between the header and the scroll-down arrow.
      // usable = vh - HEADER_H - ARROW_AREA
      // offset = (HEADER_H - ARROW_AREA)/2 + logoHalfH - estContentH/2
      // Since HEADER_H (56) ≈ ARROW_AREA (52), this simplifies to
      // ≈ 34 - estContentH/2, independent of viewport height.
      const ARROW_AREA = 52; // bottom-6 (24px) + arrow svg (28px)
      let logoOffset: number;
      if (isMobile) {
        // Estimated total content block: logo (64px) + gap + title + subtitle + buttons.
        // Varies by width due to text wrapping: narrower screens → more lines.
        const estContentH = window.innerWidth < 375 ? 400 : 330;
        logoOffset = Math.round(
          (HEADER_H - ARROW_AREA) / 2 + 32 - estContentH / 2,
        );
      } else {
        logoOffset = -150;
      }
      setLogoInitialOffset(logoOffset);

      // Position text below the logo with a consistent gap.
      const gap = isMobile ? 12 : 20;
      setTextTopOffset(Math.round(Math.max(0, vh / 2 + logoOffset + 32 + gap)));
    };

    if (window.scrollY > 100) {
      setSkipMountAnimation(true);
    }

    updateTarget();
    window.addEventListener("resize", updateTarget);
    return () => window.removeEventListener("resize", updateTarget);
  }, []);

  // Scroll snap to fixed animation stops using wheel/touch events
  // (wheel/touch only fire on real user input, unlike scroll which fires during smooth-scroll)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Fixed stop points — scroll progress values where the animation pauses.
    // 0.20 = connect device, 0.28 = terminal commands,
    // 0.56 = typing complete, 0.60 = message sent + typing dots
    const STOPS = [0, 0.2, 0.28, 0.56, 0.6, 0.85];

    let snapping = false;
    let rafId = 0;

    const getRange = () => container.offsetHeight - window.innerHeight;

    const getClosestStopIndex = () => {
      const range = getRange();
      if (range <= 0) return 0;
      const progress = (window.scrollY - container.offsetTop) / range;
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < STOPS.length; i++) {
        const dist = Math.abs(progress - STOPS[i]);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      return closest;
    };

    // Custom eased scroll — duration scales with distance so longer steps
    // (like the typing section) get enough time to play the animation.
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const animateScroll = (from: number, to: number, duration: number) => {
      const diff = to - from;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        window.scrollTo(0, from + diff * easeInOutCubic(t));
        if (t < 1) rafId = requestAnimationFrame(step);
        else snapping = false;
      };
      rafId = requestAnimationFrame(step);
    };

    const snapTo = (fromIndex: number, toIndex: number) => {
      const range = getRange();
      if (range <= 0) return;
      cancelAnimationFrame(rafId);
      snapping = true;
      const distance = Math.abs(STOPS[toIndex] - STOPS[fromIndex]);
      // ~5s for a full 0→1 scroll, proportional to distance, min 800ms
      const duration = Math.max(800, distance * 5000);
      const targetY = container.offsetTop + STOPS[toIndex] * range;
      animateScroll(window.scrollY, targetY, duration);
    };

    // --- Wheel (mouse / trackpad) ---
    const onWheel = (e: WheelEvent) => {
      const range = getRange();
      if (range <= 0) return;
      const progress = (window.scrollY - container.offsetTop) / range;

      // Only intercept inside the animation range
      if (progress < -0.05 || progress > 1.02) return;

      e.preventDefault();
      if (snapping) return;

      // Any directional scroll triggers a snap — cooldown prevents repeats
      if (e.deltaY === 0) return;

      const cur = getClosestStopIndex();
      const next = e.deltaY > 0 ? cur + 1 : cur - 1;
      if (next < 0 || next >= STOPS.length) return;

      snapTo(cur, next);
    };

    // --- Touch (mobile swipe) ---
    let touchStartY = 0;

    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const range = getRange();
      if (range <= 0) return;
      const progress = (window.scrollY - container.offsetTop) / range;
      if (progress < -0.05 || progress > 1.02) return;
      e.preventDefault(); // stop native scroll inside animation
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (snapping) return;
      const range = getRange();
      if (range <= 0) return;
      const progress = (window.scrollY - container.offsetTop) / range;
      if (progress < -0.05 || progress > 1.02) return;

      const deltaY = touchStartY - e.changedTouches[0].clientY;
      if (Math.abs(deltaY) < 30) return; // ignore tiny taps

      const cur = getClosestStopIndex();
      const next = deltaY > 0 ? cur + 1 : cur - 1; // swipe up → scroll down
      if (next < 0 || next >= STOPS.length) return;

      snapTo(cur, next);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // =============================================
  // SCROLL TRACKS — 500vh timeline
  // =============================================

  // --- Phase 1: Hero text fades out ---
  const textOpacity = useTransform(scrollYProgress, [0, 0.1], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.1], [0, -80]);
  const buttonsOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);

  // --- Phase 1: iPhone frame rises ---
  // Completes by 0.18 so phone + logo are both docked before connect screen at 0.20
  const iphoneY = useTransform(scrollYProgress, [0.06, 0.18], [600, 0]);
  const iphoneOpacity = useTransform(scrollYProgress, [0.06, 0.12], [0, 1]);
  const iphoneScale = useTransform(scrollYProgress, [0.06, 0.18], [0.85, 1]);

  // --- Phase 1: Logo shrinks to DI ---
  // Completes by 0.18 so it's docked before the connect screen appears
  const logoScale = useTransform(
    scrollYProgress,
    [0.1, 0.18],
    [1, logoFinalScale],
  );
  const logoY = useTransform(
    scrollYProgress,
    [0.1, 0.18],
    [logoInitialOffset, logoTargetY],
  );

  // --- Logo visibility: hidden while widget is open ---
  // Aligned with widgetOpacity: logo stays until widget snaps on at 0.36,
  // and reappears when widget snaps off at 0.66.
  const logoOpacityCalc = useTransform(scrollYProgress, (p) => {
    if (p < 0.36) return 1;
    if (p < 0.375) return 1 - (p - 0.36) / 0.015; // quick hide after widget appears
    if (p < 0.66) return 0; // hidden during widget
    if (p < 0.675) return (p - 0.66) / 0.015; // quick show as widget hides
    return 1;
  });

  // --- Phase 1: Background glow ---
  const glowOpacity = useTransform(scrollYProgress, [0, 0.16], [1, 0]);

  // --- Phase 1b: "Connect device" screen (before terminal) ---
  const connectFadeIn = useTransform(scrollYProgress, [0.16, 0.2], [0, 1]);
  const connectFadeOut = useTransform(scrollYProgress, [0.22, 0.26], [1, 0]);
  const connectOpacity = useTransform(
    [connectFadeIn, connectFadeOut],
    ([a, b]) => Math.min(a as number, b as number),
  );

  // --- Phase 2: Terminal screen (fade in, then out) ---
  const terminalFadeIn = useTransform(scrollYProgress, [0.22, 0.28], [0, 1]);
  const terminalFadeOut = useTransform(scrollYProgress, [0.32, 0.36], [1, 0]);
  const terminalOpacity = useTransform(
    [terminalFadeIn, terminalFadeOut],
    ([a, b]) => Math.min(a as number, b as number),
  );

  // --- Phase 3: Widget morphs from hat via clip-path ---
  // The widget is always full-size; clip-path reveals it from a small pill (hat shape)
  // at the top center, expanding to show the full panel.
  // Collapsed pill: inset(0% 28% 93% 28% round 50px) — small pill at top center
  // Expanded:       inset(0% 0% 0% 0% round 32px)   — full widget panel
  const widgetClip = useTransform(scrollYProgress, (p) => {
    // Lerp helper
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let t: number;
    if (p < 0.34)
      t = 0; // fully collapsed
    else if (p < 0.4)
      t = (p - 0.34) / 0.06; // opening
    else if (p < 0.64)
      t = 1; // fully open
    else if (p < 0.68)
      t = 1 - (p - 0.64) / 0.04; // closing
    else t = 0; // fully collapsed

    // Eased t for smoother feel
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const top = lerp(0, 0, ease); // 0% → 0%
    const lr = lerp(28, 0, ease); // 28% → 0%
    const bottom = lerp(93, 0, ease); // 93% → 0%
    const radius = lerp(50, 32, ease); // pill → panel radius

    return `inset(${top}% ${lr}% ${bottom}% ${lr}% round ${radius}px)`;
  });

  // Widget internal content fades in once the clip is mostly open
  const widgetContentOpacity = useTransform(scrollYProgress, (p) => {
    if (p < 0.37) return 0;
    if (p < 0.4) return (p - 0.37) / 0.03;
    if (p < 0.64) return 1;
    if (p < 0.66) return 1 - (p - 0.64) / 0.02;
    return 0;
  });

  // Widget visibility — delay past collapsed-pill state to avoid iOS Safari
  // clip-path artifact (shadow around tiny pill). Show only once clip has opened enough.
  const widgetOpacity = useTransform(scrollYProgress, (p) => {
    if (p < 0.36) return 0; // hidden while clip is still a small pill
    if (p < 0.365) return 1; // snap on once clip is ~1/3 open
    if (p < 0.66) return 1;
    if (p < 0.665) return 0; // snap off before clip collapses back to pill
    return 0;
  });

  // --- Phase 3a: Typing animation ---
  const typingProgress = useTransform(scrollYProgress, [0.4, 0.56], [0, 1]);
  useMotionValueEvent(typingProgress, "change", (v) => {
    setTypedChars(Math.floor(v * PROMPT_MESSAGE.length));
  });

  // --- Phase 3b: Send + 3-dot + header blue ---
  const sendProgress = useTransform(scrollYProgress, [0.56, 0.6], [0, 1]);
  useMotionValueEvent(sendProgress, "change", (v) => {
    const isSent = v > 0.5;
    setSent(isSent);
    setShowTypingDots(isSent);
    setHeaderBlue(isSent);
  });

  // --- Phase 3c: Logo shadow removal as it docks onto Dynamic Island ---
  const logoShadowProgress = useTransform(
    scrollYProgress,
    [0.12, 0.16],
    [0, 1],
  );
  useMotionValueEvent(logoShadowProgress, "change", (v) => {
    setLogoNoShadow(v > 0.5);
  });

  // --- Phase 4: Logo returns with blue dot ---
  const logoDotProgress = useTransform(scrollYProgress, [0.68, 0.88], [0, 1]);
  useMotionValueEvent(logoDotProgress, "change", (v) => {
    // Blue while building (v < ~0.85 of the range), green when done
    setLogoDotBlue(v > 0 && v < 0.85);
  });

  // --- Phase 5: Features build progressively ---
  const featuresOpacity = useTransform(scrollYProgress, [0.7, 0.74], [0, 1]);
  // Individual card reveals (staggered)
  const card1Opacity = useTransform(scrollYProgress, [0.72, 0.76], [0, 1]);
  const card2Opacity = useTransform(scrollYProgress, [0.75, 0.79], [0, 1]);
  const card3Opacity = useTransform(scrollYProgress, [0.78, 0.82], [0, 1]);
  const card4Opacity = useTransform(scrollYProgress, [0.81, 0.85], [0, 1]);
  const cardOpacities = [
    card1Opacity,
    card2Opacity,
    card3Opacity,
    card4Opacity,
  ];

  // Card Y offsets (slide up as they appear)
  const card1Y = useTransform(scrollYProgress, [0.72, 0.76], [20, 0]);
  const card2Y = useTransform(scrollYProgress, [0.75, 0.79], [20, 0]);
  const card3Y = useTransform(scrollYProgress, [0.78, 0.82], [20, 0]);
  const card4Y = useTransform(scrollYProgress, [0.81, 0.85], [20, 0]);
  const cardYs = [card1Y, card2Y, card3Y, card4Y];

  const mountInitial = skipMountAnimation ? false : { opacity: 0, y: 20 };
  const mountAnimate = { opacity: 1, y: 0 };

  const displayedText = PROMPT_MESSAGE.slice(0, typedChars);
  const showCursor = typedChars > 0 && !sent;

  return (
    <section ref={containerRef} className="relative h-[500vh]">
      <div
        className="sticky top-0 h-screen overflow-hidden"
        style={{ height: "100svh" }}
      >
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
          <div className="relative">
            <IPhoneFrame
              className="h-auto md:h-[70vh] md:max-h-[700px] md:w-auto"
              style={phoneWidth != null ? { width: phoneWidth } : undefined}
            />

            {/* ===== Screen 0: Connect device ===== */}
            <motion.div
              style={{ opacity: connectOpacity }}
              className="absolute inset-x-[8%] inset-y-[8%] flex flex-col items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3 md:gap-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2F2F7] md:h-16 md:w-16">
                  <Smartphone className="h-6 w-6 text-[#4CD964] md:h-8 md:w-8" />
                </div>
                <h2 className="text-center text-sm font-bold text-black md:text-xl">
                  Connect your device
                </h2>
                <p className="max-w-[200px] text-center text-[10px] leading-snug text-gray-500 md:max-w-[280px] md:text-sm">
                  Plug your iPhone into your computer to get started.
                </p>
              </div>
            </motion.div>

            {/* ===== Lightning cable: plugs into bottom of phone ===== */}
            <motion.div
              style={{ opacity: connectOpacity }}
              className="absolute -bottom-[120px] left-1/2 -translate-x-1/2 md:-bottom-[200px]"
            >
              <svg
                viewBox="0 0 30 160"
                fill="none"
                className="h-[120px] w-[30px] md:h-[200px] md:w-[36px]"
                preserveAspectRatio="xMidYMin meet"
              >
                {/* Lightning connector — metal tip */}
                <rect x="8" y="0" width="14" height="8" rx="2" fill="#b8b8b8" />
                <rect
                  x="8.5"
                  y="0.5"
                  width="13"
                  height="7"
                  rx="1.5"
                  fill="#d4d4d4"
                />
                {/* Metal pin dots */}
                <rect
                  x="11"
                  y="2"
                  width="1.5"
                  height="4"
                  rx="0.5"
                  fill="#a0a0a0"
                />
                <rect
                  x="14.25"
                  y="2"
                  width="1.5"
                  height="4"
                  rx="0.5"
                  fill="#a0a0a0"
                />
                <rect
                  x="17.5"
                  y="2"
                  width="1.5"
                  height="4"
                  rx="0.5"
                  fill="#a0a0a0"
                />
                {/* Connector body — white plastic housing */}
                <rect
                  x="5"
                  y="8"
                  width="20"
                  height="22"
                  rx="4"
                  fill="#e8e8e8"
                />
                <rect
                  x="5.5"
                  y="8.5"
                  width="19"
                  height="21"
                  rx="3.5"
                  fill="#f5f5f5"
                />
                {/* Strain relief — tapered section */}
                <path
                  d="M9 30 Q9 38 11 44 L19 44 Q21 38 21 30"
                  fill="#f0f0f0"
                />
                {/* Cable — white rubber */}
                <line
                  x1="15"
                  y1="44"
                  x2="15"
                  y2="160"
                  stroke="#e0e0e0"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                {/* Cable highlight — subtle shine */}
                <line
                  x1="13.5"
                  y1="44"
                  x2="13.5"
                  y2="160"
                  stroke="#f5f5f5"
                  strokeWidth="1.5"
                />
              </svg>
            </motion.div>

            {/* ===== Screen 1: Terminal (vertically centered) ===== */}
            <motion.div
              style={{ opacity: terminalOpacity }}
              className="absolute inset-x-[8%] inset-y-[8%] flex flex-col items-center justify-center"
            >
              <div className="w-full">
                <h2 className="mb-1 text-center text-sm font-bold text-black md:mb-2 md:text-xl">
                  Get started in minutes
                </h2>
                <p className="mb-2 text-center text-[10px] text-gray-500 md:mb-4 md:text-sm">
                  Two commands. That&apos;s all it takes.
                </p>
                <div className="overflow-hidden rounded-lg border border-fd-border bg-fd-card text-left">
                  <div className="flex items-center gap-1.5 border-b border-fd-border px-3 py-2">
                    <div className="h-2 w-2 rounded-full bg-[#FF5F57]" />
                    <div className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
                    <div className="h-2 w-2 rounded-full bg-[#28C840]" />
                    <span className="ml-1.5 text-[10px] text-fd-muted-foreground md:text-xs">
                      Terminal
                    </span>
                  </div>
                  <pre className="select-text p-3 text-[10px] leading-relaxed md:p-4 md:text-sm">
                    <code>
                      <span className="text-fd-muted-foreground">$</span>{" "}
                      <span className="text-fd-primary">npx expo-air</span> init
                      {"\n"}
                      <span className="text-fd-muted-foreground">$</span>{" "}
                      <span className="text-fd-primary">npx expo-air</span> fly
                    </code>
                  </pre>
                </div>
              </div>
            </motion.div>

            {/* ===== Screen 2: Widget (expo-air replica) ===== */}
            <motion.div
              style={{
                opacity: widgetOpacity,
                clipPath: widgetClip,
                WebkitBackfaceVisibility: "hidden" as const,
                top: "8%",
                left: "6%",
                right: "6%",
                bottom: "6%",
              }}
              className="absolute flex flex-col overflow-hidden"
            >
              <div className="flex h-full flex-col rounded-[20px] bg-black md:rounded-[32px]">
                <motion.div
                  className="flex h-full flex-col"
                  style={{ opacity: widgetContentOpacity }}
                >
                  {/* Header */}
                  <div className="flex items-center px-4 py-3 md:px-5 md:py-4">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(255,255,255,0.15)] md:h-[30px] md:w-[30px]">
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 10 10"
                        fill="none"
                        className="md:h-[10px] md:w-[10px]"
                      >
                        <path
                          d="M1 1L9 9M9 1L1 9"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <span className="ml-2 flex-1 truncate text-[9px] font-medium text-white md:text-[13px]">
                      my-app/main
                    </span>
                    {/* Status dot — changes green → blue with glow */}
                    <div
                      className={`h-2 w-2 rounded-full transition-colors duration-300${headerBlue ? " status-dot-glow" : ""}`}
                      style={{
                        backgroundColor: headerBlue ? "#007AFF" : "#30D158",
                      }}
                    />
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center border-b border-[rgba(255,255,255,0.08)] px-4 md:px-5">
                    <span className="border-b-2 border-white pb-1.5 text-[10px] font-semibold text-white md:pb-2 md:text-[14px]">
                      Chat
                    </span>
                    <span className="ml-3 pb-1.5 text-[10px] text-[rgba(255,255,255,0.6)] md:ml-4 md:pb-2 md:text-[14px]">
                      Changes
                    </span>
                    <div className="flex-1" />
                    <span className="mb-1 rounded-full bg-[rgba(255,255,255,0.15)] px-2 py-0.5 text-[9px] font-medium text-white md:px-3 md:py-1 md:text-[13px]">
                      New
                    </span>
                  </div>

                  {/* Chat body */}
                  <div className="flex flex-1 flex-col items-center justify-center px-4 md:px-5">
                    {!sent ? (
                      <p className="text-center text-[9px] text-[rgba(255,255,255,0.4)] md:text-[14px]">
                        Send a prompt to start coding with Claude
                      </p>
                    ) : (
                      <div className="flex w-full flex-col gap-2 md:gap-3">
                        {/* User message bubble */}
                        <div className="self-end rounded-2xl bg-[#007AFF] px-3 py-1.5 md:px-4 md:py-2">
                          <p className="text-[9px] text-white md:text-[14px]">
                            {PROMPT_MESSAGE}
                          </p>
                        </div>
                        {/* 3-dot typing indicator */}
                        {showTypingDots && (
                          <div className="flex items-center gap-1 self-start rounded-2xl bg-[rgba(255,255,255,0.08)] px-3 py-2 md:px-4 md:py-2.5">
                            <div className="typing-dot-1 h-1.5 w-1.5 rounded-full bg-[#007AFF]" />
                            <div className="typing-dot-2 h-1.5 w-1.5 rounded-full bg-[#007AFF]" />
                            <div className="typing-dot-3 h-1.5 w-1.5 rounded-full bg-[#007AFF]" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Input footer */}
                  <div className="flex items-center gap-1.5 px-4 py-3 md:gap-2 md:px-5 md:py-4">
                    <div className="flex h-5 w-5 items-center justify-center md:h-7 md:w-7">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="md:h-4 md:w-4"
                      >
                        <path
                          d="M8 1V15M1 8H15"
                          stroke="rgba(255,255,255,0.6)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 rounded-full bg-[rgba(255,255,255,0.1)] px-3 py-1 md:px-4 md:py-1.5">
                      {!sent && displayedText ? (
                        <p className="text-[9px] text-white md:text-[14px]">
                          {displayedText}
                          {showCursor && (
                            <span className="ml-px inline-block h-[10px] w-[1px] animate-pulse bg-white align-middle md:h-[14px]" />
                          )}
                        </p>
                      ) : (
                        <p className="text-[9px] text-[rgba(255,255,255,0.4)] md:text-[14px]">
                          Ask Claude...
                        </p>
                      )}
                    </div>
                    <div
                      className="flex h-5 w-5 items-center justify-center rounded-full md:h-7 md:w-7"
                      style={{
                        backgroundColor:
                          displayedText && !sent
                            ? "#007AFF"
                            : "rgba(255,255,255,0.15)",
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="md:h-3.5 md:w-3.5"
                      >
                        <path
                          d="M8 14V2M8 2L3 7M8 2L13 7"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>

            {/* ===== Screen 3: Features (builds progressively) ===== */}
            <motion.div
              style={{
                opacity: featuresOpacity,
                top: "8%",
                left: "6%",
                right: "6%",
                bottom: "6%",
              }}
              className="absolute flex flex-col overflow-hidden rounded-[20px] bg-white md:rounded-[32px]"
            >
              <div className="flex h-full flex-col px-3 py-4 md:px-5 md:py-6">
                <h2 className="mb-2 text-center text-[10px] font-bold text-black md:mb-4 md:text-base">
                  Everything you need to vibe code on mobile
                </h2>
                <div className="grid flex-1 grid-cols-2 gap-1.5 md:gap-2">
                  {features.map((feature, i) => (
                    <motion.div
                      key={feature.title}
                      style={{ opacity: cardOpacities[i], y: cardYs[i] }}
                      className="flex flex-col rounded-lg border border-gray-200 p-2 md:rounded-xl md:p-3"
                    >
                      <feature.icon className="mb-1 h-3 w-3 text-[#4CD964] md:mb-2 md:h-5 md:w-5" />
                      <h3 className="text-[8px] font-semibold text-black md:text-xs">
                        {feature.title}
                      </h3>
                      <p className="mt-0.5 text-[7px] leading-tight text-gray-500 md:text-[10px]">
                        {feature.description}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Logo layer — absolute centered, offset above center */}
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <motion.div
            initial={skipMountAnimation ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              style={{ scale: logoScale, y: logoY, opacity: logoOpacityCalc }}
            >
              <Logo
                className={`h-16 w-auto${logoNoShadow ? " no-border" : ""}`}
                animated
                dotColor={logoDotBlue ? "#007AFF" : undefined}
                style={
                  logoNoShadow
                    ? { filter: "drop-shadow(0 0 0 transparent)" }
                    : undefined
                }
              />
            </motion.div>
          </motion.div>
        </div>

        {/* Text layer — positioned below logo, not centered, so gap is
             consistent regardless of title line count */}
        <div
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center"
          style={{
            paddingTop:
              textTopOffset != null
                ? `${textTopOffset}px`
                : "calc(50vh - 98px)",
          }}
        >
          <motion.div
            initial={mountInitial}
            animate={mountAnimate}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <motion.div
              style={{ opacity: textOpacity, y: textY }}
              className="flex flex-col items-center px-6 text-center"
            >
              <h1 className="mb-2 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl md:mb-4 md:text-6xl">
                Vibing everywhere with{" "}
                <span className="bg-gradient-to-r from-[#4CD964] to-[#4ade80] bg-clip-text text-transparent">
                  expo
                </span>
              </h1>

              <p className="mb-4 max-w-xl text-lg text-fd-muted-foreground md:mb-8">
                Keep working on your app everywhere, send prompts to your AI
                tool while on the go, test in real time, commit and create a pr.
              </p>

              <motion.div
                style={{ opacity: buttonsOpacity }}
                className="pointer-events-auto flex gap-4"
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
        {/* Scroll-down arrow */}
        <motion.div
          style={{ opacity: buttonsOpacity, bottom: "calc(4svh + 30px)" }}
          className="absolute left-1/2 z-30 -translate-x-1/2"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="scroll-arrow flex flex-col items-center gap-0.5"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              className="text-fd-foreground/40"
            >
              <path
                d="M7 10L12 15L17 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    mermaid.render('mermaid-' + Math.random().toString(36).slice(2), chart).then(({ svg }) => {
      setSvg(svg);
    });
  }, [chart]);

  // chart content comes from static MDX files at build time, not user input
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: svg }} />;
}

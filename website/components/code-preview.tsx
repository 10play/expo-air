'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const commands = 'npx expo-air init\nnpx expo-air fly';

export function CodePreview() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(commands).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="border-t border-fd-border px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="mb-4 text-3xl font-bold">Get started in minutes</h2>
        <p className="mb-8 text-fd-muted-foreground">
          Two commands. That&apos;s all it takes.
        </p>
        <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card text-left">
          <div className="flex items-center gap-2 border-b border-fd-border px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <div className="h-3 w-3 rounded-full bg-[#28C840]" />
            <span className="ml-2 text-sm text-fd-muted-foreground">
              Terminal
            </span>
            <button
              onClick={handleCopy}
              className="ml-auto rounded-md p-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
              aria-label="Copy commands"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <pre className="p-6 text-sm leading-relaxed">
            <code>
              <span className="text-fd-muted-foreground">$</span>{' '}
              <span className="text-fd-primary">npx expo-air</span> init{'\n'}
              <span className="text-fd-muted-foreground">$</span>{' '}
              <span className="text-fd-primary">npx expo-air</span> fly
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

import { Smartphone, Terminal, GitBranch, Zap } from 'lucide-react';

const features = [
  {
    icon: Smartphone,
    title: 'On-Device Widget',
    description:
      'Floating overlay on your iOS device. Tap, type a prompt, watch your code change.',
  },
  {
    icon: Terminal,
    title: 'Claude-Powered',
    description:
      'Powered by the Claude Agent SDK. Full agentic coding capabilities from your phone.',
  },
  {
    icon: Zap,
    title: 'Real-Time Updates',
    description:
      'Changes appear instantly via Expo Metro hot reload. No manual refresh needed.',
  },
  {
    icon: GitBranch,
    title: 'Git Integration',
    description:
      'Monitor git status, view diffs, and track changes directly from the widget.',
  },
];

export function Features() {
  return (
    <section className="border-t border-fd-border px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Everything you need to vibe code on mobile
        </h2>
        <div className="grid gap-8 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-primary/30"
            >
              <feature.icon className="mb-4 h-8 w-8 text-fd-primary" />
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-fd-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

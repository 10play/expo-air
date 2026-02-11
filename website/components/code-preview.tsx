export function CodePreview() {
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
          </div>
          <pre className="p-6 text-sm leading-relaxed">
            <code>
              <span className="text-fd-muted-foreground">$</span>{' '}
              <span className="text-fd-primary">npx expo-air@latest</span> init{'\n'}
              <span className="text-fd-muted-foreground">$</span>{' '}
              <span className="text-fd-primary">npx expo-air@latest</span> fly
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

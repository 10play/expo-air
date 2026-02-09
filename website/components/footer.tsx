export function Footer() {
  return (
    <footer className="flex items-center justify-center gap-1 border-t border-fd-border py-6 text-sm text-fd-muted-foreground">
      Built with ❤️ by{' '}
      <a
        href="https://10play.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-fd-foreground transition-colors hover:text-fd-primary"
      >
        10play
      </a>
    </footer>
  );
}

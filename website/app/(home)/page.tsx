import { Hero } from '@/components/hero';
import { Features } from '@/components/features';
import { CodePreview } from '@/components/code-preview';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <CodePreview />
      <Features />
    </main>
  );
}

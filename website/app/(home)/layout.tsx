import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { Footer } from '@/components/footer';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions}>
      {children}
      <Footer />
    </HomeLayout>
  );
}

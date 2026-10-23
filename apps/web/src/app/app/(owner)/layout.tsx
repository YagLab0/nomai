import { OwnerShell } from '@/components/owners/owner-shell';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <OwnerShell>{children}</OwnerShell>;
}

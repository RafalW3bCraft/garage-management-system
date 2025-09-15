import { Logo } from '../Logo';

export default function LogoExample() {
  return (
    <div className="p-4 space-y-4">
      <Logo size="sm" />
      <Logo size="md" />
      <Logo size="lg" />
    </div>
  );
}
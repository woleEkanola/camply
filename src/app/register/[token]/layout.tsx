import Image from "next/image";
import Link from "next/link";

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 font-sans">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Home">
          <Image src="/logo.png" alt="" width={32} height={32} />
        </Link>
      </header>
      <main>{children}</main>
    </div>
  );
}

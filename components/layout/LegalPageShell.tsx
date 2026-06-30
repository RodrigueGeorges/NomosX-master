"use client";

import { useState } from "react";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { useRouter } from "next/navigation";

interface LegalPageShellProps {
  children: React.ReactNode;
}

export function LegalPageShell({ children }: LegalPageShellProps) {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <PublicPageShell onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <div className="max-w-3xl mx-auto px-6 sm:px-8 py-16 sm:py-24">{children}</div>
      </PublicPageShell>
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => {
            setShowAuthModal(false);
            router.push("/dashboard");
          }}
        />
      )}
    </>
  );
}

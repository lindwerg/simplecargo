"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

/**
 * Sign-out control. Invalidates the session then bounces to /login.
 * Shared by the desktop SideRail and the mobile top bar.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const handleSignOut = React.useCallback(async () => {
    setPending(true);
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } catch {
      // Re-enable the control so the operator can retry; never strand them signed-in.
      setPending(false);
    }
  }, [router]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleSignOut}
      disabled={pending}
      aria-label="Выйти"
      title="Выйти"
    >
      <LogOut aria-hidden />
    </Button>
  );
}

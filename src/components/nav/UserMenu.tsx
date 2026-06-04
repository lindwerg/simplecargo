"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface UserMenuProps {
  email: string;
}

/**
 * Right-side header cluster: the signed-in operator's email, theme toggle, and sign-out.
 * Client Component — sign-out invalidates the session then bounces to /login.
 */
export function UserMenu({ email }: UserMenuProps) {
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
    <div className="flex items-center gap-2">
      <span
        className="hidden max-w-[20ch] truncate text-sm text-text-secondary lg:inline"
        title={email}
      >
        {email}
      </span>
      <ThemeToggle />
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
    </div>
  );
}

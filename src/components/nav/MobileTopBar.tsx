import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandMark } from "@/components/nav/BrandMark";
import { SignOutButton } from "@/components/nav/SignOutButton";

/**
 * Slim mobile-only top bar (<768): brand on the left, theme toggle + sign-out on the right.
 * Primary navigation lives in the floating BottomBar; this carries the account controls.
 */
export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-1/95 backdrop-blur-md md:hidden">
      <div className="flex h-12 items-center justify-between px-[var(--space-gutter)]">
        <BrandMark withWordmark />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

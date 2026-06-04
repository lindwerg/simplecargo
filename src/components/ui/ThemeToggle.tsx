"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

type Theme = "dark" | "light";

const THEME_COOKIE = "theme";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCurrentTheme(): Theme {
  // The server already set data-theme from the cookie; mirror it on mount.
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Theme toggle. Flips `data-theme` on <html> synchronously (sub-16ms, a single
 * attribute write — no reflow) and persists the choice to a cookie the server
 * reads on the next render, so returning users get the right theme with no FOUC.
 */
export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("dark");

  React.useEffect(() => {
    setTheme(readCurrentTheme());
  }, []);

  const toggle = React.useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    setTheme(next);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Светлая тема" : "Тёмная тема"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
    >
      {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}

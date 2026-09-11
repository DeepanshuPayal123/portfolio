export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "theme";
/** <meta name="theme-color"> per theme, matching --paper. */
export const THEME_COLORS: Record<Theme, string> = {
  dark: "#071426",
  light: "#f4f1e8",
};

/** Dark blueprint unless the visitor chose light before. Mirrored by the inline script in Base.astro. */
export function resolveInitialTheme(stored: string | null): Theme {
  return stored === "light" ? "light" : "dark";
}

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function currentTheme(): Theme {
  return resolveInitialTheme(document.documentElement.dataset.theme ?? null);
}

function paint(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
}

/** Applies and remembers a theme; with View Transitions the new one grows as a circle from `origin`. */
export function setTheme(theme: Theme, origin?: { x: number; y: number }) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked (private mode, site-data settings); the theme still applies for this visit.
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (
    typeof document.startViewTransition !== "function" ||
    reduced ||
    !origin
  ) {
    paint(theme);
    return;
  }

  const transition = document.startViewTransition(() => paint(theme));
  transition.ready.then(() => {
    const radius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${origin.x}px ${origin.y}px)`,
          `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
        ],
      },
      {
        duration: 550,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  });
}

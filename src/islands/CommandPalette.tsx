import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { site } from "@/data/site";
import {
  ACTIONS,
  filterActions,
  type PaletteAction,
} from "@/lib/palette/actions";
import { currentTheme, nextTheme, setTheme } from "@/lib/theme";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listId = useId();
  const results = useMemo(() => filterActions(ACTIONS, query), [query]);

  const show = useCallback((returnTo?: HTMLElement) => {
    // Safari doesn't focus a clicked button, so the trigger passes itself in.
    returnFocus.current =
      returnTo ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  const hide = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => returnFocus.current?.focus());
  }, []);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) hide();
        else show();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, show, hide]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const run = (action: PaletteAction) => {
    hide(action.id !== "open-terminal");

    if (action.href?.startsWith("#")) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      document.querySelector(action.href)?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
      return;
    }
    if (action.href) {
      window.open(action.href, "_blank", "noopener,noreferrer");
      return;
    }
    switch (action.id) {
      case "copy-email":
        navigator.clipboard.writeText(site.email).then(
          () => setToast(`Copied ${site.email}`),
          () => setToast(site.email),
        );
        break;
      case "toggle-theme":
        setTheme(nextTheme(currentTheme()));
        break;
      case "open-terminal":
        window.dispatchEvent(
          new CustomEvent("terminal:open", {
            detail: { returnTo: returnFocus.current },
          }),
        );
        break;
    }
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const action = results[active];
      if (action) run(action);
    } else if (e.key === "Escape") {
      e.preventDefault();
      hide();
    } else if (e.key === "Tab") {
      // The input is the only focus stop inside the dialog.
      e.preventDefault();
    }
  };

  const optionId = (action: PaletteAction) => `${listId}-${action.id}`;

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <button
          type="button"
          onClick={(e) => show(e.currentTarget)}
          aria-label="Open command palette"
          aria-haspopup="dialog"
          className="inline-flex h-9 items-center gap-2 border border-line px-2.5 font-mono text-xs text-dim transition-colors hover:border-accent hover:text-accent"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z" />
          </svg>
          <span className="hidden sm:inline">K</span>
        </button>

        <AnimatePresence>
          {open && (
            <m.div
              key="backdrop"
              className="fixed inset-0 z-50 flex items-start justify-center bg-paper/70 px-4 pt-[12vh] backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) hide();
              }}
            >
              <m.div
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                className="frame w-full max-w-lg shadow-2xl"
                initial={{ y: -8, scale: 0.98 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: -8, scale: 0.98 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-center gap-3 border-b border-line px-4">
                  <span className="font-mono text-accent" aria-hidden="true">
                    ›
                  </span>
                  <input
                    ref={inputRef}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                      results[active] ? optionId(results[active]) : undefined
                    }
                    aria-label="Search commands"
                    placeholder="Type a command or search…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onInputKeyDown}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-12 w-full bg-transparent font-mono text-sm text-ink outline-none placeholder:text-dim"
                  />
                  <kbd className="chip">esc</kbd>
                </div>

                <ul
                  id={listId}
                  role="listbox"
                  aria-label="Commands"
                  className="max-h-80 overflow-y-auto p-2"
                >
                  {results.map((action, i) => (
                    <li
                      key={action.id}
                      id={optionId(action)}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(action)}
                      className={`flex cursor-pointer items-center justify-between gap-4 px-3 py-2.5 text-sm ${
                        i === active ? "bg-accent/10 text-accent" : "text-ink"
                      }`}
                    >
                      <span>{action.title}</span>
                      <span className="mono-label truncate">
                        {action.hint ?? action.group}
                      </span>
                    </li>
                  ))}
                </ul>
                {results.length === 0 && (
                  <p className="px-4 pb-6 text-center font-mono text-sm text-dim">
                    No matches
                  </p>
                )}
              </m.div>
            </m.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <m.p
              key="toast"
              role="status"
              className="frame fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4 py-2 font-mono text-sm text-accent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {toast}
            </m.p>
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}

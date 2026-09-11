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
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { runCommand, type Line } from "@/lib/terminal/commands";
import { currentTheme, nextTheme, setTheme } from "@/lib/theme";

interface Entry {
  id: number;
  input?: string;
  lines: Line[];
}

const WELCOME: Entry = {
  id: 0,
  lines: [
    {
      text: "deepanshu@portfolio — type 'help' to see what's here.",
      tone: "dim",
    },
  ],
};

const TONE: Record<NonNullable<Line["tone"]>, string> = {
  dim: "text-dim",
  accent: "text-accent",
  err: "text-err",
};

function isTextField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export default function Terminal() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([WELCOME]);
  const [value, setValue] = useState("");
  const history = useRef<string[]>([]);
  const historyCursor = useRef(-1);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const show = useCallback((returnTo?: HTMLElement | null) => {
    const active =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    returnFocus.current = returnTo ?? active;
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (open || e.metaKey || e.ctrlKey || e.altKey || isTextField(e.target))
        return;
      if (e.key === "~" || e.key === "`") {
        e.preventDefault();
        show();
      }
    };
    const onOpen = (e: Event) =>
      show(
        (e as CustomEvent<{ returnTo?: HTMLElement | null }>).detail?.returnTo,
      );
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("terminal:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("terminal:open", onOpen);
    };
  }, [open, show]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [entries]);

  const submit = () => {
    const input = value;
    setValue("");
    historyCursor.current = -1;
    if (input.trim()) history.current.unshift(input);

    const { lines, effect } = runCommand(input);
    if (effect?.kind === "clear") {
      setEntries([]);
      return;
    }
    setEntries((prev) => [...prev, { id: nextId.current++, input, lines }]);

    if (effect?.kind === "exit") hide();
    else if (effect?.kind === "theme") setTheme(nextTheme(currentTheme()));
    else if (effect?.kind === "open") {
      if (effect.url.startsWith("mailto:")) window.location.href = effect.url;
      else window.open(effect.url, "_blank", "noopener,noreferrer");
    }
  };

  const recall = (step: 1 | -1) => {
    const next = Math.min(
      Math.max(historyCursor.current + step, -1),
      history.current.length - 1,
    );
    historyCursor.current = next;
    setValue(next === -1 ? "" : (history.current[next] ?? ""));
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      hide();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      recall(e.key === "ArrowUp" ? 1 : -1);
    } else if (e.key === "Tab") {
      e.preventDefault();
    } else if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      setEntries([]);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {open && (
            <m.div
              key="backdrop"
              className="fixed inset-0 z-50 flex items-end justify-center bg-paper/70 p-4 backdrop-blur-sm sm:items-center"
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
                aria-label="Terminal"
                className="frame flex h-[min(70vh,32rem)] w-full max-w-2xl flex-col font-mono text-sm shadow-2xl"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 16, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <span className="mono-label">deepanshu@portfolio: ~</span>
                  <button
                    type="button"
                    onClick={hide}
                    aria-label="Close terminal"
                    className="mono-label hover:text-accent"
                  >
                    esc
                  </button>
                </div>

                <div
                  ref={logRef}
                  role="log"
                  aria-live="polite"
                  className="flex-1 space-y-1 overflow-y-auto px-4 py-3"
                  onClick={() => inputRef.current?.focus()}
                >
                  {entries.map((entry) => (
                    <div key={entry.id}>
                      {entry.input !== undefined && (
                        <p>
                          <span className="text-accent">$</span> {entry.input}
                        </p>
                      )}
                      {entry.lines.map((line, i) => (
                        <p
                          key={i}
                          className={`break-words whitespace-pre-wrap ${line.tone ? TONE[line.tone] : "text-ink"}`}
                        >
                          {line.text}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>

                <label className="flex items-center gap-2 border-t border-line px-4 py-3">
                  <span className="text-accent" aria-hidden="true">
                    $
                  </span>
                  <span className="sr-only">Terminal command</span>
                  <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={onInputKeyDown}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="w-full bg-transparent text-ink outline-none"
                  />
                </label>
              </m.div>
            </m.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}

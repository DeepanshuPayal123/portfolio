import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  MESSAGE_MAX,
  validate,
  type Field,
  type Submission,
} from "@/lib/contact";

type Status = "idle" | "sending" | "sent" | "error";

const EMPTY: Submission = { name: "", contact: "", message: "" };

export default function ContactForm({ email }: { email: string }) {
  const [values, setValues] = useState<Submission>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  // Until React is attached, pressing the button would submit the form natively and lose
  // what the visitor typed, so the button stays disabled until then.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);


  const update =
    (field: Field) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      if (errors[field]) setErrors(({ [field]: _, ...rest }) => rest);
    };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validate(values);
    setErrors(result.errors);
    if (!result.ok) return;

    setStatus("sending");
    const ref = new URLSearchParams(window.location.search).get("ref");
    try {
      const response = await fetch(
        `/api/contact${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...values, company: honeypot }),
        },
      );
      if (!response.ok) throw new Error(String(response.status));
      setStatus("sent");
      setValues(EMPTY);
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <p
        role="status"
        className="mt-10 rounded-xl border border-accent/40 bg-accent/10 p-5 text-base"
      >
        Thanks — your message just landed on my phone. I'll reply to the address
        you left.
      </p>
    );
  }

  const field = (name: Field, label: string, hint?: string) => {
    const invalid = Boolean(errors[name]);
    const common = {
      id: `contact-${name}`,
      name,
      value: values[name],
      onChange: update(name),
      "aria-invalid": invalid,
      "aria-describedby": invalid ? `contact-${name}-error` : undefined,
      className: `mt-2 w-full rounded-xl border bg-paper/60 px-4 py-3 text-base outline-none transition focus-visible:border-accent ${
        invalid ? "border-err" : "border-line"
      }`,
    };
    return (
      <div>
        <label htmlFor={`contact-${name}`} className="mono-label">
          {label}
        </label>
        {name === "message" ? (
          <textarea
            {...common}
            rows={4}
            maxLength={MESSAGE_MAX}
            placeholder={hint}
          />
        ) : (
          <input
            {...common}
            type="text"
            autoComplete={name === "name" ? "name" : "email"}
            placeholder={hint}
          />
        )}
        {invalid && (
          <p id={`contact-${name}-error`} className="mt-2 text-sm text-err">
            {errors[name]}
          </p>
        )}
      </div>
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-10 grid gap-5 border-t border-line pt-8"
    >
      <p className="text-base text-dim">
        Or leave a message here — it reaches my phone straight away.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        {field("name", "Name", "Rahul Verma")}
        {field("contact", "Email or phone", "rahul@company.com")}
      </div>
      {field(
        "message",
        "Message",
        "What role, and what would you like to know?",
      )}

      <input
        type="text"
        name="company"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        hidden
      />

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!ready || status === "sending"}
        >
          {status === "sending" ? "Sending…" : "Send message"}
        </button>
        <p className="text-sm text-dim">
          Goes to me only. Nothing is stored on the site.
        </p>
      </div>

      {status === "error" && (
        <p role="alert" className="text-sm text-err">
          Could not send that. Please email me at{" "}
          <a href={`mailto:${email}`} className="underline">
            {email}
          </a>
          .
        </p>
      )}
    </form>
  );
}

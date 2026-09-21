// Shared by the form in the browser and the endpoint on the edge, so both agree on what
// counts as a valid message and on how it reads in Telegram.

export interface Submission {
  name: string;
  contact: string;
  message: string;
}

export type Field = keyof Submission;

export interface Validation {
  ok: boolean;
  errors: Partial<Record<Field, string>>;
}

export const MESSAGE_MAX = 2000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?\d[\d\s-]{6,17}\d$/;

export function validate(input: Partial<Submission>): Validation {
  const name = (input.name ?? "").trim();
  const contact = (input.contact ?? "").trim();
  const message = (input.message ?? "").trim();
  const errors: Partial<Record<Field, string>> = {};

  if (name.length < 2) errors.name = "Tell me your name.";
  else if (name.length > 80) errors.name = "That name is too long.";

  const digits = contact.replace(/\D/g, "");
  const isPhone =
    PHONE.test(contact) && digits.length >= 8 && digits.length <= 15;
  if (!EMAIL.test(contact) && !isPhone) {
    errors.contact = "Leave an email or a phone number I can reply to.";
  }

  if (message.length < 10) errors.message = "A sentence longer, please.";
  else if (message.length > MESSAGE_MAX)
    errors.message = `Too long — keep it under ${MESSAGE_MAX} characters.`;

  return { ok: Object.keys(errors).length === 0, errors };
}

export interface Meta {
  /** The ?ref= the visitor arrived with, so I know which application this is about. */
  ref?: string | null;
  country?: string | null;
  at: Date;
}

export function formatMessage(submission: Submission, meta: Meta): string {
  const when = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(meta.at);

  const lines = [
    "📬 New message from your portfolio",
    "",
    `From:     ${submission.name.trim()}`,
    `Reply to: ${submission.contact.trim()}`,
  ];
  if (meta.ref) lines.push(`Link:     ?ref=${meta.ref}`);
  if (meta.country) lines.push(`Country:  ${meta.country}`);
  lines.push(`When:     ${when} IST`, "", submission.message.trim());
  return lines.join("\n");
}

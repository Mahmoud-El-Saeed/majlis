import type { ReactNode } from "react";

/** Shared RTL UI primitives (architecture §4 components/). Styling lives in styles.css. */

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="majlis-page">
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export function TextField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      {label}
      <input {...props} />
    </label>
  );
}

export function Notice({ message }: { message: string }) {
  if (!message) return null;
  return <p className="notice">{message}</p>;
}

export function TextArea({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="field">
      {label}
      <textarea {...props} rows={6} />
    </label>
  );
}

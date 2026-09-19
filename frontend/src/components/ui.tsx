import type { ReactNode } from "react";

/** Shared RTL UI primitives (architecture §4 components/). */

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 420, margin: "2rem auto", padding: 16 }}>
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
    <label style={{ display: "block", marginBottom: 8 }}>
      {label}
      <input {...props} style={{ display: "block", width: "100%", marginTop: 4 }} />
    </label>
  );
}

export function Notice({ message }: { message: string }) {
  if (!message) return null;
  return <p>{message}</p>;
}

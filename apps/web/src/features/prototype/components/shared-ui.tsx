"use client";

import { Check } from "lucide-react";

export function Ltr({ children }: { children: React.ReactNode }) {
  return (
    <bdi dir="ltr" className="font-semibold tabular-nums">
      {children}
    </bdi>
  );
}

export function Status({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "dark";
}) {
  return (
    <span
      className={
        tone === "accent"
          ? "status status-strong"
          : tone === "dark"
            ? "status status-dark"
            : "status"
      }
    >
      {children}
    </span>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-message">
      <Check size={18} />
      {children}
    </div>
  );
}

export function TextField({
  label,
  initialValue,
  placeholder,
  type = "text",
}: {
  label: string;
  initialValue?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        defaultValue={initialValue}
        placeholder={placeholder}
      />
    </label>
  );
}

export function SelectField({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

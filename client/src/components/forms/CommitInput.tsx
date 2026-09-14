import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CommitInputProps {
  /** The server's current value; the draft follows it whenever it changes. */
  value: string;
  /**
   * Called on blur or Enter when the draft differs from `value`. Return the
   * mutation promise: if it rejects (a stale 409, a validation error), the
   * draft is reset to the authoritative value so nothing the server refused
   * stays on screen.
   */
  onCommit: (value: string) => void | Promise<unknown>;
  /** Blank commits are ignored unless the field may legitimately be cleared. */
  allowEmpty?: boolean;
  multiline?: boolean;
  type?: "text" | "date";
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * A field that saves on blur or Enter, so every keystroke is not a server
 * write. The draft is local state reconciled per field: it resets only when
 * this field's server value changes or when its own commit is refused, so
 * editing one field never discards a sibling's unsaved text.
 */
export function CommitInput({
  value,
  onCommit,
  allowEmpty = false,
  multiline = false,
  type = "text",
  disabled,
  className,
  placeholder,
  "aria-label": ariaLabel,
}: CommitInputProps) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    const next = draft.trim();
    if (next === value || (!next && !allowEmpty)) {
      setDraft(value);
      return;
    }
    const result = onCommit(next);
    if (result) result.catch(() => setDraft(value));
  };
  if (multiline)
    return (
      <Textarea
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        className={className}
      />
    );
  return (
    <Input
      type={type}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}

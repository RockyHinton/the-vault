import { useEffect, useState } from "react";
import { moneySchema } from "@shared/contracts";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MoneyInputProps {
  /** The server's normalised decimal string, e.g. "125000.00". */
  value: string;
  /** Called on blur with a normalised decimal string, only when the value changed and is valid. */
  onCommit: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * A money field that never converts through floating point: the draft is a
 * string, validated by the shared money schema on commit. Formatting while
 * typing is deliberately minimal so the caret stays put.
 */
export function MoneyInput({
  value,
  onCommit,
  disabled,
  className,
  ...aria
}: MoneyInputProps) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const parsed = moneySchema.safeParse(draft.replace(/,/g, "") || "0");
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(parsed.data);
    if (parsed.data !== value) onCommit(parsed.data);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-label={aria["aria-label"]}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
      className={cn("font-mono", invalid && "border-destructive", className)}
    />
  );
}

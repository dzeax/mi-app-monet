import { useMemo, useRef, useState } from 'react';

type EmailChipsInputProps = {
  value: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxEmails?: number;
};

const EMAIL_SPLIT_REGEX = /[,;\s]+/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeEmail(email: string): string {
  return email.trim();
}

export default function EmailChipsInput({
  value,
  onChange,
  placeholder = 'Add emails separated by commas or spaces.',
  disabled = false,
  maxEmails,
}: EmailChipsInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const remainingSlots = useMemo(() => {
    if (typeof maxEmails !== 'number') return null;
    return Math.max(maxEmails - value.length, 0);
  }, [maxEmails, value.length]);

  const focusInput = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const addEmailsFromString = (raw: string) => {
    const normalized = raw
      .split(EMAIL_SPLIT_REGEX)
      .map(normalizeEmail)
      .filter(Boolean);

    if (!normalized.length) return;

    const valid: string[] = [];
    const invalid: string[] = [];

    normalized.forEach((email) => {
      if (EMAIL_REGEX.test(email)) {
        valid.push(email);
      } else {
        invalid.push(email);
      }
    });

    if (remainingSlots !== null && valid.length > remainingSlots) {
      valid.splice(remainingSlots);
      invalid.push('Additional emails trimmed due to limit.');
    }

    if (valid.length) {
      const deduped = Array.from(new Set([...value, ...valid]));
      onChange(deduped);
      setInputValue('');
    }

    if (invalid.length) {
      setLastError(`Skipped: ${invalid.join(', ')}`);
    } else {
      setLastError(null);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (disabled) return;
    const { key } = event;
    const shouldSubmit = ['Enter', 'Tab', ',', ';'].includes(key);
    if (shouldSubmit && inputValue.trim().length) {
      event.preventDefault();
      addEmailsFromString(inputValue);
    } else if (key === 'Backspace' && !inputValue && value.length) {
      event.preventDefault();
      const next = [...value];
      next.pop();
      onChange(next);
    }
  };

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = () => {
    if (inputValue.trim().length) {
      addEmailsFromString(inputValue);
    }
  };

  const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (event) => {
    if (disabled) return;
    const text = event.clipboardData.getData('text');
    if (text) {
      event.preventDefault();
      addEmailsFromString(text);
    }
  };

  const handleRemove = (index: number) => {
    const next = [...value];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <div
        className={[
          'input min-h-[2.75rem] cursor-text gap-2 py-2',
          disabled ? 'opacity-60' : 'focus-within:ring-2 focus-within:ring-[color:var(--color-primary)]',
          'flex flex-wrap items-center',
        ].join(' ')}
        onClick={focusInput}
        role="presentation"
      >
        {value.map((email, index) => (
          <span
            key={`${email}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface-2)] px-3 py-0.5 text-xs text-[color:var(--color-text)]"
          >
            {email}
            {!disabled ? (
              <button
                type="button"
                className="rounded-full bg-transparent px-1 text-[color:var(--color-text)]/60 transition hover:text-[color:var(--color-primary)]"
                onClick={() => handleRemove(index)}
                aria-label={`Remove ${email}`}
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        {remainingSlots !== 0 ? (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 border-none bg-transparent px-1 text-sm text-[color:var(--color-text)] focus:outline-none"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onPaste={handlePaste}
            placeholder={value.length ? '' : placeholder}
            disabled={disabled}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text)]/60">
        <span aria-live="polite">{lastError}</span>
        {typeof remainingSlots === 'number' ? (
          <span>
            {value.length}/{maxEmails}
          </span>
        ) : null}
      </div>
    </div>
  );
}

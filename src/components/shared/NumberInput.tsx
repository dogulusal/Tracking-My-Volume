import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number;
  onValueChange: (value: number) => void;
};

// Keep an empty editing value instead of coercing it into a leading zero.
export function NumberInput({ value, onValueChange, min = 0, step = 1, ...props }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const normalize = (raw: string) => {
    const parsed = Number(raw.replace(',', '.'));
    const number = Number.isFinite(parsed) ? parsed : value;
    return Math.max(Number(min), step === 1 ? Math.trunc(number) : number);
  };
  return <input {...props} type="text" inputMode={step === 1 ? 'numeric' : 'decimal'}
    value={draft ?? String(value)}
    onFocus={e => e.currentTarget.select()}
    onChange={e => {
      const raw = e.target.value.replace(/^0+(?=\d)/, '');
      if (!/^\d*([.,]\d*)?$/.test(raw)) return;
      setDraft(raw);
      if (raw.trim() && !/[.,]$/.test(raw)) onValueChange(normalize(raw));
    }}
    onBlur={() => {
      if (draft !== null) onValueChange(draft.trim() ? normalize(draft) : Number(min));
      setDraft(null);
    }} />;
}

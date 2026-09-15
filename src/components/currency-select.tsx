type CurrencySelectProps = {
  name: string;
  label: string;
  value: string;
  codes: string[];
  onChange: (code: string) => void;
};

export function CurrencySelect({
  name,
  label,
  value,
  codes,
  onChange,
}: CurrencySelectProps) {
  return (
    <select
      id={name}
      name={name}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 rounded-md border border-border bg-background px-3 font-mono text-sm"
    >
      {codes.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
}

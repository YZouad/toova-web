import { Field, Select, type SelectOption } from './kit';

const MONTHS: SelectOption[] = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

function yearOptions(): SelectOption[] {
  const now = new Date().getUTCFullYear();
  const years: SelectOption[] = [{ value: '', label: 'Year' }];
  for (let y = now; y >= 1900; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

export function BirthMonthYearFields({
  month,
  year,
  onMonthChange,
  onYearChange,
  idPrefix = 'birth',
}: {
  month: string;
  year: string;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
  idPrefix?: string;
}) {
  return (
    <Field label="Birth month and year" hint="You must be at least 13.">
      <div className="birth-month-year">
        <Select
          id={`${idPrefix}-month`}
          aria-label="Birth month"
          autoComplete="bday-month"
          value={month}
          onChange={onMonthChange}
          options={[{ value: '', label: 'Month' }, ...MONTHS]}
          required
        />
        <Select
          id={`${idPrefix}-year`}
          aria-label="Birth year"
          autoComplete="bday-year"
          value={year}
          onChange={onYearChange}
          options={yearOptions()}
          required
        />
      </div>
    </Field>
  );
}

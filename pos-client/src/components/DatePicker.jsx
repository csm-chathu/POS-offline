import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.min.css';

const base = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white cursor-pointer';

export default function DatePicker({ value, onChange, min, max, placeholder = 'Select date', className, disabled }) {
  return (
    <Flatpickr
      value={value || ''}
      onChange={([date]) => onChange && onChange(date ? date.toISOString().slice(0, 10) : '')}
      options={{
        dateFormat: 'Y-m-d',
        allowInput: true,
        yearSelectorType: 'static',
        ...(min ? { minDate: min } : {}),
        ...(max ? { maxDate: max } : {}),
      }}
      className={className || base}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

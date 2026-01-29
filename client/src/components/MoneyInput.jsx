import { formatMoney } from '../utils';
import { useLanguage } from '../context/LanguageContext';

export default function MoneyInput({ value, onChange, placeholder, disabled, id }) {
  const { t } = useLanguage();
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={value ? formatMoney(value).replace('₩', '') : ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '');
        onChange(raw);
      }}
      disabled={disabled}
    />
  );
}

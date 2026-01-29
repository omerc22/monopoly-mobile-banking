import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { localeNames } from '../locales';

export default function LanguageSelector() {
  const { currentLanguage, changeLanguage, availableLanguages } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const handleLanguageChange = (language) => {
    changeLanguage(language);
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="language-selector">
      <button
        type="button"
        className="language-selector-button"
        onClick={toggleDropdown}
        title="Dil Seç"
      >
        {localeNames[currentLanguage]} ▼
      </button>

      {isOpen && (
        <div className="language-selector-dropdown">
          {availableLanguages.map(lang => (
            <button
              key={lang}
              type="button"
              className={`language-option ${lang === currentLanguage ? 'active' : ''}`}
              onClick={() => handleLanguageChange(lang)}
            >
              {localeNames[lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

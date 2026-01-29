// client/src/views/LoginView.jsx
import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function LoginView({ onLogin }) {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const t = username.trim();
    if (!t) return;
    onLogin(t);
  }

  return (
    <div className="view view-login">
      <h1>{t('login.title')}</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={t('login.username.placeholder')}
          value={username}
          onChange={e => setUsername(e.target.value)}
          maxLength={32}
          autoFocus
          autoComplete="username"
        />
        <button type="submit">{t('login.submit')}</button>
      </form>
    </div>
  );
}

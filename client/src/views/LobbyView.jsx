// client/src/views/LobbyView.jsx
import { useState } from 'react';
import { formatMoney } from '../utils';
import { useLanguage } from '../context/LanguageContext';

export default function LobbyView({
  username,
  games,
  joiningGameId,
  error,
  onCreateGame,
  onJoinGame,
  onSelectGame,
}) {
  const { t } = useLanguage();
  const [joinId, setJoinId] = useState('');
  const [showCreateSettings, setShowCreateSettings] = useState(false);
  const [startingBalance, setStartingBalance] = useState(1500);
  const [passGoAmount, setPassGoAmount] = useState(200);
  const [anonymousBalances, setAnonymousBalances] = useState(true);

  function handleJoinById(e) {
    e.preventDefault();
    const id = joinId.trim();
    if (!id) return;
    onJoinGame(id);
  }

  function handleCreateGame() {
    const sb = parseInt(startingBalance, 10);
    const pg = parseInt(passGoAmount, 10);
    onCreateGame({
      startingBalance: (Number.isInteger(sb) && sb > 0) ? sb : 1500,
      passGoAmount: (Number.isInteger(pg) && pg > 0) ? pg : 200,
      anonymousBalances,
    });
  }

  return (
    <div className="view view-lobby">
      <p className="lobby-greeting">{t('lobby.greeting')} <strong>{username}</strong></p>

      {error && <p className="lobby-error">{error}</p>}

      {joiningGameId ? (
        <p className="lobby-reconnecting">{joiningGameId} {t('lobby.reconnecting')}</p>
      ) : (
        <>
          <section className="lobby-section">
            <h2>{t('lobby.activeGames')}</h2>
            <ul className="game-list">
              {games.length === 0 && <li className="game-list-empty">{t('lobby.noGames')}</li>}
              {games.map(g => (
                <li key={g.id} className="game-item" onClick={() => onSelectGame(g.id)}>
                  <span className="game-id">{g.id}</span>
                  <span className="game-meta">{t('lobby.host')} {g.hostUsername} · {g.playerCount} {t('lobby.players')}{g.playerCount !== 1 ? '' : ''}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="lobby-section create-section">
            <button type="button" className="create-settings-toggle" onClick={() => setShowCreateSettings(s => !s)}>
              {showCreateSettings ? '▼' : '▶'} {t('lobby.gameSettings')}
            </button>
            {showCreateSettings && (
              <div className="create-settings">
                <label>
                  {t('lobby.startingBalance')}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={startingBalance ? formatMoney(startingBalance).replace('₩', '') : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setStartingBalance(raw);
                    }}
                  />
                </label>
                <label>
                  {t('lobby.passGoAmount')}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={passGoAmount ? formatMoney(passGoAmount).replace('₩', '') : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setPassGoAmount(raw);
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={anonymousBalances}
                    onChange={(e) => setAnonymousBalances(e.target.checked)}
                  />
                  {t('lobby.anonymousBalances')}
                </label>
              </div>
            )}
            <button className="btn btn-primary" onClick={handleCreateGame}>{t('lobby.createGame')}</button>
          </section>

          <form className="join-form" onSubmit={handleJoinById}>
            <input
              type="text"
              placeholder={t('lobby.joinById.placeholder')}
              value={joinId}
              onChange={e => setJoinId(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary">{t('lobby.joinById')}</button>
          </form>
        </>
      )}
    </div>
  );
}

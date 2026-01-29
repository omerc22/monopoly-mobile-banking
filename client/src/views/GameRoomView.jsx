import { useState, useEffect, useRef } from 'react';
import MoneyInput from '../components/MoneyInput';
import { formatMoney } from '../utils';
import { useLanguage } from '../context/LanguageContext';

let wakeLock = null;

export default function GameRoomView({
  game,
  username,
  isConnected,
  transactionError,
  transactionLogs,
  onLeave,
  onStartGame,
  onFinishGame,
  onTransferToPlayer,
  onPayBank,
  onReceiveFromBank,
  onPassGo,
  onUpdateSettings,
}) {
  const { t } = useLanguage();
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [payBankAmount, setPayBankAmount] = useState('');
  const [receiveBankAmount, setReceiveBankAmount] = useState('');
  const [showHostSettings, setShowHostSettings] = useState(false);
  const [hostStartingBalance, setHostStartingBalance] = useState(1500);
  const [hostPassGoAmount, setHostPassGoAmount] = useState(200);
  const [hostBankerLess, setHostBankerLess] = useState(true);
  const [showPayBankModal, setShowPayBankModal] = useState(false);
  const [showReceiveBankModal, setShowReceiveBankModal] = useState(false);
  const [showPassGoModal, setShowPassGoModal] = useState(false);
  const [showLeaveGameModal, setShowLeaveGameModal] = useState(false);
  const [showFinishGameModal, setShowFinishGameModal] = useState(false);
  const [balanceEffects, setBalanceEffects] = useState({});
  const previousBalancesRef = useRef({});

  // Wake Lock functions
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake lock acquired');
      }
    } catch (err) {
      console.log('Wake lock request failed:', err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLock) {
      try {
        await wakeLock.release();
        wakeLock = null;
        console.log('Wake lock released');
      } catch (err) {
        console.log('Wake lock release failed:', err);
      }
    }
  };

  if (!game) return <div className="view">{t('game.loading')}</div>;

  const { id, hostId, players, status, settings } = game;
  const myId = players.find(p => p.username === username)?.id;
  const isHost = myId === hostId;
  const settingsLocked = status !== 'waiting';
  const transactionsEnabled = status === 'in-progress';
  const passGoAmount = settings?.passGoAmount ?? 200;

  // Initialize previous balances when game loads
  useEffect(() => {
    if (game?.players && Object.keys(previousBalancesRef.current).length === 0) {
      game.players.forEach(p => {
        previousBalancesRef.current[p.id] = p.balance ?? 0;
      });
      console.log('Initialized previous balances:', previousBalancesRef.current);
    }
  }, [game?.players]);

  // Wake Lock management
  useEffect(() => {
    if (game) {
      // Game room entered - acquire wake lock
      requestWakeLock();

      // Listen for visibility change to re-acquire wake lock
      const handleVisibilityChange = async () => {
        if (document.visibilityState === 'visible') {
          await requestWakeLock();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        // Cleanup on unmount or game change
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        releaseWakeLock();
      };
    } else {
      // No game - release wake lock
      releaseWakeLock();
    }
  }, [game]);

  // Track balance changes and trigger visual effects
  useEffect(() => {
    if (!game?.players || Object.keys(previousBalancesRef.current).length === 0) return;

    const newEffects = {};

    game.players.forEach(p => {
      const prevBalance = previousBalancesRef.current[p.id];
      const currentBalance = p.balance ?? 0;

      if (prevBalance !== undefined && prevBalance !== currentBalance) {
        console.log(`Balance change for ${p.username}: ${prevBalance} -> ${currentBalance}`);
        if (currentBalance > prevBalance) {
          newEffects[p.id] = 'increase';
        } else if (currentBalance < prevBalance) {
          newEffects[p.id] = 'decrease';
        }
      }

      // Update the ref with current balance
      previousBalancesRef.current[p.id] = currentBalance;
    });

    if (Object.keys(newEffects).length > 0) {
      console.log('Balance effects triggered:', newEffects);
      setBalanceEffects(newEffects);
      // Clear effects after 3 seconds
      setTimeout(() => {
        setBalanceEffects({});
      }, 3000);
    }
  }, [game?.players]);

  function openTransfer(p) {
    if (p.id === myId || !transactionsEnabled) return;
    setTransferTarget(p);
    setTransferAmount('');
  }

  function openHostSettings() {
    if (!showHostSettings) {
      setHostStartingBalance(settings?.startingBalance ?? 1500);
      setHostPassGoAmount(settings?.passGoAmount ?? 200);
      setHostBankerLess((settings?.bankerlessWithdrawal ?? settings?.bankerLessWithdrawals) !== false);
    }
    setShowHostSettings(s => !s);
  }

  function submitTransfer(e) {
    e.preventDefault();
    const n = parseInt(transferAmount, 10);
    if (!transferTarget || !Number.isInteger(n) || n <= 0) return;
    onTransferToPlayer(transferTarget, n);
    setTransferTarget(null);
    setTransferAmount('');
  }

  function submitPayBank(e) {
    e.preventDefault();
    const n = parseInt(payBankAmount, 10);
    if (!Number.isInteger(n) || n <= 0) return;
    onPayBank(n);
    setPayBankAmount('');
    setShowPayBankModal(false);
  }

  function submitReceiveBank(e) {
    e.preventDefault();
    const n = parseInt(receiveBankAmount, 10);
    if (!Number.isInteger(n) || n <= 0) return;
    onReceiveFromBank(n);
    setReceiveBankAmount('');
    setShowReceiveBankModal(false);
  }

  function saveHostSettings(e) {
    e.preventDefault();
    const sb = parseInt(hostStartingBalance, 10);
    const pg = parseInt(hostPassGoAmount, 10);
    onUpdateSettings({
      startingBalance: (Number.isInteger(sb) && sb > 0) ? sb : 1500,
      passGoAmount: (Number.isInteger(pg) && pg > 0) ? pg : 200,
      bankerlessWithdrawal: hostBankerLess,
    });
    setShowHostSettings(false);
  }

  function confirmPassGo() {
    onPassGo();
    setShowPassGoModal(false);
  }

  function formatTransactionLog(log) {
    const time = new Date(log.timestamp).toLocaleTimeString('tr-TR');
    const amount = formatMoney(log.amount);

    let key, params;
    switch (log.type) {
      case 'PLAYER_TO_PLAYER':
        key = 'game.transaction.playerToPlayer';
        params = { amount, from: log.from, to: log.to };
        break;
      case 'TO_BANK':
        key = 'game.transaction.toBank';
        params = { amount, player: log.from };
        break;
      case 'FROM_BANK':
        key = 'game.transaction.fromBank';
        params = { amount, player: log.to };
        break;
      case 'PASS_GO':
        key = 'game.transaction.passGo';
        params = { amount, player: log.to };
        break;
      default:
        return { text: `${time} – Bilinmeyen işlem`, className: 'transaction-default' };
    }

    const message = t(key, params);
    return {
      text: `${time} – ${message}`,
      className: log.type === 'FROM_BANK' || log.type === 'PASS_GO' ? 'transaction-green' :
               log.type === 'PLAYER_TO_PLAYER' ? 'transaction-red' : 'transaction-red'
    };
  }

  return (
    <div className="view view-game-room">
      <p className="game-room-id">{t('game.roomId')} {id}</p>
      <p className="game-room-status">
        {isConnected ? <span className="badge online">{t('game.online')}</span> : <span className="badge offline">{t('game.offline')}</span>}
      </p>

      {transactionError && (
        <div className="transaction-error" role="alert">
          {transactionError}
        </div>
      )}

      <section className="lobby-section">
        <h2>{t('game.players')}</h2>
        <ul className="player-list">
          {players.map(p => (
            <li key={p.id} className={`player-item ${balanceEffects[p.id] || ''}`}>
              <span
                className={`player-name ${p.id !== myId && transactionsEnabled ? 'player-name-clickable' : ''}`}
                onClick={() => p.id !== myId && openTransfer(p)}
              >
                {p.username}
              </span>
              <span className="player-balance">
                {p.id === myId
                  ? formatMoney(p.balance ?? 0)
                  : (settings?.anonymousBalances !== false ? (p.balanceBucket ?? '—') : formatMoney(p.balance ?? 0))}
              </span>
              {p.id === hostId && <span className="player-host">{t('lobby.host')}</span>}
              <span className={`player-connection ${p.isConnected ? 'online' : 'offline'}`}>
                {p.isConnected ? '●' : '○'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isHost && status === 'waiting' && (
        <button type="button" className="btn btn-primary" onClick={onStartGame}>
          {t('game.startGame')}
        </button>
      )}

      {isHost && status === 'in-progress' && (
        <button type="button" className="btn btn-success" onClick={() => setShowFinishGameModal(true)}>
          {t('game.finishGame')}
        </button>
      )}

      {status === 'waiting' && (
        <p className="game-waiting-hint">{isHost ? t('game.waitingHint.host') : t('game.waitingHint.player')}</p>
      )}

      <section className="bank-actions">
        <h2>{t('game.bank')}</h2>
        <div className="bank-buttons">
          <button type="button" className="btn btn-bank" disabled={!transactionsEnabled} onClick={() => { setPayBankAmount(''); setShowPayBankModal(true); }}>
            <svg className="bank-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-7z"/>
            </svg>
            {t('game.payBank')}
          </button>
          <button type="button" className="btn btn-bank" disabled={!transactionsEnabled} onClick={() => { setReceiveBankAmount(''); setShowReceiveBankModal(true); }}>
            <svg className="bank-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
            </svg>
            {t('game.receiveFromBank')}
          </button>
          <button type="button" className="btn btn-bank" disabled={!transactionsEnabled} onClick={() => setShowPassGoModal(true)}>
            <svg className="bank-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            {t('game.passGo')}
          </button>
        </div>
      </section>

      {isHost && !settingsLocked && (
        <section className="host-settings-section">
          <button type="button" className="create-settings-toggle" onClick={openHostSettings}>
            {showHostSettings ? '▼' : '▶'} {t('game.hostSettings')}
          </button>
          {showHostSettings && (
            <form className="host-settings-form" onSubmit={saveHostSettings}>
              <label>
                {t('lobby.startingBalance')}
                <input
                  type="text"
                  inputMode="numeric"
                  value={hostStartingBalance ? formatMoney(hostStartingBalance).replace('₩', '') : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    setHostStartingBalance(raw);
                  }}
                />
              </label>
              <label>
                {t('lobby.passGoAmount')}
                <input
                  type="text"
                  inputMode="numeric"
                  value={hostPassGoAmount ? formatMoney(hostPassGoAmount).replace('₩', '') : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    setHostPassGoAmount(raw);
                  }}
                />
              </label>
              <label><input type="checkbox" checked={hostBankerLess} onChange={e => setHostBankerLess(e.target.checked)} /> {t('game.bankerlessWithdrawal')}</label>
              <button type="submit" className="btn btn-secondary">{t('game.save')}</button>
            </form>
          )}
        </section>
      )}

      <button className="btn btn-secondary" onClick={() => setShowLeaveGameModal(true)}>{t('game.leaveGame')}</button>

      {/* Transfer to player modal */}
      {transferTarget && (
        <div className="modal-overlay" onClick={() => setTransferTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{transferTarget.username}{t('game.transferTo')}</h3>
            <form onSubmit={submitTransfer}>
              <MoneyInput value={transferAmount} onChange={setTransferAmount} placeholder={t('game.amount')} />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setTransferTarget(null)}>{t('game.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={!transferAmount || parseInt(transferAmount, 10) <= 0}>{t('game.confirm')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPayBankModal && (
        <div className="modal-overlay" onClick={() => setShowPayBankModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{t('game.payBank')}</h3>
            <form onSubmit={submitPayBank}>
              <MoneyInput value={payBankAmount} onChange={setPayBankAmount} placeholder={t('game.amount')} />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPayBankModal(false)}>{t('game.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={!payBankAmount || parseInt(payBankAmount, 10) <= 0}>{t('game.confirm')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReceiveBankModal && (
        <div className="modal-overlay" onClick={() => setShowReceiveBankModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{t('game.receiveFromBank')}</h3>
            <form onSubmit={submitReceiveBank}>
              <MoneyInput value={receiveBankAmount} onChange={setReceiveBankAmount} placeholder={t('game.amount')} />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowReceiveBankModal(false)}>{t('game.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={!receiveBankAmount || parseInt(receiveBankAmount, 10) <= 0}>{t('game.confirm')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPassGoModal && (
        <div className="modal-overlay" onClick={() => setShowPassGoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{t('game.passGo')}</h3>
            <p className="modal-body">{formatMoney(passGoAmount)} {t('game.passGoConfirm')}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowPassGoModal(false)}>{t('game.cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={confirmPassGo}>{t('game.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {showLeaveGameModal && (
        <div className="modal-overlay" onClick={() => setShowLeaveGameModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{t('game.leaveGame')}</h3>
            <p className="modal-body">{t('game.leaveConfirm')}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowLeaveGameModal(false)}>{t('game.cancel')}</button>
              <button type="button" className="btn btn-danger" onClick={() => {
                setShowLeaveGameModal(false);
                onLeave();
              }}>{t('game.yesLeave')}</button>
            </div>
          </div>
        </div>
      )}

      {showFinishGameModal && (
        <div className="modal-overlay" onClick={() => setShowFinishGameModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{t('game.finishGame')}</h3>
            <p className="modal-body">{t('game.finishConfirm')}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowFinishGameModal(false)}>{t('game.cancel')}</button>
              <button type="button" className="btn btn-success" onClick={() => {
                setShowFinishGameModal(false);
                onFinishGame();
              }}>{t('game.yesFinish')}</button>
            </div>
          </div>
        </div>
      )}

      <section className="transaction-logs">
        <h2>{t('game.transactionHistory')}</h2>
        <div className="transaction-log-list">
          {transactionLogs.length === 0 ? (
            <p className="no-transactions">{t('game.noTransactions')}</p>
          ) : (
            transactionLogs.slice().reverse().map(log => {
              const { text, className } = formatTransactionLog(log);
              return (
                <div key={log.id} className={`transaction-log-entry ${className}`}>
                  {text}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

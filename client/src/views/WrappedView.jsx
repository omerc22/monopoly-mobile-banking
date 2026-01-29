import { formatMoney } from '../utils';
import { useLanguage } from '../context/LanguageContext';

export default function WrappedView({ statistics, onReturnToLobby }) {
  const { t } = useLanguage();
  if (!statistics) return null;

  const formatPlayer = (player) => player || t('common.nobody');

  return (
    <div className="view view-wrapped">
      <div className="wrapped-header">
        <h1>{t('wrapped.title')}</h1>
        <p>------</p>
      </div>

      <div className="wrapped-stats">
        <div className="stat-item">
          <div className="stat-icon">💸</div>
          <div className="stat-content">
            <h3>{t('wrapped.mostBankWithdrawals')}</h3>
            <p className="stat-winner">{formatPlayer(statistics.mostBankWithdrawals.player)}</p>
            <p className="stat-amount">{formatMoney(statistics.mostBankWithdrawals.amount)}</p>
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-icon">🤝</div>
          <div className="stat-content">
            <h3>{t('wrapped.mostBankDeposits')}</h3>
            <p className="stat-winner">{formatPlayer(statistics.mostBankDeposits.player)}</p>
            <p className="stat-amount">{formatMoney(statistics.mostBankDeposits.amount)}</p>
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-icon">🐍</div>
          <div className="stat-content">
            <h3>{t('wrapped.mostGenerous')}</h3>
            <p className="stat-winner">{formatPlayer(statistics.mostGenerous.player)}</p>
            <p className="stat-amount">{formatMoney(statistics.mostGenerous.amount)}</p>
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-icon">💣</div>
          <div className="stat-content">
            <h3>{t('wrapped.mostReceived')}</h3>
            <p className="stat-winner">{formatPlayer(statistics.mostReceived.player)}</p>
            <p className="stat-amount">{formatMoney(statistics.mostReceived.amount)}</p>
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>{t('wrapped.largestTransfer')}</h3>
            <p className="stat-winner">{formatPlayer(statistics.largestTransfer.from)} → {formatPlayer(statistics.largestTransfer.to)}</p>
            <p className="stat-amount">{formatMoney(statistics.largestTransfer.amount)}</p>
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-icon">😭</div>
          <div className="stat-content">
            <h3>{t('wrapped.mostBroke')}</h3>
            <p className="stat-winner">{formatPlayer(statistics.mostBroke.player)}</p>
            <p className="stat-amount">{formatMoney(statistics.mostBroke.balance)}</p>
          </div>
        </div>

        <div className="stat-item">
          <div className="stat-icon">🏃</div>
          <div className="stat-content">
            <h3>{t('wrapped.mostPassGo')}</h3>
            <p className="stat-winner">{formatPlayer(statistics.mostPassGo.player)}</p>
            <p className="stat-amount">{statistics.mostPassGo.count} {t('wrapped.times')}</p>
          </div>
        </div>

        <div className="stat-item total">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>{t('wrapped.totalMoneyTransferred')}</h3>
            <p className="stat-amount">{formatMoney(statistics.totalMoneyTransferred)}</p>
          </div>
        </div>
      </div>

      <div className="wrapped-footer">
        <button className="btn btn-primary" onClick={onReturnToLobby}>
          {t('wrapped.returnToLobby')}
        </button>
      </div>
    </div>
  );
}
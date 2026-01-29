// client/src/App.jsx
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, STORAGE_KEYS } from './config';
import { useLanguage } from './context/LanguageContext';
import LanguageSelector from './components/LanguageSelector';
import LoginView from './views/LoginView';
import LobbyView from './views/LobbyView';
import GameRoomView from './views/GameRoomView';
import WrappedView from './views/WrappedView';

function App() {
  const { t } = useLanguage();
  const [username, setUsername] = useState(() =>
    (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.USERNAME)) || null
  );
  const [view, setView] = useState(() =>
    (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.USERNAME)) ? 'lobby' : 'login'
  );
  const [game, setGame] = useState(null);
  const [games, setGames] = useState([]);
  const [joiningGameId, setJoiningGameId] = useState(() =>
    (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.GAME_ID)) || null
  );
  const [lobbyError, setLobbyError] = useState(null);
  const [transactionError, setTransactionError] = useState(null);
  const [transactionLogs, setTransactionLogs] = useState([]);
  const [gameStatistics, setGameStatistics] = useState(null);
  const [socket, setSocket] = useState(null);

  // ----- UUID-based authentication and socket connection -----
  useEffect(() => {
    // Check if we have a valid player session
    const storedPlayerId = localStorage.getItem(STORAGE_KEYS.PLAYER_ID);
    const storedUsername = localStorage.getItem(STORAGE_KEYS.USERNAME);

    if (!storedPlayerId || !storedUsername) {
      setView('login');
      return;
    }

    // We have a stored session, set up socket connection
    setUsername(storedUsername);
    setView('lobby');

    const s = io(SOCKET_URL);

    s.on('connect', () => {
      setSocket(s);
      const gid = localStorage.getItem(STORAGE_KEYS.GAME_ID);
      if (gid) {
        // Use playerId for secure reconnection
        s.emit('joinGame', { gameId: gid, playerId: storedPlayerId });
        setJoiningGameId(gid);
      } else {
        setJoiningGameId(null);
        s.emit('joinLobby');
      }
    });

    s.on('disconnect', () => setSocket(null));

    s.on('createGameSuccess', ({ gameId, game: g }) => {
      setLobbyError(null);
      s.emit('leaveLobby');
      localStorage.setItem(STORAGE_KEYS.GAME_ID, gameId);
      setGame({ ...g, players: g.players || [] });
      setTransactionLogs(g.transactionLogs || []);
      setView('gameRoom');
    });

    s.on('createGameError', ({ message }) => {
      // If session is invalid, clear everything and go back to login
      if (message.includes('Invalid player session') || message.includes('session')) {
        localStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
        localStorage.removeItem(STORAGE_KEYS.USERNAME);
        setUsername('');
        setView('login');
        setLobbyError('Session expired. Please login again.');
        s.disconnect();
        return;
      }
      setLobbyError(message);
    });

    s.on('joinGameSuccess', ({ gameId, game: g }) => {
      //#region agent log
      fetch('http://127.0.0.1:7242/ingest/bbd2857c-3ae1-4323-98f2-d7d83e20d8f8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client/App.jsx:joinGameSuccess',message:'joinGameSuccess received',data:{gameId,hasTransactionLogs:!!g.transactionLogs},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
      //#endregion
      setLobbyError(null);
      setJoiningGameId(null);
      s.emit('leaveLobby');
      localStorage.setItem(STORAGE_KEYS.GAME_ID, gameId);
      setGame({ ...g, players: g.players || [] });
      setTransactionLogs(g.transactionLogs || []);
      setView('gameRoom');
    });

    s.on('joinGameError', ({ message }) => {
      setJoiningGameId(null);
      localStorage.removeItem(STORAGE_KEYS.GAME_ID);

      // If session is invalid, clear everything and go back to login
      if (message.includes('Invalid player session') || message.includes('session')) {
        localStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
        localStorage.removeItem(STORAGE_KEYS.USERNAME);
        setUsername('');
        setView('login');
        setLobbyError('Session expired. Please login again.');
        s.disconnect();
        return;
      }

      setLobbyError(message);
      s.emit('joinLobby');
    });

    s.on('lobbyGames', ({ games: list }) => setGames(list || []));

    s.on('updatePlayers', (payload) => {
      setGame(prev => (prev
        ? {
            ...prev,
            players: payload.players || prev.players,
            hostId: payload.hostId ?? prev.hostId,
            ...(payload.settings != null && { settings: payload.settings }),
            ...(payload.status != null && { status: payload.status }),
          }
        : prev
      ));
    });

    s.on('gameStarted', ({ gameId, settings: snd }) => {
      setTransactionError(null);
      setGame(prev => (prev && prev.id === gameId && snd)
        ? { ...prev, status: 'in-progress', settings: snd }
        : prev
      );
    });

    s.on('gameFinished', ({ gameId, statistics }) => {
      setGameStatistics(statistics);
      setGame(prev => (prev && prev.id === gameId)
        ? { ...prev, status: 'finished' }
        : prev
      );
    });

    s.on('gameStateUpdate', (payload) => {
      setTransactionError(null);
      setGame(prev => (prev && prev.id === payload.gameId)
        ? { ...prev, players: payload.players ?? prev.players }
        : prev
      );
    });

    s.on('transactionError', ({ code, message }) => {
      setTransactionError(message || code || 'Transaction failed');
    });

    s.on('transactionLogUpdate', ({ gameId, logs }) => {
      setTransactionLogs(logs || []);
    });

    s.on('leaveGameSuccess', () => {
      //#region agent log
      fetch('http://127.0.0.1:7242/ingest/bbd2857c-3ae1-4323-98f2-d7d83e20d8f8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client/App.jsx:leaveGameSuccess',message:'leaveGameSuccess received',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
      //#endregion
      localStorage.removeItem(STORAGE_KEYS.GAME_ID);
      setJoiningGameId(null);
      setTransactionError(null);
      setGame(null);
      setView('lobby');
      s.emit('joinLobby');
    });

    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, [username]);

  // ----- Handlers -----
  function handleLogin(u) {
    const username = String(u).trim();
    if (!username) return;

    // Create socket just for login
    const loginSocket = io(SOCKET_URL);

    loginSocket.on('connect', () => {
      loginSocket.emit('login', { username });
    });

    loginSocket.on('loginSuccess', ({ playerId, username: returnedUsername }) => {
      // Store session data
      localStorage.setItem(STORAGE_KEYS.PLAYER_ID, playerId);
      localStorage.setItem(STORAGE_KEYS.USERNAME, returnedUsername);

      // Clean up login socket
      loginSocket.disconnect();

      // Set state and continue to lobby
      setUsername(returnedUsername);
      setView('lobby');
    });

    loginSocket.on('loginError', ({ message }) => {
      setLobbyError(message);
      loginSocket.disconnect();
    });
  }

  function handleCreateGame(settings = {}) {
    setLobbyError(null);
    const playerId = localStorage.getItem(STORAGE_KEYS.PLAYER_ID);
    if (playerId) {
      socket?.emit('createGame', { playerId, settings });
    } else {
      setLobbyError('Session expired. Please login again.');
    }
  }

  function handleJoinGame(gameId) {
    setLobbyError(null);
    const playerId = localStorage.getItem(STORAGE_KEYS.PLAYER_ID);
    if (playerId) {
      socket?.emit('joinGame', { gameId, playerId });
      setJoiningGameId(gameId);
    } else {
      setLobbyError('Session expired. Please login again.');
    }
  }

  function handleSelectGame(gameId) {
    handleJoinGame(gameId);
  }

  function handleLeaveGame() {
    //#region agent log
    fetch('http://127.0.0.1:7242/ingest/bbd2857c-3ae1-4323-98f2-d7d83e20d8f8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client/App.jsx:handleLeaveGame',message:'handleLeaveGame called',data:{gameId:game?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
    //#endregion
    socket?.emit('leaveGame');
  }

  const myId = game?.players?.find(p => p.username === username)?.id;

  function handleTransferToPlayer(toPlayer, amount) {
    setTransactionError(null);
    if (!game?.id || !myId) return;

    // Mobil cihazlarda para transferinde titreşim
    triggerVibrationForTransfer(amount);

    socket?.emit('transferToPlayer', { gameId: game.id, fromPlayerId: myId, toPlayerId: toPlayer.id, amount });
  }

  function triggerVibrationForTransfer(amount) {
    // Sadece mobil cihazlarda ve vibration API varsa çalış
    if (!navigator.vibrate) return;

    const numAmount = parseInt(amount, 10);

    let pattern;
    if (numAmount < 1000000) {
      // Çok minik titreme - 1M altında
      pattern = [50];
    } else if (numAmount <= 5000000) {
      // Orta seviye titreme - 1M-5M arası
      pattern = [100, 50, 100];
    } else {
      // Dehşet titreme - 5M üstünde
      pattern = [200, 100, 200, 100, 300];
    }

    navigator.vibrate(pattern);
  }

  function handlePayBank(amount) {
    setTransactionError(null);
    if (!game?.id || !myId) return;
    socket?.emit('transferToBank', { gameId: game.id, fromPlayerId: myId, amount });
  }

  function handleReceiveFromBank(amount) {
    setTransactionError(null);
    if (!game?.id || !myId) return;
    socket?.emit('transferFromBank', { gameId: game.id, toPlayerId: myId, amount });
  }

  function handlePassGo() {
    setTransactionError(null);
    if (!game?.id || !myId) return;
    socket?.emit('passGo', { gameId: game.id, playerId: myId });
  }

  function handleUpdateSettings(settings) {
    setTransactionError(null);
    if (!game?.id) return;
    socket?.emit('updateGameSettings', { gameId: game.id, settings });
  }

  function handleStartGame() {
    setTransactionError(null);
    if (!game?.id) return;
    socket?.emit('startGame', { gameId: game.id });
  }

  function handleFinishGame() {
    setTransactionError(null);
    if (!game?.id) return;
    socket?.emit('finishGame', { gameId: game.id });
  }

  function handleReturnToLobby() {
    setGameStatistics(null);
    setGame(null);
    setTransactionLogs([]);
    setView('lobby');
    socket?.emit('joinLobby');
  }

  // ----- Render -----
  if (!username) {
    return (
      <div className="app-container">
        <div className="language-selector-container">
          <LanguageSelector />
        </div>
        <LoginView onLogin={handleLogin} />
      </div>
    );
  }

  if (view === 'lobby') {
    return (
      <div className="app-container">
        <div className="language-selector-container">
          <LanguageSelector />
        </div>
        <LobbyView
          username={username}
          games={games}
          joiningGameId={joiningGameId}
          error={lobbyError}
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          onSelectGame={handleSelectGame}
        />
      </div>
    );
  }

  if (view === 'gameRoom') {
    // Show wrapped view if game is finished and we have statistics
    if (gameStatistics && game?.status === 'finished') {
      return (
        <div className="app-container">
          <div className="language-selector-container">
            <LanguageSelector />
          </div>
          <WrappedView
            statistics={gameStatistics}
            onReturnToLobby={handleReturnToLobby}
          />
        </div>
      );
    }

    return (
      <div className="app-container">
        <div className="language-selector-container">
          <LanguageSelector />
        </div>
        <GameRoomView
          game={game}
          username={username}
          isConnected={!!socket?.connected}
          transactionError={transactionError}
          transactionLogs={transactionLogs}
          onLeave={handleLeaveGame}
          onStartGame={handleStartGame}
          onFinishGame={handleFinishGame}
          onTransferToPlayer={handleTransferToPlayer}
          onPayBank={handlePayBank}
          onReceiveFromBank={handleReceiveFromBank}
          onPassGo={handlePassGo}
          onUpdateSettings={handleUpdateSettings}
        />
      </div>
    );
  }

  return null;
}

export default App;

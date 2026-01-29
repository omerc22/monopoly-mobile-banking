// server/index.js

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import os from 'os';
import crypto from 'crypto'; // UUID için gerekli

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'] }
});

// ---------------------------------------------------------------------------
// State & Garbage Collection
// ---------------------------------------------------------------------------

/** @type {Map<string, Game>} */
const games = new Map();

const DEFAULT_SETTINGS = {
  startingBalance: 1500,
  passGoAmount: 200,
  bankerlessWithdrawal: true,
  anonymousBalances: true
};

// OYUN TEMİZLEME MEKANİZMASI (GARBAGE COLLECTOR)
// Herkes çıksa bile oyun 24 saat boyunca hafızada kalır.
const MAX_IDLE_TIME = 24 * 60 * 60 * 1000; // 24 Saat

setInterval(() => {
  const now = Date.now();
  for (const [gameId, game] of games.entries()) {
    // Son işlem zamanını kontrol et (yoksa oluşturulma zamanı)
    const lastActivity = game.lastActivity || game.createdAt;
    
    if (now - lastActivity > MAX_IDLE_TIME) {
      console.log(`[GC] Oyun zaman aşımına uğradı ve silindi: ${gameId}`);
      games.delete(gameId);
    }
  }
}, 60 * 60 * 1000); // Her saat başı kontrol et

/**
 * @typedef {Object} Player
 * @property {string} id - socket.id
 * @property {string} username
 * @property {number} balance
 * @property {string} gameId
 * @property {boolean} isConnected
 * @property {number[]} passGoHistory
 */

/**
 * @typedef {Object} GameSettings
 * @property {number} startingBalance
 * @property {number} passGoAmount
 * @property {boolean} bankerlessWithdrawal
 * @property {boolean} anonymousBalances
 */

/**
 * @typedef {Object} TransactionLog
 * @property {string} id
 * @property {'PLAYER_TO_PLAYER'|'TO_BANK'|'FROM_BANK'|'PASS_GO'} type
 * @property {string|null} from
 * @property {string|null} to
 * @property {number} amount
 * @property {number} timestamp
 */

/**
 * @typedef {Object} Game
 * @property {string} id
 * @property {string} hostId
 * @property {string} originalHostUsername
 * @property {Object.<string, Player>} players
 * @property {'waiting'|'in-progress'|'finished'} status
 * @property {GameSettings} settings
 * @property {number} createdAt
 * @property {number} lastActivity
 * @property {TransactionLog[]} transactionLogs
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLocalNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && net.internal === false) return net.address;
    }
  }
  return null;
}

// Oyun üzerinde işlem yapıldığında süresini uzatır
function touchGame(game) {
  if (game) game.lastActivity = Date.now();
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: number } | { ok: false, code: string, message: string }}
 */
function parseAmount(raw) {
  if (raw == null) return { ok: false, code: 'INVALID_AMOUNT', message: 'Amount is required' };
  if (typeof raw === 'string' && raw.trim() === '') return { ok: false, code: 'INVALID_AMOUNT', message: 'Amount is required' };
  const n = Number(raw);
  if (Number.isNaN(n)) return { ok: false, code: 'INVALID_AMOUNT', message: 'Amount must be a number' };
  if (!Number.isFinite(n)) return { ok: false, code: 'INVALID_AMOUNT', message: 'Amount must be finite' };
  if (!Number.isInteger(n)) return { ok: false, code: 'INVALID_AMOUNT', message: 'Amount must be a whole number' };
  if (n <= 0) return { ok: false, code: 'INVALID_AMOUNT', message: 'Amount must be positive' };
  if (!Number.isSafeInteger(n)) return { ok: false, code: 'INVALID_AMOUNT', message: 'Amount too large' };
  return { ok: true, value: n };
}

/**
 * @param {Partial<GameSettings>} [raw]
 * @returns {GameSettings}
 */
function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  if (raw.startingBalance != null) {
    const r = parseAmount(raw.startingBalance);
    s.startingBalance = r.ok ? r.value : DEFAULT_SETTINGS.startingBalance;
  }
  if (raw.passGoAmount != null) {
    const r = parseAmount(raw.passGoAmount);
    s.passGoAmount = r.ok ? r.value : DEFAULT_SETTINGS.passGoAmount;
  }
  if (typeof raw.bankerlessWithdrawal === 'boolean') s.bankerlessWithdrawal = raw.bankerlessWithdrawal;
  else if (typeof raw.bankerLessWithdrawals === 'boolean') s.bankerlessWithdrawal = raw.bankerLessWithdrawals;
  if (typeof raw.anonymousBalances === 'boolean') s.anonymousBalances = raw.anonymousBalances;
  return s;
}

function emitTransactionError(socket, code, message) {
  socket.emit('transactionError', { code, message });
}

/**
 * @param {Game} game
 * @param {'PLAYER_TO_PLAYER'|'TO_BANK'|'FROM_BANK'|'PASS_GO'} type
 * @param {string|null} from
 * @param {string|null} to
 * @param {number} amount
 */
function addTransactionLog(game, type, from, to, amount) {
  const log = {
    id: crypto.randomUUID(),
    type,
    from,
    to,
    amount,
    timestamp: Date.now()
  };
  game.transactionLogs.push(log);
  // Maintain FIFO: keep only last 100 entries
  if (game.transactionLogs.length > 100) {
    game.transactionLogs = game.transactionLogs.slice(-100);
  }
}

const BALANCE_BUCKETS = [
  [100000, '< ₩100K'],
  [500000, '< ₩500K'],
  [1000000, '< ₩1M'],
  [1500000, '< ₩1.5M'],
  [3000000, '< ₩3M'],
  [5000000, '< ₩5M'],
  [7000000, '< ₩7M'],
  [10000000, '< ₩10M'],
];
function bucketBalance(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return '< ₩100K';
  for (const [limit, label] of BALANCE_BUCKETS) {
    if (n < limit) return label;
  }
  return '≥ ₩10M';
}

/**
 * @param {Object.<string, Player>} playersMap
 * @param {string} viewerSocketId
 * @param {boolean} anonymousBalances
 * @returns {Object[]} player objects: self has balance, others have balanceBucket only (never balance)
 */
function personalizePlayers(playersMap, viewerSocketId, anonymousBalances = true) {
  return Object.entries(playersMap).map(([sid, p]) => {
    const { balance, passGoHistory, ...rest } = p;
    if (sid === viewerSocketId) {
      return { ...rest, balance: Number.isFinite(Number(balance)) && balance >= 0 ? Number(balance) : 0 };
    }
    // Show actual balance if anonymous balances are disabled
    if (!anonymousBalances) {
      return { ...rest, balance: Number.isFinite(Number(balance)) && balance >= 0 ? Number(balance) : 0 };
    }
    // Show bucket balance if anonymous balances are enabled (default)
    return { ...rest, balanceBucket: bucketBalance(balance) };
  });
}

/**
 * @param {string} gameId
 */
async function emitUpdatePlayers(gameId) {
  const g = games.get(gameId);
  if (!g) return;
  const settings = g.settings || { ...DEFAULT_SETTINGS };
  const sockets = await io.in(gameId).fetchSockets();
  for (const s of sockets) {
    s.emit('updatePlayers', {
      players: personalizePlayers(g.players, s.id, settings.anonymousBalances),
      hostId: g.hostId,
      settings,
      status: g.status,
    });
  }
  if (g.status === 'waiting') broadcastLobbyGames();
}

/**
 * @param {string} gameId
 */
async function emitGameStateUpdate(gameId) {
  const g = games.get(gameId);
  if (!g) return;
  const settings = g.settings || { ...DEFAULT_SETTINGS };
  const sockets = await io.in(gameId).fetchSockets();
  for (const s of sockets) {
    s.emit('gameStateUpdate', { gameId, players: personalizePlayers(g.players, s.id, settings.anonymousBalances) });
  }
}

/**
 * @param {string} gameId
 */
function emitTransactionLogUpdate(gameId) {
  const g = games.get(gameId);
  if (!g) return;
  io.to(gameId).emit('transactionLogUpdate', { gameId, logs: g.transactionLogs });
}

function generateGameId() {
  return 'G' + crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function calculateGameStatistics(game) {
  const logs = game.transactionLogs || [];
  const players = game.players || {};

  // Initialize statistics
  const stats = {
    mostBankWithdrawals: { player: null, amount: 0 },
    mostBankDeposits: { player: null, amount: 0 },
    mostGenerous: { player: null, amount: 0 },
    mostReceived: { player: null, amount: 0 },
    largestTransfer: { from: null, to: null, amount: 0 },
    mostBroke: { player: null, balance: Infinity },
    mostPassGo: { player: null, count: 0 },
    totalMoneyTransferred: 0,
    funnyTexts: getRandomFunnyTexts()
  };

  // Track per-player stats
  const playerStats = {};

  // Initialize player stats
  Object.values(players).forEach(p => {
    playerStats[p.username] = {
      bankWithdrawals: 0,
      bankDeposits: 0,
      given: 0,
      received: 0,
      passGoCount: 0
    };
  });

  // Process transaction logs
  logs.forEach(log => {
    stats.totalMoneyTransferred += log.amount;

    switch (log.type) {
      case 'FROM_BANK':
        if (playerStats[log.to]) {
          playerStats[log.to].bankWithdrawals += log.amount;
          if (playerStats[log.to].bankWithdrawals > stats.mostBankWithdrawals.amount) {
            stats.mostBankWithdrawals = { player: log.to, amount: playerStats[log.to].bankWithdrawals };
          }
        }
        break;

      case 'TO_BANK':
        if (playerStats[log.from]) {
          playerStats[log.from].bankDeposits += log.amount;
          if (playerStats[log.from].bankDeposits > stats.mostBankDeposits.amount) {
            stats.mostBankDeposits = { player: log.from, amount: playerStats[log.from].bankDeposits };
          }
        }
        break;

      case 'PLAYER_TO_PLAYER':
        if (playerStats[log.from]) {
          playerStats[log.from].given += log.amount;
          if (playerStats[log.from].given > stats.mostGenerous.amount) {
            stats.mostGenerous = { player: log.from, amount: playerStats[log.from].given };
          }
        }
        if (playerStats[log.to]) {
          playerStats[log.to].received += log.amount;
          if (playerStats[log.to].received > stats.mostReceived.amount) {
            stats.mostReceived = { player: log.to, amount: playerStats[log.to].received };
          }
        }
        if (log.amount > stats.largestTransfer.amount) {
          stats.largestTransfer = { from: log.from, to: log.to, amount: log.amount };
        }
        break;

      case 'PASS_GO':
        if (playerStats[log.to]) {
          playerStats[log.to].passGoCount += 1;
          if (playerStats[log.to].passGoCount > stats.mostPassGo.count) {
            stats.mostPassGo = { player: log.to, count: playerStats[log.to].passGoCount };
          }
        }
        break;
    }
  });

  // Find most broke player
  Object.entries(players).forEach(([id, p]) => {
    if (p.balance < stats.mostBroke.balance) {
      stats.mostBroke = { player: p.username, balance: p.balance };
    }
  });

  return stats;
}

function getRandomFunnyTexts() {
  const funnyTexts = [
    "Esenyurt'ta topraktan girip 2+1 daire kaporası verilirdi.",
    "Yurt dışından gelen telefonun IMEI kayıt ücreti acımadan ödenirdi.",
    "Arnavutköy'de kanal manzaralı tarlaya hissedar olunurdu.",
    "Bedelli askerlik parası yatırılıp şafak saymadan teskere alınırdı.",
    "Borsa İstanbul'da tüm parayla halka arza girilip batılırdı.",
    "Silivri'de yazlık niyetine prefabrik ev kondurmalık arsa bakılırdı.",
    "İspark borçlarının tamamı kapatılıp otopark görevlisiyle helalleşilirdi.",
    "Bodrum Türkbükü’nde şezlong kiralanıp ünlülerin yanına havlu atılırdı.",
    "Her gün et döner yenilir, Fiat Egea 1.6 multijetle karı koca gezilirdi."
  ];
  // Shuffle array and pick 3-5 random items
  const shuffled = [...funnyTexts].sort(() => 0.5 - Math.random());
  const count = Math.floor(Math.random() * 3) + 3; // 3, 4, or 5
  return shuffled.slice(0, count);
}

function getLobbyGamesList() {
  return Array.from(games.values())
    .filter(g => g.status === 'waiting')
    .map(g => {
      const host = Object.values(g.players).find(p => p.id === g.hostId);
      return {
        id: g.id,
        hostId: g.hostId,
        hostUsername: host?.username ?? '—',
        playerCount: Object.keys(g.players).length,
        status: g.status
      };
    });
}

function broadcastLobbyGames() {
  io.to('lobby').emit('lobbyGames', { games: getLobbyGamesList() });
}

/**
 * @param {string} socketId
 * @returns {Game | null}
 */
function findGameBySocketId(socketId) {
  for (const g of games.values()) {
    if (g.players[socketId]) return g;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------

// Global player storage (in production, use a database)
if (!global.players) global.players = new Map();

io.on('connection', (socket) => {
  // ----- login (UUID-based player authentication) -----
  socket.on('login', ({ username }) => {
    if (!username || typeof username !== 'string') {
      socket.emit('loginError', { message: 'Username is required' });
      return;
    }

    const playerId = crypto.randomUUID();
    const playerData = {
      playerId,
      username: String(username).trim(),
      createdAt: Date.now()
    };

    // Store player data globally
    global.players.set(playerId, playerData);

    socket.data.playerId = playerId;
    socket.data.username = playerData.username;

    socket.emit('loginSuccess', {
      playerId,
      username: playerData.username
    });
  });

  // ----- createGame -----
  socket.on('createGame', ({ playerId, settings: rawSettings }) => {
    // Validate playerId
    if (!playerId || !global.players?.has(playerId)) {
      socket.emit('createGameError', { message: 'Invalid player session. Please login again.' });
      return;
    }

    const playerData = global.players.get(playerId);
    const settings = normalizeSettings(rawSettings);
    const gameId = generateGameId();
    const player = {
      id: socket.id,
      playerId, // Store UUID for secure identification
      username: playerData.username,
      balance: settings.startingBalance,
      gameId,
      isConnected: true,
      passGoHistory: [],
    };
    const game = {
      id: gameId,
      hostId: socket.id,
      originalHostUsername: player.username,
      players: { [socket.id]: player },
      status: 'waiting',
      settings,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      transactionLogs: []
    };
    games.set(gameId, game);
    socket.data.gameId = gameId;
    socket.join(gameId);

    socket.emit('createGameSuccess', { gameId, game: { ...game, players: personalizePlayers(game.players, socket.id, settings.anonymousBalances) } });
    emitUpdatePlayers(gameId);
  });

  // ----- joinGame (UUID-based secure reconnection) -----
  socket.on('joinGame', ({ gameId, playerId }) => {
    // Validate playerId
    if (!playerId || !global.players?.has(playerId)) {
      socket.emit('joinGameError', { message: 'Invalid player session. Please login again.' });
      return;
    }

    const playerData = global.players.get(playerId);
    const g = games.get(gameId);
    if (!g) {
      socket.emit('joinGameError', { message: 'Game not found' });
      return;
    }
    if (!g.settings) g.settings = { ...DEFAULT_SETTINGS };

    // Oyunu canlı tut
    touchGame(g);

    const existing = Object.entries(g.players).find(([, p]) => p.playerId === playerId);
    let player;

    if (existing) {
      const [oldSid, p] = existing;
      
      // Kullanıcı zaten var.
      // EĞER socket ID farklıysa (yeni sekme/tarayıcı), eski bağlantıyı "Zombie" olarak kabul edip öldürüyoruz.
      // "Username taken" hatası vermiyoruz, oturumu devralıyoruz.
      if (oldSid !== socket.id) {
        // Eski soketi bulup odadan atalım ve bağlantısını keselim
        const oldSocket = io.sockets.sockets.get(oldSid);
        if (oldSocket) {
          oldSocket.leave(gameId);
          oldSocket.disconnect(true);
        }
      }

      // Eski oyuncu kaydını sil
      delete g.players[oldSid];

      // Verileri koruyarak yeni socket ID ile oyuncuyu oluştur
      const balance = typeof p.balance === 'number' && p.balance >= 0 ? p.balance : g.settings.startingBalance;
      const passGoHistory = Array.isArray(p.passGoHistory) ? p.passGoHistory : [];
      
      player = {
        id: socket.id,
        playerId, // Store UUID for secure identification
        username: playerData.username,
        balance,
        gameId,
        isConnected: true,
        passGoHistory
      };

      // Eğer orijinal host geri geldiyse yetkiyi geri ver
      if (playerData.username === g.originalHostUsername) {
        g.hostId = socket.id;
      }

    } else {
      // Yeni oyuncu - sadece waiting durumunda izin ver
      if (g.status !== 'waiting') {
        socket.emit('joinGameError', { message: 'Game is not accepting new players (In Progress)' });
        return;
      }
      player = {
        id: socket.id,
        playerId, // Store UUID for secure identification
        username: playerData.username,
        balance: g.settings.startingBalance,
        gameId,
        isConnected: true,
        passGoHistory: []
      };
    }

    g.players[socket.id] = player;
    socket.data.gameId = gameId;
    socket.join(gameId);

    socket.emit('joinGameSuccess', { gameId, game: { ...g, players: personalizePlayers(g.players, socket.id, g.settings.anonymousBalances), hostId: g.hostId, transactionLogs: g.transactionLogs } });
    emitUpdatePlayers(gameId);
  });

  // ----- getLobbyGames -----
  socket.on('getLobbyGames', () => {
    socket.emit('lobbyGames', { games: getLobbyGamesList() });
  });

  // ----- joinLobby -----
  socket.on('joinLobby', () => {
    socket.join('lobby');
    socket.emit('lobbyGames', { games: getLobbyGamesList() });
  });

  // ----- leaveLobby -----
  socket.on('leaveLobby', () => {
    socket.leave('lobby');
  });

  // ----- leaveGame (Hata Düzeltildi: Oyun silinmiyor) -----
  socket.on('leaveGame', () => {
    const gameId = socket.data.gameId;
    if (!gameId) {
      socket.emit('leaveGameSuccess');
      return;
    }
    const g = games.get(gameId);
    if (!g) {
      delete socket.data.gameId;
      socket.emit('leaveGameSuccess');
      return;
    }

    touchGame(g);
    
    // Kullanıcıyı silmek yerine disconnect olarak işaretle
    // (Böylece geri dönerse bakiyesi korunur)
    const p = g.players[socket.id];
    if (p) {
      p.isConnected = false;
    }
    delete socket.data.gameId;
    socket.leave(gameId);

    // Host devri mantığı
    const remainingConnected = Object.values(g.players).filter(pl => pl.isConnected);
    if (g.hostId === socket.id && remainingConnected.length > 0) {
      // Orijinal host bağlıysa ona ver, yoksa ilk sıradakine
      const nextHost = Object.values(g.players).find(pl => pl.username === g.originalHostUsername && pl.isConnected) 
                    || remainingConnected[0];
      if (nextHost) g.hostId = nextHost.id;
    }

    // ARTIK OYUNU SİLMİYORUZ (remainingPlayers === 0 olsa bile).
    // GC (Garbage Collector) 24 saat sonra silecek.

    emitUpdatePlayers(gameId);
    socket.emit('leaveGameSuccess');
  });

  // ----- updateGameSettings -----
  socket.on('updateGameSettings', ({ gameId, settings: raw }) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:updateGameSettings',message:'updateGameSettings called',data:{gameId,settings:raw,socketId:socket.id,gameIdFromSocket:socket.data.gameId},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion

    if (socket.data.gameId !== gameId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:updateGameSettings',message:'Socket gameId validation failed',data:{socketGameId:socket.data.gameId,requestedGameId:gameId},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      return;
    }
    const g = games.get(gameId);
    if (!g || g.hostId !== socket.id || g.status !== 'waiting') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:updateGameSettings',message:'Host authorization failed',data:{gameExists:!!g,hostId:g?.hostId,socketId:socket.id,isHost:g?.hostId===socket.id,gameStatus:g?.status,requiredStatus:'waiting'},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      return;
    }

    touchGame(g);
    g.settings = normalizeSettings({ ...g.settings, ...raw });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:updateGameSettings',message:'Settings updated successfully',data:{oldSettings:g.settings,newSettings:raw},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion

    emitUpdatePlayers(gameId);
  });

  // ----- startGame -----
  socket.on('startGame', ({ gameId }) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:startGame',message:'startGame called',data:{gameId,socketId:socket.id,gameIdFromSocket:socket.data.gameId},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    if (socket.data.gameId !== gameId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:startGame',message:'Socket gameId validation failed',data:{socketGameId:socket.data.gameId,requestedGameId:gameId},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      return;
    }
    const g = games.get(gameId);
    if (!g || g.hostId !== socket.id || g.status !== 'waiting') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:startGame',message:'Host authorization failed',data:{gameExists:!!g,hostId:g?.hostId,socketId:socket.id,isHost:g?.hostId===socket.id,gameStatus:g?.status,requiredStatus:'waiting'},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      return;
    }

    touchGame(g);
    g.status = 'in-progress';

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:startGame',message:'Game started successfully',data:{gameId,oldStatus:'waiting',newStatus:'in-progress'},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    io.to(gameId).emit('gameStarted', { gameId, settings: g.settings || { ...DEFAULT_SETTINGS } });
    emitUpdatePlayers(gameId);
  });

  // ----- finishGame -----
  socket.on('finishGame', ({ gameId }) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:finishGame',message:'finishGame called',data:{gameId,socketId:socket.id,gameIdFromSocket:socket.data.gameId},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    if (socket.data.gameId !== gameId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:finishGame',message:'Socket gameId validation failed',data:{socketGameId:socket.data.gameId,requestedGameId:gameId},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      return;
    }
    const g = games.get(gameId);
    if (!g || g.hostId !== socket.id || g.status !== 'in-progress') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:finishGame',message:'Host authorization failed',data:{gameExists:!!g,hostId:g?.hostId,socketId:socket.id,isHost:g?.hostId===socket.id,gameStatus:g?.status,requiredStatus:'in-progress'},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      return;
    }

    touchGame(g);
    const statistics = calculateGameStatistics(g);
    g.status = 'finished';

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:finishGame',message:'Game finished successfully',data:{gameId,oldStatus:'in-progress',newStatus:'finished'},timestamp:Date.now(),sessionId:'debug-session',runId:'auth-test',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    io.to(gameId).emit('gameFinished', { gameId, statistics });
    emitUpdatePlayers(gameId);
  });

  // ----- transferToPlayer -----
  socket.on('transferToPlayer', ({ gameId, fromPlayerId, toPlayerId, amount }) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:transferToPlayer',message:'transferToPlayer called',data:{gameId,fromPlayerId,toPlayerId,amount,socketId:socket.id,gameIdFromSocket:socket.data.gameId},timestamp:Date.now(),sessionId:'debug-session',runId:'server-validation-test',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

    if (socket.data.gameId !== gameId || fromPlayerId !== socket.id) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:transferToPlayer',message:'Socket validation failed',data:{socketGameId:socket.data.gameId,requestedGameId:gameId,fromPlayerId,toPlayerId},timestamp:Date.now(),sessionId:'debug-session',runId:'server-validation-test',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      return;
    }
    const g = games.get(gameId);
    if (!g || g.status !== 'in-progress') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:transferToPlayer',message:'Game validation failed',data:{gameExists:!!g,gameStatus:g?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'server-validation-test',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      return;
    }

    touchGame(g);

    const from = g.players[fromPlayerId];
    const to = g.players[toPlayerId];
    if (!from || !to || fromPlayerId === toPlayerId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:transferToPlayer',message:'Player validation failed',data:{fromExists:!!from,toExists:!!to,samePlayer:fromPlayerId===toPlayerId,fromBalance:from?.balance,toBalance:to?.balance},timestamp:Date.now(),sessionId:'debug-session',runId:'server-validation-test',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      return;
    }

    const amt = parseAmount(amount);
    if (!amt.ok) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:transferToPlayer',message:'Amount validation failed',data:{amount,parseResult:amt},timestamp:Date.now(),sessionId:'debug-session',runId:'server-validation-test',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      emitTransactionError(socket, amt.code, amt.message);
      return;
    }
    const fromBal = Number(from.balance);
    const fromCur = (Number.isFinite(fromBal) && fromBal >= 0) ? fromBal : (g.settings?.startingBalance ?? DEFAULT_SETTINGS.startingBalance);
    if (fromCur < amt.value) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:transferToPlayer',message:'Insufficient funds check triggered',data:{fromCurrentBalance:fromCur,requestedAmount:amt.value,fromUsername:from.username},timestamp:Date.now(),sessionId:'debug-session',runId:'server-validation-test',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      emitTransactionError(socket, 'INSUFFICIENT_FUNDS', 'Yetersiz bakiye.');
      return;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/49a0a682-9233-4a20-89fb-924487a2ba86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/index.js:transferToPlayer',message:'Transfer successful',data:{fromUsername:from.username,toUsername:to.username,amount:amt.value,fromBalanceBefore:fromCur,fromBalanceAfter:fromCur-amt.value,toBalanceBefore:to.balance,toBalanceAfter:to.balance+amt.value},timestamp:Date.now(),sessionId:'debug-session',runId:'server-validation-test',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

    from.balance = fromCur - amt.value;
    to.balance = (Number.isFinite(Number(to.balance)) && to.balance >= 0 ? Number(to.balance) : 0) + amt.value;
    addTransactionLog(g, 'PLAYER_TO_PLAYER', from.username, to.username, amt.value);
    emitGameStateUpdate(gameId);
    emitTransactionLogUpdate(gameId);
  });

  // ----- transferToBank -----
  socket.on('transferToBank', ({ gameId, fromPlayerId, amount }) => {
    if (socket.data.gameId !== gameId || fromPlayerId !== socket.id) return;
    const g = games.get(gameId);
    if (!g || g.status !== 'in-progress') return;

    touchGame(g);
    
    const from = g.players[fromPlayerId];
    if (!from) return;

    const amt = parseAmount(amount);
    if (!amt.ok) return;

    const fromBal = Number(from.balance);
    const fromCur = (Number.isFinite(fromBal) && fromBal >= 0) ? fromBal : (g.settings?.startingBalance ?? DEFAULT_SETTINGS.startingBalance);
    if (fromCur < amt.value) {
      emitTransactionError(socket, 'INSUFFICIENT_FUNDS', 'Yetersiz bakiye');
      return;
    }
    from.balance = fromCur - amt.value;
    addTransactionLog(g, 'TO_BANK', from.username, null, amt.value);
    emitGameStateUpdate(gameId);
    emitTransactionLogUpdate(gameId);
  });

  // ----- transferFromBank -----
  socket.on('transferFromBank', ({ gameId, toPlayerId, amount }) => {
    if (socket.data.gameId !== gameId || toPlayerId !== socket.id) return;
    const g = games.get(gameId);
    if (!g || g.status !== 'in-progress') return;

    touchGame(g);

    const to = g.players[toPlayerId];
    if (!to) return;
    const amt = parseAmount(amount);
    if (!amt.ok) return;

    const bankerless = (g.settings && g.settings.bankerlessWithdrawal) !== false;
    if (!bankerless) {
      emitTransactionError(socket, 'UNAUTHORIZED', 'Bank withdrawals are disabled in this game');
      return;
    }
    to.balance = (Number.isFinite(Number(to.balance)) && to.balance >= 0 ? Number(to.balance) : 0) + amt.value;
    addTransactionLog(g, 'FROM_BANK', null, to.username, amt.value);
    emitGameStateUpdate(gameId);
    emitTransactionLogUpdate(gameId);
  });

  // ----- passGo -----
  socket.on('passGo', ({ gameId, playerId }) => {
    if (socket.data.gameId !== gameId || playerId !== socket.id) return;
    const g = games.get(gameId);
    if (!g || g.status !== 'in-progress') return;

    touchGame(g);

    const p = g.players[playerId];
    if (!p) return;

    if (!Array.isArray(p.passGoHistory)) p.passGoHistory = [];
    const now = Date.now();
    const window = 90 * 1000;
    p.passGoHistory = p.passGoHistory.filter(t => now - t < window);
    if (p.passGoHistory.length >= 2) {
      emitTransactionError(socket, 'PASS_GO_RATE_LIMIT', 'Başlangıç noktasından 90 saniye içinde ancak 2 kez geçilebilir.');
      return;
    }
    const passAmount = (g.settings && typeof g.settings.passGoAmount === 'number') ? g.settings.passGoAmount : DEFAULT_SETTINGS.passGoAmount;
    p.balance = (Number.isFinite(Number(p.balance)) && p.balance >= 0 ? Number(p.balance) : 0) + passAmount;
    p.passGoHistory.push(now);
    addTransactionLog(g, 'PASS_GO', null, p.username, passAmount);
    emitGameStateUpdate(gameId);
    emitTransactionLogUpdate(gameId);
  });

  // ----- disconnect (Hata Düzeltildi: Oyun silinmiyor) -----
  socket.on('disconnect', () => {
    const g = findGameBySocketId(socket.id);
    if (g) {
      touchGame(g);
      const p = g.players[socket.id];
      // Eğer joinGame sırasında bu ID silindiyse p undefined olabilir, kontrol et.
      if (p) {
        p.isConnected = false;
        // Oyunu silme, sadece durumu bildir.
        emitUpdatePlayers(g.id);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// HTTP & startup
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalNetworkIP();
  console.log(`\n  Server running at:`);
  console.log(`  - Local:   http://localhost:${PORT}`);
  if (localIP) {
    console.log(`  - Network: http://${localIP}:${PORT}  (use this from your mobile)\n`);
  } else {
    console.log(`  - Network: (no external interface found)\n`);
  }
});
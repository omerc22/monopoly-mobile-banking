Have you ever been about to play Monopoly game and realized that your electronic banking device, which you haven't used in years, is broken? We have. That's why I decided to have an AI agent do this project.

# Digital Banking Assistant

![AI Generated](https://img.shields.io/badge/Code-AI%20Generated-blueviolet?style=for-the-badge)

**This project is made by AI assistant for special purpose, so it does not reflect my software engineering skills.**

A digital banking companion app for the physical Monopoly board game. Replace paper money with secure, real-time digital transactions.

![1](https://i.imgur.com/wg7cD43.jpeg)



## How to Play

1. Access the Web Page: Every player connects to the website via their mobile phones.
2. Choose Username: Players select a username to identify themselves in the game.
3. Host a Lobby: A moderator creates the game lobby and adjusts the initial match settings.
4. Join the Session: Players enter the game using a unique room code or by selecting the lobby from the menu.
5. Start the Game: Once all players have joined, the host initiates the match.

### Features

- **Fully Responsive**: Optimized for mobile devices
- **Real-time Transactions**: Instant money transfers between players and the bank
- **Secure Authentication**: UUID-based player identification prevents account spoofing
- **Anonymous Balances**: Optional privacy feature to hide exact balances from other players
- **Vibration Alerts**: Phone vibrates when you go bankrupt
- **Logging**: Transaction history
- **Connection Recovery**: Automatically reconnect and resume your session if disconnected
- **Multi-language Support**: English, Turkish, and French interfaces
- **Game Statistics**: End-game analytics and leaderboards

## Installation

### Prerequisites

- Node.js 18+ and npm
- Modern web browser

### Dependencies

#### Server
- `express`: Web framework
- `socket.io`: Real-time communication
- `socket.io-client`: Socket client for testing

#### Client
- `react`: UI framework
- `react-dom`: React DOM rendering
- `socket.io-client`: Socket client for server communication

### Setup

```bash
# Clone the repository
git clone https://github.com/omerc22/monopoly-mobile-banking.git

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

```

## Running the Application

### Development Mode

**Terminal 1 - Server (port 3000):**
```bash
cd server && npm run dev
```

**Terminal 2 - Client (port 5173):**
```bash
cd client && npm run dev
```

### Production Build

```bash
# Build client
cd client && npm run build

# Start server
cd ../server && npm start
```

## Mobile Access

1. Ensure all devices are on the same Wi-Fi network
2. The server startup will display your local network IP (e.g., `http://192.168.1.100:3000`)
3. Open `http://[network-ip]:5173` on mobile devices
4. Enter a username to join the game

## Frequently Asked Questions

### Is this the official Monopoly game?
No. This project is an unofficial, fan-made companion application designed to apply the banking process of the physical board game. You still need the physical Monopoly board, dice, cards, and pieces to play.

### What happens if my phone screen locks?
Phones may disconnect due to power saving features, but don't worry. Refreshing the page will automatically reconnect you with your money intact.

### How do I handle property transactions?
- **Buying mortgaged property**: Use the "Pay Bank" button
- **Buying from another player**: Click the player's name.

### What does "Anonymous Balances" do?
When enabled (default), other players see approximate balance ranges instead of exact amounts. When disabled, everyone sees real balances. The host can toggle this setting before creating the game.

### What if my phone dies and I switch to another device?
The system identifies you by a browser-specific code. Switching devices requires starting fresh. Bring your physical game pieces with you when switching devices.

## Legal Disclaimer

This project is an unofficial, fan-made companion application designed to facilitate the banking process of the physical board game.

The MONOPOLY name and logo, the distinctive design of the game board, the four corner squares, as well as each of the distinctive elements of the board, cards, and the playing pieces are trademarks of Hasbro for its property trading game and game equipment.

This software is not affiliated with, endorsed, sponsored, or specifically approved by Hasbro. All trademarks and copyrights are the property of their respective owners. This project is created solely for educational and personal entertainment purposes.

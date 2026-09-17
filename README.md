<div align="center">

![CS2Coach Logo](./apps/web/public/logo.svg)

# 🎯 CS2 AI COACH

### Real-time tactical coaching for Counter-Strike 2 via Telegram

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://telegram.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

[Features](#-features) • [Demo](#-demo) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Deployment](#-deployment) • [Contributing](#-contributing)

</div>

---

## 📖 Overview

**CS2 AI Coach** is a production-ready Telegram Mini App that provides live tactical coaching for Counter-Strike 2 players. Connect your FACEIT account, join a match, and receive AI-powered strategic recommendations in real-time through push notifications.

### ✨ Key Highlights

- 🎮 **Live Match Detection** - Automatically detects FACEIT matches
- 🤖 **Dual Intelligence** - Groq AI with deterministic fallback engine
- 📱 **Telegram Integration** - Native Mini App experience
- 🔒 **Privacy First** - HMAC verification, AES-256-GCM encryption
- 💰 **100% Free Hosting** - Runs on free tiers (Render, Neon, Groq)
- 🌐 **No Fake Data** - Real game data only (see [Data Policy](#-data-policy))

---

## 🚀 Features

### For Players
- **Real-time Tactical Calls** - Get strategic recommendations during live matches
- **Multi-language Support** - English, Russian, Uzbek
- **Demo Mode** - Test the system without a live match
- **Match History** - Review past games and tactical decisions
- **WebSocket Streaming** - Low-latency updates (<500ms)

### Technical Features
- **Deterministic Fallback** - Never rely solely on AI; rules engine always available
- **Smart Deduplication** - Cooldown system prevents spam
- **Economy Tracking** - Intelligent buy recommendations
- **Opponent Modeling** - Learn enemy patterns
- **State Management** - Hash-based change detection

---

## 🎬 Demo

> 🚧 **Screenshot Coming Soon** - Building the app live!

```
┌─────────────────────────────────┐
│  CS2 COACH                    ● │
├─────────────────────────────────┤
│                                 │
│  🎯 FAST_A                      │
│  ━━━━━━━━━━━━━━━━━━━━━          │
│  High Confidence • AI           │
│                                 │
│  Execute fast A site rush.     │
│  Their economy is weak.         │
│                                 │
│  👤 player1 (Entry)             │
│  → Flash long, rush site        │
│                                 │
│  📊 Signals                     │
│  • Enemy eco: WEAK              │
│  • Our money: $4200 avg         │
│  • Round: 3 • T • 1:1           │
│                                 │
└─────────────────────────────────┘
```

---

## 📦 Tech Stack

<table>
<tr>
<td><strong>Layer</strong></td>
<td><strong>Technology</strong></td>
<td><strong>Why</strong></td>
</tr>
<tr>
<td>Frontend</td>
<td>React + TypeScript + Vite</td>
<td>Fast, type-safe Mini App</td>
</tr>
<tr>
<td>Backend</td>
<td>Node.js + Fastify</td>
<td>High-performance API</td>
</tr>
<tr>
<td>Database</td>
<td>Neon PostgreSQL</td>
<td>Serverless, free tier</td>
</tr>
<tr>
<td>AI</td>
<td>Groq</td>
<td>Ultra-fast inference</td>
</tr>
<tr>
<td>Fallback</td>
<td>Deterministic Engine</td>
<td>No API dependency</td>
</tr>
<tr>
<td>Game Data</td>
<td>FACEIT API v4</td>
<td>Official match data</td>
</tr>
<tr>
<td>Bot Framework</td>
<td>grammY</td>
<td>Modern Telegram bot API</td>
</tr>
<tr>
<td>Hosting</td>
<td>Render Free</td>
<td>Zero-cost deployment</td>
</tr>
</table>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Mini App (React)                │
│                   WebSocket ↕ REST API                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Fastify API Server (Node.js)               │
│  ┌──────────────┬──────────────┬──────────────────────┐    │
│  │ Auth Routes  │ Match Routes │ WebSocket Manager    │    │
│  │ (HMAC, JWT)  │ (FACEIT API) │ (Real-time Streams)  │    │
│  └──────────────┴──────────────┴──────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Game State Pipeline                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  FACEIT Webhook/Poll → GameEventBus                 │   │
│  │         ↓                                            │   │
│  │  MatchStateEngine (Round, Economy, Stats)          │   │
│  │         ↓                                            │   │
│  │  AiCoordinator (Dedup, Cooldown, Queue)            │   │
│  │         ↓                                            │   │
│  │  ┌──────────┐        ┌─────────────────────┐       │   │
│  │  │ Groq AI  │   OR   │ Tactical Engine     │       │   │
│  │  │ (Primary)│        │ (Deterministic)     │       │   │
│  │  └──────────┘        └─────────────────────┘       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│               Neon PostgreSQL (User, Match Data)            │
└─────────────────────────────────────────────────────────────┘
```

### 📁 Monorepo Structure

```
cs2coach/
├── apps/
│   ├── api/              # Fastify REST API + WebSocket
│   ├── web/              # React Telegram Mini App
│   └── cloudflare-api/   # Edge function (optional)
├── bot/                  # grammY Telegram bot
├── packages/
│   ├── shared/           # Types, crypto, state-hash
│   ├── database/         # PostgreSQL schema & repos
│   ├── faceit/           # FACEIT API client
│   ├── game-state/       # State engines (Match, Round, Economy)
│   ├── tactical-engine/  # Deterministic tactical rules
│   └── ai/               # Groq client + coordinator
├── docs/                 # SPECIFICATION.txt (73 rules)
└── render.yaml           # One-click deployment
```

---

## 🎯 Quick Start

### Prerequisites

- **Node.js** 20+
- **PostgreSQL** (or free Neon account)
- **Telegram Bot Token** (from [@BotFather](https://t.me/botfather))
- **FACEIT API Key** (from [FACEIT Developer Portal](https://developers.faceit.com/))
- **Groq API Key** (optional, from [Groq](https://groq.com/))

### Installation

```bash
# Clone repository
git clone https://github.com/JASCOJI123/cs2coach.git
cd cs2coach

# Install dependencies
npm ci

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npm run migrate

# Start development servers
npm run dev:api    # API on http://localhost:8080
npm run dev:bot    # Telegram bot (long polling)
npm run dev:web    # Mini App on http://localhost:5173
```

### Testing

Open Telegram → message your bot → `/start` → **OPEN AI COACH**

---

## 🔐 Data Policy

> **The Golden Rule**: Never fabricate live game data.

- **No Simulation in Production** - Empty data shows "Waiting for live game data"
- **Demo Mode is Dev-Only** - Visible "DEMO" stripe, `demoMode: true` in state
- **Deterministic Fallback** - Rules engine uses only observed facts
- **Transparent AI Fallback** - UI shows when response is from AI vs rules

See [SPECIFICATION.txt §12](./docs/SPECIFICATION.txt) for full policy.

---

## ✅ Verification

All checks pass on clean checkout:

```bash
npm run typecheck   # ✓ TypeScript across all workspaces
npm run lint        # ✓ ESLint (0 warnings allowed)
npm run test        # ✓ Vitest (core engines + AI coordinator)
npm run build       # ✓ Production builds
```

### Test Coverage

- ✅ State hash consistency
- ✅ MatchStateEngine state transitions
- ✅ TacticalEngine deterministic output
- ✅ AiCoordinator deduplication & cooldown

---

## 🚀 Deployment

### Option 1: Render (Recommended)

1. **Fork this repo** to your GitHub account
2. **Create Neon database** → copy `DATABASE_URL`
3. **Deploy on Render**:
   - Click "New Blueprint Instance"
   - Connect your GitHub repo
   - Point to `render.yaml`
   - Fill environment variables
4. **Setup UptimeRobot** → monitor `/health` every 5 min

### Option 2: Manual

```bash
# Build production
npm run build
npm run build:web

# Deploy API + Bot to any Node.js host
# Deploy web/ to static hosting (Vercel, Netlify, Cloudflare Pages)

# Set environment variables
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=...
FACEIT_CLIENT_ID=...
GROQ_API_KEY=...
```

### Environment Variables

See `.env.example` for full list. Critical ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather |
| `FACEIT_CLIENT_ID` | ✅ | FACEIT OAuth app ID |
| `FACEIT_CLIENT_SECRET` | ✅ | FACEIT OAuth secret |
| `GROQ_API_KEY` | ⚠️ | Groq API key (optional, uses fallback) |
| `JWT_SECRET` | ✅ | Random string for JWT signing |
| `ENCRYPTION_KEY` | ✅ | 32-byte hex for AES-256-GCM |

---

## 🔒 Security

- **HMAC Verification** - Telegram initData validated before session creation
- **AES-256-GCM Encryption** - OAuth tokens encrypted at rest
- **Rate Limiting** - 120 requests/min per IP
- **CORS Allowlist** - Origin validation on all routes
- **JWT Sessions** - Short-lived tokens, no long-term storage

See [SPECIFICATION.txt §53](./docs/SPECIFICATION.txt) for security architecture.

---

## 🤝 Contributing

Contributions welcome! Please read our [Contributing Guidelines](./CONTRIBUTING.md) first.

### Development Scripts

```bash
npm run migrate           # Apply database migrations
npm run dev:api           # Start API in watch mode
npm run dev:bot           # Start bot in watch mode
npm run dev:web           # Start Mini App dev server
npm run test:watch        # Run tests in watch mode
npm run typecheck         # Type-check all workspaces
npm run lint              # Lint all files
npm run build             # Build all packages
npm run build:web         # Build Mini App for production
```

### Pull Request Process

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

- **FACEIT** for providing game data API
- **Groq** for ultra-fast AI inference
- **Telegram** for the Mini App platform
- **Neon** for serverless PostgreSQL
- **Render** for free hosting

---

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/JASCOJI123/cs2coach/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/JASCOJI123/cs2coach/discussions)
- 📧 **Email**: support@cs2coach.app (coming soon)
- 💬 **Telegram**: [@cs2coach_support](https://t.me/cs2coach_support) (coming soon)

---

<div align="center">

**Built with ❤️ by the CS2Coach team**

[⬆ Back to Top](#-cs2-ai-coach)

</div>

# Trading App V1 - Implementation Plan

## 1. Project Overview
- **Objective:** Implement a trading strategy application based on the "Opening High Breakout/Reversal" strategy.
- **Tech Stack:** Python (FastAPI) for backend, Next.js (React 19, TypeScript) for frontend.
- **Key Features:**
  - Real-time stock data feed (1-minute candles) via authenticated Upstox V2 API.
  - Strategy engine to trigger alerts at 09:16 AM based on 09:15 candle.
  - Role-Based Access Control (RBAC): Super Admin, Admin, Users.
  - Static IP Guard middleware (with localhost/IPv6/IPv4 support).
  - Integration with Telegram/Desktop notifications.
  - Institutional Trading Terminal UI with live status indicators, strategy triggers, and operator provisioning.

## 2. Tasks
- [x] Initialize Next.js project.
- [x] Initialize FastAPI project.
- [x] Set up `.env` with required API keys (Broker API, Upstox Token, Telegram API).
- [x] Implement Backend (FastAPI):
  - [x] RBAC (Users, Admins, Super Admins) models & auth.
  - [x] Static IP whitelisting middleware.
  - [x] Trading strategy logic & scheduler (09:16 AM Mon-Fri IST cron + on-demand `/strategy/trigger`).
  - [x] Telegram alert integration with payload formatting and safety encoding.
  - [x] Upstox API V2 connectivity and authentication verification.
- [x] Implement Frontend (Next.js):
  - [x] High-end dark institutional trading terminal design system (`globals.css`).
  - [x] Login/Auth portal with 1-click role presets.
  - [x] Live Strategy Monitor tab displaying 09:15 candle metrics, Breakout confirmation, Target (1:2 R:R), Stop Loss, and Risk.
  - [x] RBAC User Management tab for Super Admin & Admin to provision operators.
  - [x] System & Broker Diagnostics tab displaying live Upstox account verification and Static IP Whitelist status.
- [x] Test the pipeline:
  - [x] Live Headed Playwright E2E automation verifying login, strategy execution, user provisioning, and diagnostics.

## 3. Progress Updates
- Fully configured Upstox API credentials and verified active connection with Broker account (User ID: `4JBX7L`).
- Built complete backend API with SQLite database, password hashing, and token issuance.
- Built responsive, cyber-terminal trading desk UI with live IST clock and status telemetry.
- Configured and executed live Playwright headed automation on user's desktop screen.

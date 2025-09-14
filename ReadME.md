# Puppeteer Telegram Bot

This Telegram bot uses Puppeteer and Tesseract.js to automate account registration and login on target sites with trial code access control.

## Features

- Trial codes system (5 codes, single claim per code)
- User limits: max 20 total accounts per trial user; max 10 accounts per message
- Admin user with unlimited access and commands
- Input validation (username,password,fullname format)
- OCR captcha solving
- Puppeteer concurrency managed with p-queue
- Persistent storage via SQLite
- Logs all actions to file
- Friendly emoji-based UX with command menus
- Graceful shutdown with resource cleanup
- Fully deployable on Railway.app

## Setup

1. Clone repository
2. Copy `.env.example` as `.env` and fill your `BOT_TOKEN`
3. Run `npm install` to install dependencies
4. Start bot: `npm start`

## Usage

- `/start` for onboarding
- `/claim CODE` to claim a trial code
- `/register` or `/login` to submit accounts
- Submit accounts in message as lines: `username,password,fullname`
- Max 10 accounts per message, max 20 total per trial user
- Use `/status`, `/help`, `/usage` for info
- Admin commands for management and monitoring

## Deployment on Railway.app

- Add project to Railway
- Set environment variables (`BOT_TOKEN`, etc.)
- Use default start command `npm start`
- Ensure `logs/` folder writable for usage logs
- Railway persistent storage ensures SQLite DB and logs persist between restarts

---

## Optimization Notes

- Browser instances are pooled via a queue (`p-queue`) limiting concurrency
- Async file and DB operations used
- Batch validation before synchronizing Puppeteer calls
- Cleanup ensured on errors and shutdown signals
- Admin bypasses rate limits and queue waiting

---

## Support

For issues or contributions, please open an issue or PR in the repo.

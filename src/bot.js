require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const PQueue = require('p-queue').default;

const {
  isAdmin,
  hasClaimed,
  claimCodeForUser,
  canSubmitAccounts,
  addAccountsUsed,
  canMakeRequest,
  resetUser,
  listUsers
} = require('./accessControl');
const { parseAccounts } = require('./accountsProcessor');
const { registerAccount, tryLoginBMW, tryLoginNN77N } = require('./puppeteerClient');
// ------- UPDATE YOUR CONFIG TO REFLECT 12/6 LIMITS -------
const MAX_ACCOUNTS_TOTAL = 12;
const MAX_ACCOUNTS_PER_MESSAGE = 6;
const { LOG_FILE, TRIAL_CODES, ADMIN_USER_ID, RATE_LIMIT_MS } = require('./config');
const { log } = require('./logger');

const bot = new Telegraf(process.env.BOT_TOKEN);

const userSessions = new Map();
const heavyTaskQueue = new PQueue({ concurrency: 3 });

async function logAction(userId, action, status, message = '') {
  try {
    await log(`[User:${userId}] ${action} - ${status} ${message ? '- ' + message : ''}`);
  } catch {}
}

function getUserState(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { mode: null, site: null });
  }
  return userSessions.get(userId);
}

async function sendMainMenu(ctx) {
  return ctx.replyWithMarkdown(
    `👋 *Welcome to bmw&nn77n bot!*\n\n` +
    `Use the buttons below to get started or manage accounts.\n\n` +
    `💡 *You have 12 free accounts in total (but only 6 accounts per batch are allowed).*\n\n` +
    `📖 _Type /help for detailed instructions._`,
    Markup.keyboard([
      ['➕ Claim Code'],
      ['📝 Register Accounts', '🔐 Login Accounts'],
      ['📊 Usage', 'ℹ️ Status'],
      ['❓ Help']
    ]).resize()
  );
}

bot.start(async (ctx) => {
  await logAction(ctx.from.id, "start", "success");
  await sendMainMenu(ctx);
});

async function sendHelp(ctx) {
  const helpMsg =
`🆘 *Help & Instructions*

1️⃣ Claim a trial code to start using the bot (one code per user):
\`/claim YOUR_CODE\` (e.g. /claim DISCAYA)
_or just tap ➕ Claim Code below!_

2️⃣ Submit accounts for registration or login:
- Use /register or /login commands
- Choose your site: BMW or NN77N (follow prompts)
- Send accounts in message, one per line:
\`username,password,fullname\`
*No spaces in fullname; commas separate fields.*

3️⃣ Trial limits:
- Max 12 total accounts (any combination register/login)
- Max 6 accounts per message (batch)
- Admin users have no limits

4️⃣ Check your usage with /usage
5️⃣ Use /status for bot health (admin only)
6️⃣ Contact admin if you face issues

Happy automating! 🤖`;
  await ctx.replyWithMarkdown(helpMsg);
  await logAction(ctx.from.id, 'help', 'success');
}
bot.help(sendHelp);
bot.hears('❓ Help', sendHelp);

bot.hears('📝 Register Accounts', async (ctx) => {
  const userId = ctx.from.id;
  if (!(await hasClaimed(userId))) {
    await ctx.reply('❗ You need to claim a trial code first. Use ➕ Claim Code or /claim YOUR_CODE');
    await logAction(userId, 'register', 'blocked', 'no trial code');
    return;
  }
  const state = getUserState(userId);
  state.mode = 'register';
  state.site = null;
  await ctx.replyWithMarkdown('📄 You selected *REGISTER* mode.\nPlease choose your site:', Markup.inlineKeyboard([
    Markup.button.callback('BMW (05bmw.com)', 'site_BMW'),
    Markup.button.callback('NN77N (nn77n.com)', 'site_NN77N')
  ]));
  await logAction(userId, 'register', 'prompt_site');
});

bot.hears('🔐 Login Accounts', async (ctx) => {
  const userId = ctx.from.id;
  if (!(await hasClaimed(userId))) {
    await ctx.reply('❗ You need to claim a trial code first. Use ➕ Claim Code or /claim YOUR_CODE');
    await logAction(userId, 'login', 'blocked', 'no trial code');
    return;
  }
  const state = getUserState(userId);
  state.mode = 'login';
  state.site = null;
  await ctx.replyWithMarkdown('🔐 You selected *LOGIN* mode.\nPlease choose your site:', Markup.inlineKeyboard([
    Markup.button.callback('BMW (05bmw.com)', 'site_BMW'),
    Markup.button.callback('NN77N (nn77n.com)', 'site_NN77N')
  ]));
  await logAction(userId, 'login', 'prompt_site');
});

bot.hears('📊 Usage', async (ctx) => {
  const userId = ctx.from.id;
  if (isAdmin(userId)) {
    await ctx.reply('You have unlimited access as admin.');
    return;
  }
  const user = await require('./db').getUser(userId);
  if (!user) {
    await ctx.reply('You have not claimed a trial code yet. Use ➕ Claim Code or /claim CODE');
    return;
  }
  const reply = `📈 Your usage:\n- Trial Code: *${user.claimed_code}*\n` +
    `- Accounts used: *${user.accounts_used}* out of *${MAX_ACCOUNTS_TOTAL}* allowed`;
  await ctx.reply(reply, { parse_mode: 'Markdown' });
});

bot.hears('ℹ️ Status', async (ctx) => {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) {
    await ctx.reply('❌ You do not have permission to use this command.');
    return;
  }
  const memoryUsage = process.memoryUsage();
  const queueSize = heavyTaskQueue.size;
  const pendingCount = heavyTaskQueue.pending;
  const statusMsg = `
🤖 *Bot Status*

- Concurrency limit: 7
- Queue size: *${queueSize}*
- Pending tasks: *${pendingCount}*
- Memory usage: RSS ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB
- Heap used ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
- Heap total ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB
`;
  await ctx.reply(statusMsg, { parse_mode: 'Markdown' });
});

bot.hears('➕ Claim Code', async (ctx) => {
  const userId = ctx.from.id;
  if (await hasClaimed(userId)) {
    await ctx.reply('⚠️ You have already claimed a trial code and cannot claim another.');
    await logAction(userId, 'claim_code_auto', 'denied', 'already claimed');
    return;
  }
  let assignedCode = null;
  for (const code of TRIAL_CODES) {
    const result = await claimCodeForUser(userId, code);
    if (result.success) {
      assignedCode = code;
      break;
    }
  }
  if (assignedCode) {
    await ctx.reply(`✅ Your free trial code is: *${assignedCode}*\nYou can now register or login accounts!`, { parse_mode: 'Markdown' });
    await logAction(userId, 'claim_code_auto', 'success', assignedCode);
  } else {
    await ctx.reply('❌ Sorry, no free trial codes are available at this time. Please contact the admin.');
    await logAction(userId, 'claim_code_auto', 'failed', 'no codes left');
  }
});

bot.command('claim', async (ctx) => {
  const userId = ctx.from.id;
  const arg = ctx.message.text.split(' ')[1];
  if (!arg) {
    await ctx.reply('❗ Please specify a trial code after /claim command.');
    return;
  }
  const code = arg.toUpperCase();
  if (!TRIAL_CODES.includes(code)) {
    await ctx.reply('❌ Invalid trial code.');
    return;
  }
  if (await hasClaimed(userId)) {
    await ctx.reply('⚠️ You have already claimed a trial code and cannot claim another.');
    return;
  }
  const result = await claimCodeForUser(userId, code);
  if (result.success) {
    await ctx.reply(`✅ Trial code *${code}* successfully claimed! You can now register or login accounts.`, { parse_mode: 'Markdown' });
    await logAction(userId, 'claim_code', 'success', code);
  } else {
    await ctx.reply(`❌ ${result.message}`);
    await logAction(userId, 'claim_code', 'failed', code);
  }
});

bot.action(/site_(BMW|NN77N)/, async (ctx) => {
  const userId = ctx.from.id;
  const site = ctx.match[1];
  const state = getUserState(userId);
  if (!state.mode) {
    await ctx.answerCbQuery('❗ Please start with /register or /login');
    return;
  }
  state.site = site;
  await ctx.answerCbQuery();
  await ctx.reply(`🌐 Site set to *${site}*.\n\nNow send me the accounts.\nEach account on a separate line:\n\`username,password,fullname\` (No spaces in fullname)`, { parse_mode: 'Markdown' });
  await logAction(userId, 'site_selected', 'success', `${state.mode} ${site}`);
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const state = getUserState(userId);

  if (!state.mode || !state.site) {
    await sendMainMenu(ctx);
    return;
  }

  const text = ctx.message.text.trim();
  let lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    await ctx.reply('❗ No account data detected. Please send accounts in format:\nusername,password,fullname');
    return;
  }

  let limited = false;
  if (lines.length > MAX_ACCOUNTS_PER_MESSAGE) {
    lines = lines.slice(0, MAX_ACCOUNTS_PER_MESSAGE);
    limited = true;
  }

  const rateCheck = await canMakeRequest(userId, RATE_LIMIT_MS);
  if (!rateCheck.allowed) {
    await ctx.reply(rateCheck.message);
    await logAction(userId, 'rate_limited', 'blocked');
    return;
  }
  const canSubmit = await canSubmitAccounts(userId, lines.length);
  if (!canSubmit.allowed) {
    await ctx.reply(`❌ ${canSubmit.message}`);
    return;
  }

  const { validAccounts, errors } = parseAccounts(lines.join('\n'));
  if (errors.length > 0) {
    let errMsg = '❌ *Errors found in your input lines:*\n';
    for (const e of errors) {
      errMsg += `\n⚠️ Line ${e.lineNumber}: ${e.error}`;
    }
    await ctx.reply(errMsg, { parse_mode: 'Markdown' });
    await logAction(userId, 'account_validation', 'failed', `${errors.length} errors`);
    return;
  }

  let infoMsg = `⏳ Processing ${validAccounts.length} account(s) for *${state.mode.toUpperCase()}* on *${state.site}*.`;
  if (limited) {
    infoMsg += `\n\n⚠️ *Note:* You submitted more than ${MAX_ACCOUNTS_PER_MESSAGE} accounts. Only the first ${MAX_ACCOUNTS_PER_MESSAGE} accounts are being processed. The rest were ignored for this submission.`;
  }
  infoMsg += `\nYou will receive the result shortly...`;

  await ctx.reply(infoMsg, { parse_mode: 'Markdown' });
  await logAction(userId, 'processing_accounts', 'started');

  (async () => {
    const results = [];
    try {
      if (isAdmin(userId)) {
        for (const acc of validAccounts) {
          try {
            if (state.mode === 'register') {
              results.push({ username: acc.username, result: await registerAccount(acc, state.site) });
            } else {
              const loginAcc = { username: acc.username, password: acc.password };
              if (state.site === 'BMW') results.push({ username: acc.username, result: await tryLoginBMW(loginAcc) });
              else results.push({ username: acc.username, result: await tryLoginNN77N(loginAcc) });
            }
          } catch (err) {
            results.push({ username: acc.username, result: err.message || 'Unknown error' });
          }
        }
      } else {
        const queuePromises = validAccounts.map(acc => heavyTaskQueue.add(async () => {
          try {
            if (state.mode === 'register') {
              return await registerAccount(acc, state.site);
            } else {
              const loginAcc = { username: acc.username, password: acc.password };
              if (state.site === 'BMW') return await tryLoginBMW(loginAcc);
              else return await tryLoginNN77N(loginAcc);
            }
          } catch (err) {
            return err.message || 'Unknown error';
          }
        }));
        const queueResults = await Promise.all(queuePromises);
        for (let i = 0; i < validAccounts.length; i++) {
          results.push({ username: validAccounts[i].username, result: queueResults[i] });
        }
      }

      let replyMsg = '';
      if (state.mode === 'register') {
        for (const { username, result } of results) {
          if (result === null) replyMsg += `✅ Registered "${username}" successfully.\n`;
          else if (typeof result === 'string' && result.toLowerCase().includes('account already exist')) replyMsg += `⚠️ Account "${username}" already exists, skipped.\n`;
          else replyMsg += `❌ Registration failed for "${username}": ${result}\n`;
        }
      } else {
        for (const { username, result } of results) {
          if (!result) replyMsg += `❌ Unknown error for "${username}".\n`;
          else if (typeof result === 'string') replyMsg += `❌ Login failed for "${username}": ${result}\n`;
          else if (result.loginError) replyMsg += `❌ Login error for "${username}": ${result.message}\n`;
          else if (result.spun) replyMsg += `✅ "${username}" spun and got bonus: ${result.message}\n`;
          else replyMsg += `❌ "${username}" login succeeded but no spin or bonus detected.\n`;
        }
      }

      if (!isAdmin(userId)) {
        await addAccountsUsed(userId, validAccounts.length);
      }

      let used = 0;
      try { used = (await require('./db').getUser(userId)).accounts_used || 0; } catch {}
      replyMsg += `\nYou have used *${Math.min(MAX_ACCOUNTS_TOTAL, used)}/${MAX_ACCOUNTS_TOTAL}* accounts total.`;

      await ctx.telegram.sendMessage(userId, replyMsg, { parse_mode: 'Markdown' });
      await logAction(userId, 'processing_accounts', 'finished', `${results.length} accounts processed`);

      if (!isAdmin(userId)) {
        const user = await canSubmitAccounts(userId, 0);
        if (!user.allowed) {
          const s = getUserState(userId);
          s.mode = null;
          s.site = null;
          await ctx.telegram.sendMessage(userId, '⚠️ You have reached your total account submission limit. Use /usage for details.');
        }
      }
    } catch (err) {
      await ctx.telegram.sendMessage(userId, `❌ An error occurred during processing: ${err.message || err}`);
      await logAction(userId, 'processing_accounts', 'failed', err.message || String(err));
    }
  })();
});

bot.on('message', (ctx) => {});

function gracefulShutdown() {
  console.log('Stopping bot...');
  bot.stop('SIGINT');
  process.exit(0);
}
process.once('SIGINT', gracefulShutdown);
process.once('SIGTERM', gracefulShutdown);

const { ensureTrialCodes } = require('./db');
const { TRIAL_CODES: codesInConfig } = require('./config');
(async () => {
  await ensureTrialCodes(codesInConfig);
  await bot.launch();
  console.log('Bot started.');
})();


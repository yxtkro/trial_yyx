const {
  getUser,
  createUser,
  getTrialCode,
  claimTrialCode,
  updateUserAccountsUsed,
  setUserLastRequest,
  resetUserUsage,
  getAllUsers,
} = require('./db');
const { TRIAL_CODES, MAX_ACCOUNTS_TOTAL, MAX_ACCOUNTS_PER_MESSAGE, ADMIN_USER_ID } = require('./config');

/**
 * Check if a Telegram user is admin
 * @param {number} userId
 */
function isAdmin(userId) {
  return userId === ADMIN_USER_ID;
}

/**
 * Check if user has claimed a trial code
 */
async function hasClaimed(userId) {
  if (isAdmin(userId)) return true;
  const user = await getUser(userId);
  return user && user.claimed_code !== null;
}

/**
 * Check if trial code is valid and not used
 * @param {string} code
 */
async function isTrialCodeAvailable(code) {
  if (!TRIAL_CODES.includes(code)) return false;
  const dbCode = await getTrialCode(code);
  return dbCode && dbCode.claimed_by === null;
}

/**
 * Claim a trial code for a user
 * @param {number} userId
 * @param {string} code
 */
async function claimCodeForUser(userId, code) {
  if (isAdmin(userId)) return { success: true, message: 'Admin no need to claim codes.' };
  const available = await isTrialCodeAvailable(code);
  if (!available) return { success: false, message: 'Code invalid or already claimed.' };

  const claimed = await claimTrialCode(code, userId);
  if (!claimed) return { success: false, message: 'Code already claimed by someone else.' };

  const user = await getUser(userId);
  if (!user) {
    await createUser(userId, code);
  }
  return { success: true, message: `Code ${code} claimed successfully!` };
}

/**
 * Check if user can submit N accounts now
 * @param {number} userId
 * @param {number} count
 */
async function canSubmitAccounts(userId, count) {
  if (isAdmin(userId)) return { allowed: true };
  const user = await getUser(userId);
  if (!user) return { allowed: false, message: 'You do not have a claimed trial code.' };
  if (!user.claimed_code) return { allowed: false, message: 'You must claim a trial code first.' };
  if (count > MAX_ACCOUNTS_PER_MESSAGE) {
    return { allowed: false, message: `Max ${MAX_ACCOUNTS_PER_MESSAGE} accounts per message allowed.` };
  }
  if (user.accounts_used + count > MAX_ACCOUNTS_TOTAL) {
    return { allowed: false, message: `Total account limit reached (${MAX_ACCOUNTS_TOTAL}).` };
  }
  return { allowed: true };
}

/**
 * Record that user submitted count accounts
 */
async function addAccountsUsed(userId, count) {
  if (isAdmin(userId)) return;
  await updateUserAccountsUsed(userId, count);
}

/**
 * Rate limit: Check if user can make a request (interval)
 * @param {number} userId
 * @param {number} rateLimitMs
 */
async function canMakeRequest(userId, rateLimitMs) {
  if (isAdmin(userId)) return { allowed: true };
  const user = await getUser(userId);
  if (!user) return { allowed: false, message: 'No trial code claimed yet.' };
  const now = Date.now();
  if (user.last_request_at && now - user.last_request_at < rateLimitMs) {
    const waitSeconds = Math.ceil((rateLimitMs - (now - user.last_request_at)) / 1000);
    return { allowed: false, message: `⏳ Please wait ${waitSeconds} second(s) before next request.` };
  }
  await setUserLastRequest(userId, now);
  return { allowed: true };
}

/**
 * Reset user stats (admin)
 */
async function resetUser(userId) {
  await resetUserUsage(userId);
}

/**
 * List all users (admin)
 */
async function listUsers() {
  return await getAllUsers();
}

module.exports = {
  isAdmin,
  hasClaimed,
  isTrialCodeAvailable,
  claimCodeForUser,
  canSubmitAccounts,
  addAccountsUsed,
  canMakeRequest,
  resetUser,
  listUsers
};

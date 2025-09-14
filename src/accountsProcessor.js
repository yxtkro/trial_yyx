const { validateAccountLine } = require('./utils');

/**
 * Parses multiline text input into accounts list and error list
 * @param {string} text multiline input from user
 * @returns {Object} { validAccounts: Array, errors: Array of {lineNumber, line, error} }
 */
function parseAccounts(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const validAccounts = [];
  const errors = [];

  lines.forEach((line, idx) => {
    const result = validateAccountLine(line);
    if (result.valid) {
      validAccounts.push(result.account);
    } else {
      errors.push({ lineNumber: idx + 1, line, error: result.error });
    }
  });

  return { validAccounts, errors };
}

module.exports = {
  parseAccounts
};

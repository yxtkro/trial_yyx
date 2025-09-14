function validateUsername(username) {
  return /^[a-zA-Z][a-zA-Z0-9_]{5,}$/.test(username);
}

function validatePassword(password) {
  return /^[a-zA-Z0-9]{6,}$/.test(password);
}

function validateFullName(fullname) {
  return /^[a-zA-Z]{6,15}$/.test(fullname);
}

/**
 * Validates a single account line of form "username,password,fullname"
 * Returns { valid: bool, error: string|null, account: obj|null }
 */
function validateAccountLine(line) {
  const parts = line.split(',');
  if (parts.length !== 3) {
    return { valid: false, error: 'Format must be username,password,fullname', account: null };
  }
  const [username, password, fullname] = parts.map(s => s.trim());
  if (!username || !password || !fullname) {
    return { valid: false, error: 'Fields cannot be empty', account: null };
  }
  if (!validateUsername(username)) {
    return { valid: false, error: `Invalid username: ${username}`, account: null };
  }
  if (!validatePassword(password)) {
    return { valid: false, error: `Invalid password for username: ${username}`, account: null };
  }
  if (!validateFullName(fullname)) {
    return { valid: false, error: `Invalid fullname for username: ${username}`, account: null };
  }
  return {
    valid: true,
    error: null,
    account: { username, password, fullname, confirmPassword: password }
  };
}

module.exports = {
  validateUsername,
  validatePassword,
  validateFullName,
  validateAccountLine
};

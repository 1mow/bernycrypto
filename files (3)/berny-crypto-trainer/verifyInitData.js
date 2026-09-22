// Проверка подписи Telegram.WebApp.initData по официальной схеме:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const crypto = require('crypto');

/**
 * @param {string} initData — сырая строка из window.Telegram.WebApp.initData
 * @param {string} botToken — токен бота
 * @param {number} maxAgeSeconds — максимально допустимый возраст auth_date
 * @returns {object|null} объект пользователя Telegram или null, если подпись невалидна/просрочена
 */
function verifyInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const pairs = [];
    for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash !== hash) return null;

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

    const userJson = params.get('user');
    return userJson ? JSON.parse(userJson) : null;
  } catch (e) {
    return null;
  }
}

module.exports = { verifyInitData };

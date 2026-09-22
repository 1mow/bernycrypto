// Простое файловое хранилище таблицы лидеров.
// Для старта проекта этого достаточно; при желании легко заменить
// на настоящую БД (Postgres/SQLite) — интерфейс (getLeaderboard/upsertScore)
// можно оставить прежним.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'leaderboard.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeAll(obj) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
}

/**
 * Обновляет текущий счёт игрока (последнее известное значение портфеля).
 * @param {{id:number, username:?string, firstName:string, value:number, walletName:?string}} entry
 */
function upsertScore(entry) {
  const all = readAll();
  const key = String(entry.id);
  all[key] = {
    id: entry.id,
    username: entry.username || null,
    firstName: entry.firstName || 'Игрок',
    value: entry.value,
    walletName: entry.walletName || null,
    updatedAt: Date.now(),
  };
  writeAll(all);
}

/**
 * Возвращает топ игроков по текущей стоимости портфеля.
 */
function getLeaderboard(limit = 20) {
  const all = readAll();
  return Object.values(all)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

module.exports = { getLeaderboard, upsertScore };

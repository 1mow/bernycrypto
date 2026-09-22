// ============================================================
//  Berny Crypto Trainer — Telegram bot + backend
//  Бот выступает "витриной": приветствие, проверка подписки на
//  канал, инструкция, таблица лидеров и кнопка запуска Mini App.
//  Вся торговля происходит внутри Mini App (public/index.html),
//  который этот же процесс раздаёт как статику.
// ============================================================
require('dotenv').config();

const path = require('path');
const express = require('express');
const { Telegraf, Markup } = require('telegraf');

const { getLeaderboard, upsertScore } = require('./leaderboard');
const { verifyInitData } = require('./verifyInitData');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@bernycrypto';
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/bernycrypto';
const WEBAPP_URL = process.env.WEBAPP_URL || ''; // напр. https://berny.up.railway.app
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан. Скопируйте .env.example в .env и заполните значения.');
  process.exit(1);
}
if (!WEBAPP_URL) {
  console.warn('⚠️  WEBAPP_URL не задан в .env — кнопка запуска Mini App не будет показана в меню бота, пока вы не укажете адрес, на котором задеплоено это приложение.');
}

// ============================================================
//  EXPRESS: раздаёт Mini App (public/) и API для лидерборда
// ============================================================
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.send('ok'));

app.get('/api/leaderboard', (req, res) => {
  res.json(getLeaderboard(20));
});

app.post('/api/leaderboard/update', (req, res) => {
  const { initData, value, walletName } = req.body || {};
  const user = verifyInitData(initData, BOT_TOKEN);
  if (!user) return res.status(401).json({ error: 'invalid_init_data' });
  if (typeof value !== 'number' || !isFinite(value) || value < 0) {
    return res.status(400).json({ error: 'bad_value' });
  }
  upsertScore({
    id: user.id,
    username: user.username || null,
    firstName: user.first_name || 'Игрок',
    value,
    walletName: walletName || null,
  });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`🌐 Mini App + API слушает порт ${PORT}`);
});

// ============================================================
//  BOT
// ============================================================
const bot = new Telegraf(BOT_TOKEN);

function escapeMd(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function mainMenuKeyboard() {
  const rows = [];
  if (WEBAPP_URL) {
    rows.push([Markup.button.webApp('🚀 Открыть Berny Crypto Trainer', WEBAPP_URL)]);
  }
  rows.push([
    Markup.button.callback('📖 Как играть', 'howto'),
    Markup.button.callback('🏆 Топ трейдеров', 'top'),
  ]);
  rows.push([
    Markup.button.url('💬 Наш канал', CHANNEL_URL),
    Markup.button.callback('ℹ️ О проекте', 'about'),
  ]);
  return Markup.inlineKeyboard(rows);
}

function subscribeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📢 Подписаться на канал', CHANNEL_URL)],
    [Markup.button.callback('✅ Я подписался', 'recheck_sub')],
  ]);
}

function backKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'back')]]);
}

const welcomeText = (name) => `Привет, ${escapeMd(name)}\\! 👋

Добро пожаловать в *Berny Crypto Trainer* — тренажёр крипто\\-трейдинга, где можно учиться торговать без риска потерять настоящие деньги\\.

Внутри приложения: 50 реальных монет по актуальным курсам, ускоренное игровое время, портфель с P\\&L, несколько кошельков и честная таблица лидеров\\.

Нажимайте кнопку ниже, чтобы открыть приложение 👇`;

async function isSubscribed(ctx) {
  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (e) {
    // Бот не админ канала / канал недоступен для проверки — не блокируем пользователя наглухо,
    // но логируем, чтобы владелец бота заметил проблему конфигурации.
    console.error('Membership check failed:', e.message);
    return false;
  }
}

async function sendSubscribeGate(ctx) {
  await ctx.reply(
    `Перед началом, пожалуйста, подпишитесь на канал бота 👉 ${CHANNEL_URL}\n\nПосле подписки нажмите «✅ Я подписался».`,
    subscribeKeyboard()
  );
}

bot.start(async (ctx) => {
  const subscribed = await isSubscribed(ctx);
  if (!subscribed) {
    await sendSubscribeGate(ctx);
    return;
  }
  await ctx.replyWithMarkdownV2(welcomeText(ctx.from.first_name || 'трейдер'), mainMenuKeyboard());
});

bot.command('menu', async (ctx) => {
  const subscribed = await isSubscribed(ctx);
  if (!subscribed) return sendSubscribeGate(ctx);
  await ctx.replyWithMarkdownV2(welcomeText(ctx.from.first_name || 'трейдер'), mainMenuKeyboard());
});

bot.command('top', async (ctx) => {
  const subscribed = await isSubscribed(ctx);
  if (!subscribed) return sendSubscribeGate(ctx);
  await sendLeaderboard(ctx, false);
});

bot.action('recheck_sub', async (ctx) => {
  const subscribed = await isSubscribed(ctx);
  if (!subscribed) {
    await ctx.answerCbQuery('Пока не вижу подписки 🙁', { show_alert: true });
    return;
  }
  await ctx.answerCbQuery('Отлично, подписка подтверждена!');
  await ctx.editMessageText(
    welcomeText(ctx.from.first_name || 'трейдер'),
    { parse_mode: 'MarkdownV2', ...mainMenuKeyboard() }
  );
});

bot.action('howto', async (ctx) => {
  await ctx.answerCbQuery();
  const text = `📖 *Как играть*

1\\. Откройте приложение кнопкой из главного меню бота\\.
2\\. На первом кошельке уже лежит 100 USDT\\.
3\\. Покупайте и продавайте любую из 50 монет — цены меняются в реальном времени игрового рынка\\.
4\\. Раз в 24 часа забирайте бонус \\+50 USDT на вкладке «Бонусы»\\.
5\\. Как только суммарный капитал по всем кошелькам достигнет 600 USDT, откроется возможность создать второй кошелёк — например, для другой стратегии\\.
6\\. Следите за P\\&L, винрейтом и своим местом в таблице лидеров — она настоящая и общая для всех игроков бота\\.

Это учебный симулятор: все монеты и деньги виртуальные, сделки не выходят за пределы приложения\\.`;
  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', ...backKeyboard() });
});

bot.action('about', async (ctx) => {
  await ctx.answerCbQuery();
  const text = `ℹ️ *О проекте*

*Berny Crypto Trainer* — учебный симулятор крипто\\-трейдинга\\. Никаких реальных бирж, депозитов и рисков — только тренировка навыков перед настоящей торговлей\\.

Реализован как Telegram Mini App: всё открывается прямо внутри Telegram, прогресс сохраняется на вашем устройстве, а место в рейтинге — на сервере бота\\.

Канал проекта: ${escapeMd(CHANNEL_URL)}`;
  await ctx.editMessageText(text, { parse_mode: 'MarkdownV2', ...backKeyboard() });
});

bot.action('top', async (ctx) => {
  await ctx.answerCbQuery();
  await sendLeaderboard(ctx, true);
});

bot.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    welcomeText(ctx.from.first_name || 'трейдер'),
    { parse_mode: 'MarkdownV2', ...mainMenuKeyboard() }
  );
});

async function sendLeaderboard(ctx, edit) {
  const top = getLeaderboard(10);
  let text = `🏆 *Топ трейдеров Berny Crypto Trainer*\n\n`;
  if (top.length === 0) {
    text += `Пока никто не попал в рейтинг\\. Откройте приложение и начните торговать, чтобы стать первым 🚀`;
  } else {
    const medals = ['🥇', '🥈', '🥉'];
    top.forEach((row, i) => {
      const medal = medals[i] || `${i + 1}\\.`;
      const name = row.username ? '@' + row.username : row.firstName;
      text += `${medal} ${escapeMd(name)} — *${escapeMd(row.value.toFixed(2))} USDT*\n`;
    });
  }
  const opts = { parse_mode: 'MarkdownV2', ...backKeyboard() };
  if (edit) {
    await ctx.editMessageText(text, opts);
  } else {
    await ctx.replyWithMarkdownV2(text, backKeyboard());
  }
}

// Бот намеренно "нефункционален" сам по себе — вся торговля только в Mini App.
// Любой произвольный текст просто мягко возвращает пользователя в меню.
bot.on('text', async (ctx) => {
  const subscribed = await isSubscribed(ctx);
  if (!subscribed) return sendSubscribeGate(ctx);
  await ctx.reply('Вся торговля происходит внутри мини\u2011приложения 👇', mainMenuKeyboard());
});

bot.catch((err, ctx) => {
  console.error(`Bot error for ${ctx.updateType}:`, err);
});

bot.launch()
  .then(() => {
    console.log('🤖 Berny Crypto Trainer bot запущен (long polling)');
  })
  .catch((err) => {
    // Не роняем весь процесс, если у бота не вышло стартовать (неверный токен,
    // нет сети до api.telegram.org и т.п.) — Mini App и API продолжают работать.
    console.error('❌ Не удалось запустить бота:', err.message);
    console.error('   Проверьте BOT_TOKEN в .env и доступ в интернет до api.telegram.org.');
  });

function safeStop(signal) {
  try { bot.stop(signal); } catch (e) { /* бот и не запускался — нечего останавливать */ }
}
process.once('SIGINT', () => safeStop('SIGINT'));
process.once('SIGTERM', () => safeStop('SIGTERM'));

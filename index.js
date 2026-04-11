const TelegramBot = require("node-telegram-bot-api");

// ---- ԿՈՆՖԻԳՈՒՐԱՑԻԱ ----
const TOKEN = "8781934221:AAHlyKDXM2ja6lPeOGHUC7oB5ir5bNQ0qyw";
const ADMIN_ID = 1005008069;
const CARD_NUMBER = "YOUR_CARD_NUMBER_HERE"; // քո քարտի համարը

// ---- ՓԱԹԵԹՆԵՐ ----
const PACKAGES = {
  pkg_10: { label: "Գործակից x10", price: 2000, odds: 10 },
  pkg_25: { label: "Գործակից x25", price: 3500, odds: 25 },
  pkg_50: { label: "Գործակից x50", price: 7000, odds: 50 },
};

// ---- ՊԱՀՈՑՆԵՐ ----
const subscribers = new Map();
const pendingPayments = new Map();

const bot = new TelegramBot(TOKEN, { polling: true });

// ---- /start ----
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `👋 Բարև!\n\nԵս bet check բոտ եմ։\n\n` +
      `📋 Հրամաններ:\n` +
      `/checks — օրվա չեկերը\n` +
      `/status — իմ կարգավիճակը`
  );
});

// ---- /checks ----
bot.onText(/\/checks/, (msg) => {
  const chatId = msg.chat.id;

  if (subscribers.has(chatId)) {
    return sendCheck(chatId, subscribers.get(chatId));
  }

  bot.sendMessage(chatId, "📦 Ընտրիր փաթեթ՝", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "⚡ x10 — 2,000 դրամ", callback_data: "buy_pkg_10" }],
        [{ text: "🔥 x25 — 3,500 դրամ", callback_data: "buy_pkg_25" }],
        [{ text: "💎 x50 — 7,000 դրամ", callback_data: "buy_pkg_50" }],
      ],
    },
  });
});

// ---- /status ----
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;

  if (subscribers.has(chatId)) {
    const pkg = PACKAGES[subscribers.get(chatId)];
    return bot.sendMessage(chatId, `✅ Ակտիվ բաժանորդ ես։\nՓաթեթ: ${pkg.label}`);
  } else if (pendingPayments.has(chatId)) {
    return bot.sendMessage(chatId, "⏳ Վճարումդ դեռ հաստատված չէ։");
  } else {
    return bot.sendMessage(chatId, "❌ Բաժանորդ չես։ Գրիր /checks");
  }
});

// ---- ԿՈՃԱԿԻ ՍԵՂՄՈՒՄ ----
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("buy_")) {
    const pkgKey = data.replace("buy_", "");
    const pkg = PACKAGES[pkgKey];
    if (!pkg) return;

    pendingPayments.set(chatId, pkgKey);

bot.sendMessage(
    chatId,
    `👋 Բարև!\n\nԵս bet check բոտ եմ։\n\n` +
      `📋 Հրամաններ:\n` +
      `/checks — օրվա չեկերը\n` +
      `/status — իմ կարգավիճակը\n\n` +
      `⚠️ Կարևոր. մենք պատասխանատվություն չենք կրում չեկերի արդյունքների համար։ Խաղադրույք կատարիր սեփական պատասխանատվությամբ։`
  );
  }

  bot.answerCallbackQuery(query.id);
});

// ---- ԼՈՒՍԱՆԿԱՐ (կտրոն) ----
bot.on("photo", (msg) => {
  const chatId = msg.chat.id;

  if (!pendingPayments.has(chatId)) return;

  const pkgKey = pendingPayments.get(chatId);
  const pkg = PACKAGES[pkgKey];
  const fileId = msg.photo[msg.photo.length - 1].file_id;

  bot.sendPhoto(ADMIN_ID, fileId, {
    caption:
      `💳 Վճարման հայտ\n` +
      `👤 User ID: ${chatId}\n` +
      `📦 Փաթեթ: ${pkg.label}\n` +
      `💰 Գումար: ${pkg.price.toLocaleString()} դրամ\n\n` +
      `✅ Հաստատել: /approve ${chatId} ${pkgKey}\n` +
      `❌ Մերժել: /reject ${chatId}`,
  });

  bot.sendMessage(chatId, "📨 Կտրոնդ ստացանք։ Կհաստատենք շուտով։");
});

// ---- ԱԴՄԻՆ՝ հաստատել ----
bot.onText(/\/approve (\d+) (\w+)/, (msg, match) => {
  console.log("approve received from chat id:", msg.chat.id, "ADMIN_ID:", ADMIN_ID);

  if (msg.chat.id !== ADMIN_ID) {
    console.log("NOT ADMIN - ignoring");
    return;
  }

  const userId = parseInt(match[1]);
  const pkgKey = match[2];
  const pkg = PACKAGES[pkgKey];

  console.log("userId:", userId, "pkgKey:", pkgKey, "pkg:", pkg);

  if (!pkg) return bot.sendMessage(ADMIN_ID, "❌ Անհայտ փաթեթ։");

  subscribers.set(userId, pkgKey);
  pendingPayments.delete(userId);

  bot.sendMessage(ADMIN_ID, `✅ ${userId} հաստատված է։ Փաթեթ: ${pkg.label}`);
  bot.sendMessage(userId, `🎉 Վճարումդ հաստատվեց!\nՓաթեթ: ${pkg.label}`);
  sendCheck(userId, pkgKey);
});

// ---- ԱԴՄԻՆ՝ մերժել ----
bot.onText(/\/reject (\d+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;

  const userId = parseInt(match[1]);
  pendingPayments.delete(userId);

  bot.sendMessage(ADMIN_ID, `❌ ${userId} մերժված է։`);
  bot.sendMessage(userId, "❌ Վճարումդ մերժվեց։ Կրկին փորձիր /checks");
});

// ---- ԱԴՄԻՆ՝ բաժանորդ հեռացնել ----
bot.onText(/\/remove (\d+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;

  const userId = parseInt(match[1]);
  subscribers.delete(userId);

  bot.sendMessage(ADMIN_ID, `🗑 ${userId} հեռացված է։`);
});

// ---- ԱԴՄԻՆ՝ բոլորին հաղորդագրություն ----
bot.onText(/\/broadcast (.+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;

  const text = match[1];
  subscribers.forEach((_, id) => {
    bot.sendMessage(id, `📢 ${text}`);
  });

  bot.sendMessage(ADMIN_ID, `✅ Ուղարկվեց ${subscribers.size} բաժանորդի։`);
});

// ---- ԱԴՄԻՆ՝ ցուցակ ----
bot.onText(/\/list/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;

  if (subscribers.size === 0) {
    return bot.sendMessage(ADMIN_ID, "👥 Բաժանորդ չկա։");
  }

  let list = "";
  subscribers.forEach((pkgKey, id) => {
    const pkg = PACKAGES[pkgKey];
    list += `• ${id} — ${pkg.label}\n`;
  });

  bot.sendMessage(ADMIN_ID, `👥 Բաժանորդներ (${subscribers.size}):\n\n${list}`);
});

// ---- ՉԵԿ ՈՒՂԱՐԿԵԼՈՒ ՖՈՒՆԿՑԻԱ ----
function sendCheck(chatId, pkgKey) {
  const date = new Date().toLocaleDateString("hy-AM");

  const checks = {
    pkg_10:
      `📊 Չեկ x10 — ${date}\n\n` +
      `⚽ Team A vs Team B\n` +
      `🎯 Կանխատեսում: Team A հաղթանակ\n` +
      `📈 Կոտ: 1.90\n\n` +
      `⚠️ Խաղադրույք կատարիր պատասխանատվությամբ։`,

    pkg_25:
      `📊 Չեկ x25 — ${date}\n\n` +
      `⚽ Team A vs Team B\n` +
      `🎯 Կանխատեսում: Team A հաղթանակ\n` +
      `📈 Կոտ: 1.90\n\n` +
      `⚽ Team C vs Team D\n` +
      `🎯 Կանխատեսում: Ոչ-ոքի\n` +
      `📈 Կոտ: 3.10\n\n` +
      `⚠️ Խաղադրույք կատարիր պատասխանատվությամբ։`,

    pkg_50:
      `📊 Չեկ x50 — ${date}\n\n` +
      `⚽ Team A vs Team B\n` +
      `🎯 Կանխատեսում: Team A հաղթանակ\n` +
      `📈 Կոտ: 1.90\n\n` +
      `⚽ Team C vs Team D\n` +
      `🎯 Կանխատեսում: Ոչ-ոքի\n` +
      `📈 Կոտ: 3.10\n\n` +
      `⚽ Team E vs Team F\n` +
      `🎯 Կանխատեսում: Team F հաղթանակ\n` +
      `📈 Կոտ: 4.50\n\n` +
      `⚠️ Խաղադրույք կատարիր պատասխանատվությամբ։`,
  };

  bot.sendMessage(chatId, checks[pkgKey] || "❌ Չեկ չկա։");
}

console.log("🤖 Բոտը աշխատում է...");
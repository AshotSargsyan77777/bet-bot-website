// const TelegramBot = require("node-telegram-bot-api");

// // ---- ԿՈՆՖԻԳՈՒՐԱՑԻԱ ----
// const TOKEN = "8781934221:AAHlyKDXM2ja6lPeOGHUC7oB5ir5bNQ0qyw";
// const ADMIN_ID = 1005008069;
// const CARD_NUMBER = "5181800050618613"; // քո քարտի համարը
// const PROMO_CODE = "QWAS0101";

// // ---- ՓԱԹԵԹՆԵՐ ----
// const PACKAGES = {
//   pkg_5:  { label: "Գործակից x5",  price: 0,    odds: 5  },
//   pkg_10: { label: "Գործակից x10", price: 2000, odds: 10 },
//   pkg_25: { label: "Գործակից x25", price: 3500, odds: 25 },
//   pkg_50: { label: "Գործակից x50", price: 7000, odds: 50 },
// };

// // ---- ՊԱՀՈՑՆԵՐ ----
// const subscribers = new Map();
// const pendingPayments = new Map();
// const usedPromos = new Set(); // ով արդեն օգտագործել է պրոմոկոդը

// const bot = new TelegramBot(TOKEN, { polling: true });

// // ---- /start ----
// bot.onText(/\/start/, (msg) => {
//   const chatId = msg.chat.id;
//   bot.sendMessage(
//     chatId,
//     `👋 Բարև!\n\nԵս bet check բոտ եմ։\n\n` +
//       `📋 Հրամաններ:\n` +
//       `/checks — օրվա չեկերը\n` +
//       `/promo [կոդ] — անվճար պրոմո փաթեթ\n` +
//       `/status — իմ կարգավիճակը\n\n` +
//       `⚠️ Կարևոր. մենք պատասխանատվություն չենք կրում չեկերի արդյունքների համար։ Խաղադրույք կատարիր սեփական պատասխանատվությամբ։`
//   );
// });

// // ---- /checks ----
// bot.onText(/\/checks/, (msg) => {
//   const chatId = msg.chat.id;

//   if (subscribers.has(chatId)) {
//     return sendCheck(chatId, subscribers.get(chatId));
//   }

//   bot.sendMessage(chatId, "📦 Ընտրիր փաթեթ՝", {
//     reply_markup: {
//       inline_keyboard: [
//         [{ text: "⚡ x10 — 2,000 դրամ", callback_data: "buy_pkg_10" }],
//         [{ text: "🔥 x25 — 3,500 դրամ", callback_data: "buy_pkg_25" }],
//         [{ text: "💎 x50 — 7,000 դրամ", callback_data: "buy_pkg_50" }],
//       ],
//     },
//   });
// });

// // ---- /promo ----
// bot.onText(/\/promo (.+)/, (msg, match) => {
//   const chatId = msg.chat.id;
//   const code = match[1].trim();

//   if (subscribers.has(chatId)) {
//     return bot.sendMessage(chatId, "✅ Դու արդեն բաժանորդ ես։");
//   }

//   if (code !== PROMO_CODE) {
//     return bot.sendMessage(chatId, "❌ Սխալ պրոմոկոդ։");
//   }

//   if (usedPromos.has(chatId)) {
//     return bot.sendMessage(chatId, "❌ Դու արդեն օգտագործել ես պրոմոկոդը։");
//   }

//   usedPromos.add(chatId);
//   subscribers.set(chatId, "pkg_5");

//   bot.sendMessage(
//     chatId,
//     `🎉 Պրոմոկոդը ակտիվացվեց!\nՓաթեթ: Գործակից x5 (անվճար)\nԳրիր /checks օրվա չեկ ստանալու համար։`
//   );
// });

// // ---- /status ----
// bot.onText(/\/status/, (msg) => {
//   const chatId = msg.chat.id;

//   if (subscribers.has(chatId)) {
//     const pkg = PACKAGES[subscribers.get(chatId)];
//     return bot.sendMessage(chatId, `✅ Ակտիվ բաժանորդ ես։\nՓաթեթ: ${pkg.label}`);
//   } else if (pendingPayments.has(chatId)) {
//     return bot.sendMessage(chatId, "⏳ Վճարումդ դեռ հաստատված չէ։");
//   } else {
//     return bot.sendMessage(chatId, "❌ Բաժանորդ չես։ Գրիր /checks");
//   }
// });

// // ---- ԿՈՃԱԿԻ ՍԵՂՄՈՒՄ ----
// bot.on("callback_query", (query) => {
//   const chatId = query.message.chat.id;
//   const data = query.data;

//   if (data.startsWith("buy_")) {
//     const pkgKey = data.replace("buy_", "");
//     const pkg = PACKAGES[pkgKey];
//     if (!pkg) return;

//     pendingPayments.set(chatId, pkgKey);

//     bot.sendMessage(
//       chatId,
//       `💳 Վճարման տվյալներ\n\n` +
//         `📦 Փաթեթ: ${pkg.label}\n` +
//         `💰 Գումար: ${pkg.price.toLocaleString()} դրամ\n\n` +
//         `🏦 Քարտի համար:\n<code>${CARD_NUMBER}</code>\n\n` +
//         `Վճարելուց հետո ուղարկիր կտրոնի լուսանկարը։\n\n` +
//         `⚠️ Մենք պատասխանատվություն չենք կրում չեկերի արդյունքների համար։`,
//       { parse_mode: "HTML" }
//     );
//   }

//   bot.answerCallbackQuery(query.id);
// });

// // ---- ԼՈՒՍԱՆԿԱՐ (կտրոն) ----
// bot.on("photo", (msg) => {
//   const chatId = msg.chat.id;

//   if (!pendingPayments.has(chatId)) return;

//   const pkgKey = pendingPayments.get(chatId);
//   const pkg = PACKAGES[pkgKey];
//   const fileId = msg.photo[msg.photo.length - 1].file_id;

//   bot.sendPhoto(ADMIN_ID, fileId, {
//     caption:
//       `💳 Վճարման հայտ\n` +
//       `👤 User ID: ${chatId}\n` +
//       `📦 Փաթեթ: ${pkg.label}\n` +
//       `💰 Գումար: ${pkg.price.toLocaleString()} դրամ\n\n` +
//       `✅ Հաստատել: /approve ${chatId} ${pkgKey}\n` +
//       `❌ Մերժել: /reject ${chatId}`,
//   });

//   bot.sendMessage(chatId, "📨 Կտրոնդ ստացանք։ Կհաստատենք շուտով։");
// });

// // ---- ԱԴՄԻՆ՝ հաստատել ----
// bot.onText(/\/approve (\d+) (\w+)/, (msg, match) => {
//   if (msg.chat.id !== ADMIN_ID) return;

//   const userId = parseInt(match[1]);
//   const pkgKey = match[2];
//   const pkg = PACKAGES[pkgKey];

//   if (!pkg) return bot.sendMessage(ADMIN_ID, "❌ Անհայտ փաթեթ։");

//   subscribers.set(userId, pkgKey);
//   pendingPayments.delete(userId);

//   bot.sendMessage(ADMIN_ID, `✅ ${userId} հաստատված է։ Փաթեթ: ${pkg.label}`);
//   bot.sendMessage(userId, `🎉 Վճարումդ հաստատվեց!\nՓաթեթ: ${pkg.label}`);
//   sendCheck(userId, pkgKey);
// });

// // ---- ԱԴՄԻՆ՝ մերժել ----
// bot.onText(/\/reject (\d+)/, (msg, match) => {
//   if (msg.chat.id !== ADMIN_ID) return;

//   const userId = parseInt(match[1]);
//   pendingPayments.delete(userId);

//   bot.sendMessage(ADMIN_ID, `❌ ${userId} մերժված է։`);
//   bot.sendMessage(userId, "❌ Վճարումդ մերժվեց։ Կրկին փորձիր /checks");
// });

// // ---- ԱԴՄԻՆ՝ բաժանորդ հեռացնել ----
// bot.onText(/\/remove (\d+)/, (msg, match) => {
//   if (msg.chat.id !== ADMIN_ID) return;

//   const userId = parseInt(match[1]);
//   subscribers.delete(userId);

//   bot.sendMessage(ADMIN_ID, `🗑 ${userId} հեռացված է։`);
// });

// // ---- ԱԴՄԻՆ՝ բոլորին հաղորդագրություն ----
// bot.onText(/\/broadcast (.+)/, (msg, match) => {
//   if (msg.chat.id !== ADMIN_ID) return;

//   const text = match[1];
//   subscribers.forEach((_, id) => {
//     bot.sendMessage(id, `📢 ${text}`);
//   });

//   bot.sendMessage(ADMIN_ID, `✅ Ուղարկվեց ${subscribers.size} բաժանորդի։`);
// });

// // ---- ԱԴՄԻՆ՝ ցուցակ ----
// bot.onText(/\/list/, (msg) => {
//   if (msg.chat.id !== ADMIN_ID) return;

//   if (subscribers.size === 0) {
//     return bot.sendMessage(ADMIN_ID, "👥 Բաժանորդ չկա։");
//   }

//   let list = "";
//   subscribers.forEach((pkgKey, id) => {
//     const pkg = PACKAGES[pkgKey];
//     list += `• ${id} — ${pkg.label}\n`;
//   });

//   bot.sendMessage(ADMIN_ID, `👥 Բաժանորդներ (${subscribers.size}):\n\n${list}`);
// });

// // ---- ՉԵԿ ՈՒՂԱՐԿԵԼՈՒ ՖՈՒՆԿՑԻԱ ----
// function sendCheck(chatId, pkgKey) {
//   const date = new Date().toLocaleDateString("hy-AM");

//   const checks = {
//     pkg_5:
//       `📊 Չեկ x5 — ${date}\n\n` +
//       `⚽ Team A vs Team B\n` +
//       `🎯 Կանխատեսում: Team A հաղթանակ\n` +
//       `📈 Կոտ: 1.50\n\n` +
//       `⚠️ Խաղադրույք կատարիր պատասխանատվությամբ։`,

//     pkg_10:
//       `📊 Չեկ x10 — ${date}\n\n` +
//       `⚽ Team A vs Team B\n` +
//       `🎯 Կանխատեսում: Team A հաղթանակ\n` +
//       `📈 Կոտ: 1.90\n\n` +
//       `⚠️ Խաղադրույք կատարիր պատասխանատվությամբ։`,

//     pkg_25:
//       `📊 Չեկ x25 — ${date}\n\n` +
//       `⚽ Arsenal vs Bournemouth\n` +
//       `🎯 Կանխատեսում: Տոտալ 1.5-ից բարձր\n` +
//       `📈 Կոտ: 1.21\n\n` +
//       `⚽ Real Sociedad vs Alaves\n` +
//       `🎯 Կանխատեսում: Կրկնակի հնարավորություն (Real Sociedad կամ ոչ-ոքի)\n` +
//       `📈 Կոտ: 1.19\n\n` +
//       `⚽ Borussia Dortmund vs Bayer Leverkusen\n` +
//       `🎯 Կանխատեսում: Երկուսն էլ կխփեն — Այո\n` +
//       `📈 Կոտ: 1.50\n\n` +
//       `⚽ Wolfsburg vs Eintracht Frankfurt\n` +
//       `🎯 Կանխատեսում: Տոտալ 2.5-ից բարձր\n` +
//       `📈 Կոտ: 1.61\n\n` +
//       `⚽ Liverpool vs Fulham\n` +
//       `🎯 Կանխատեսում: Liverpool ԻՏ 1.5-ից բարձր\n` +
//       `📈 Կոտ: 1.56\n\n` +
//       `⚽ St. Pauli vs Bayern\n` +
//       `🎯 Կանխատեսում: Bayern հաղթանակ\n` +
//       `📈 Կոտ: 1.38\n\n` +
//       `⚽ Barcelona vs Espanyol\n` +
//       `🎯 Կանխատեսում: Barcelona ԻՏ 1.5-ից բարձր\n` +
//       `📈 Կոտ: 1.29\n\n` +
//       `⚽ Atalanta vs Juventus\n` +
//       `🎯 Կանխատեսում: Երկուսն էլ կխփեն — Այո\n` +
//       `📈 Կոտ: 1.62\n\n` +
//       `⚽ Milan vs Udinese\n` +
//       `🎯 Կանխատեսում: Տոտալ 1.5-ից բարձր\n` +
//       `📈 Կոտ: 1.27\n\n` +
//       `⚠️ Խաղադրույք կատարիր պատասխանատվությամբ։`,

//     pkg_50:
//       `📊 Չեկ x50 — ${date}\n\n` +
//       `⚽ Team A vs Team B\n` +
//       `🎯 Կանխատեսում: Team A հաղթանակ\n` +
//       `📈 Կոտ: 1.90\n\n` +
//       `⚽ Team C vs Team D\n` +
//       `🎯 Կանխատեսում: Ոչ-ոքի\n` +
//       `📈 Կոտ: 3.10\n\n` +
//       `⚽ Team E vs Team F\n` +
//       `🎯 Կանխատեսում: Team F հաղթանակ\n` +
//       `📈 Կոտ: 4.50\n\n` +
//       `⚠️ Խաղադրույք կատարիր պատասխանատվությամբ։`,
//   };

//   bot.sendMessage(chatId, checks[pkgKey] || "❌ Չեկ չկա։");
// }

// console.log("🤖 Բոտը աշխատում է...");



const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// ---- ԿՈՆՖԻԳՈՒՐԱՑԻԱ ----
const TOKEN = "8781934221:AAHlyKDXM2ja6lPeOGHUC7oB5ir5bNQ0qyw";
const CARD_NUMBER = "5181800050618613";
const PROMO_CODE = "QWAS0101";

// ԱԴՄԻՆՆԵՐԻ ID-ՆԵՐԸ (Ավելացրեք ձեր ընկերոջ ID-ն այստեղ)
const ADMIN_IDS = [1005008069, 1307510432]; 

const SUBS_FILE = "./subscribers.json";
const PROMO_FILE = "./used_promos.json";
const CHECKS_FILE = "./active_checks.json";

// ---- ՕԺԱՆԴԱԿ ՖՈՒՆԿՑԻԱՆԵՐ ----
function loadData(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
    } catch (e) { console.error("Error loading file:", filePath); }
    return defaultValue;
}

function saveData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Ստուգում է՝ արդյոք տվյալ ID-ն ադմին է, թե ոչ
const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

// ---- ՏՎՅԱԼՆԵՐԻ ՎԵՐԱԿԱՆԳՆՈՒՄ ----
let subscribers = loadData(SUBS_FILE, {});
let usedPromos = loadData(PROMO_FILE, []);
let activeChecks = loadData(CHECKS_FILE, {
    pkg_5: "Այսօրվա x5 չեկը դեռ տեղադրված չէ:",
    pkg_10: "Այսօրվա x10 չեկը դեռ տեղադրված չէ:",
    pkg_25: "Այսօրվա x20 չեկը դեռ տեղադրված չէ:",
    pkg_50: "Այսօրվա x30 չեկը դեռ տեղադրված չէ:"
});

const userStates = new Map();
const pendingPayments = new Map();
const bot = new TelegramBot(TOKEN, { polling: true });

// ---- ՄԵՆՅՈՒՆԵՐ ----
const MAIN_MENU = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 Օրվա չեկերը" }],
            [{ text: "🎁 Պրոմոկոդ" }, { text: "👤 Կարգավիճակ" }]
        ],
        resize_keyboard: true
    }
};

const BACK_MENU = {
    reply_markup: {
        keyboard: [[{ text: "🔙 Հետ գնալ" }]],
        resize_keyboard: true
    }
};

const PACKAGES = {
    pkg_5:  { label: "Գործակից x5",  price: 0 },
    pkg_10: { label: "Գործակից x10", price: 3000 },
    pkg_20: { label: "Գործակից x20", price: 7000 },
    pkg_30: { label: "Գործակից x30", price: 10000 },
};

// ---- /start ----
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id.toString();
    userStates.delete(chatId);
    bot.sendMessage(chatId, "👋 Բարի գալուստ! Օգտվեք ներքևի կոճակներից․", MAIN_MENU);
});

// ---- ՉԵԿԵՐԻ ՖՈՒՆԿՑԻԱ ----
function handleChecks(chatId) {
    if (subscribers[chatId]) {
        const pkgKey = subscribers[chatId];
        return bot.sendMessage(chatId, `📊 Ձեր չեկը (${PACKAGES[pkgKey].label}):\n\n${activeChecks[pkgKey]}`, MAIN_MENU);
    }
    bot.sendMessage(chatId, "📦 Ընտրեք փաթեթ՝", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "⚡ x10 — 3,000 դրամ", callback_data: "buy_pkg_10" }],
                [{ text: "🔥 x20 — 7,000 դրամ", callback_data: "buy_pkg_20" }],
                [{ text: "💎 x30 — 10,000 դրամ", callback_data: "buy_pkg_30" }],
            ],
        },
    });
}

// ---- ՀԱՂՈՐԴԱԳՐՈՒԹՅՈՒՆՆԵՐԻ ՄՇԱԿՈՒՄ ----
bot.on("message", (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    if (!text) return;

    if (text === "📊 Օրվա չեկերը") return handleChecks(chatId);
    if (text === "👤 Կարգավիճակ") {
        const st = subscribers[chatId] ? `✅ Ակտիվ: ${PACKAGES[subscribers[chatId]].label}` : "❌ Ակտիվ բաժանորդ չես:";
        return bot.sendMessage(chatId, st, MAIN_MENU);
    }
    if (text === "🎁 Պրոմոկոդ") {
        if (subscribers[chatId]) return bot.sendMessage(chatId, "✅ Դու արդեն ունես ակտիվ փաթեթ:", MAIN_MENU);
        userStates.set(chatId, "AWAITING_PROMO");
        return bot.sendMessage(chatId, "🎁 Մուտքագրեք ձեր պրոմոկոդը․", BACK_MENU);
    }
    if (text === "🔙 Հետ գնալ") {
        userStates.delete(chatId);
        return bot.sendMessage(chatId, "Գլխավոր մենյու", MAIN_MENU);
    }

    if (userStates.get(chatId) === "AWAITING_PROMO" && !text.startsWith("/")) {
        if (text.trim().toUpperCase() === PROMO_CODE.toUpperCase()) {
            if (usedPromos.includes(chatId)) {
                bot.sendMessage(chatId, "❌ Դու արդեն օգտագործել ես պրոմոկոդը:", MAIN_MENU);
            } else {
                usedPromos.push(chatId);
                subscribers[chatId] = "pkg_5";
                saveData(SUBS_FILE, subscribers);
                saveData(PROMO_FILE, usedPromos);
                bot.sendMessage(chatId, `🎉 Ակտիվացվեց!`, MAIN_MENU);
                bot.sendMessage(chatId, `📊 Չեկ:\n\n${activeChecks["pkg_5"]}`);
            }
        } else {
            bot.sendMessage(chatId, "❌ Սխալ կոդ:", BACK_MENU);
        }
        userStates.delete(chatId);
    }
});

// ---- CALLBACKS ----
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id.toString();
    if (query.data.startsWith("buy_")) {
        const pkgKey = query.data.replace("buy_", "");
        pendingPayments.set(chatId, pkgKey);
        bot.sendMessage(chatId, `💳 Քարտ: <code>${CARD_NUMBER}</code>\nԳումար: ${PACKAGES[pkgKey].price} դրամ\nՈւղարկիր կտրոնի նկարը:`, { parse_mode: "HTML" });
    }
    bot.answerCallbackQuery(query.id);
});

// ---- ԼՈՒՍԱՆԿԱՐ (Ուղարկվում է բոլոր ադմիններին) ----
bot.on("photo", (msg) => {
    const chatId = msg.chat.id.toString();
    if (!pendingPayments.has(chatId)) return;
    const pkgKey = pendingPayments.get(chatId);
    const fileId = msg.photo[msg.photo.length - 1].file_id;

    ADMIN_IDS.forEach(adminId => {
        if (adminId !== 0) { // Բաց թողնել եթե ID-ն դեռ փոխված չէ
            bot.sendPhoto(adminId, fileId, {
                caption: `💳 Վճարում\nUser: ${chatId}\nՓաթեթ: ${pkgKey}\n\nՀաստատել: /approve ${chatId} ${pkgKey}\nՄերժել: /reject ${chatId}`
            });
        }
    });
    bot.sendMessage(chatId, "📨 Կտրոնն ուղարկված է ադմիններին:");
});

// ---- ԱԴՄԻՆ ՀՐԱՄԱՆՆԵՐ ----

// Հաստատում (Approve)
bot.onText(/\/approve (\d+) (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const pkgKey = match[2];
    subscribers[userId] = pkgKey;
    saveData(SUBS_FILE, subscribers);
    bot.sendMessage(userId, `🎉 Ձեր վճարումը հաստատվեց!`, MAIN_MENU);
    
    // Տեղեկացնում ենք բոլոր ադմիններին
    ADMIN_IDS.forEach(id => bot.sendMessage(id, `✅ Օգտատեր ${userId}-ը հաստատվեց ադմին ${msg.chat.id}-ի կողմից:`));
});

// Մերժում (Reject)
bot.onText(/\/reject (\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    bot.sendMessage(userId, "❌ Ձեր վճարումը մերժվեց:");
    ADMIN_IDS.forEach(id => bot.sendMessage(id, `❌ Օգտատեր ${userId}-ը մերժվեց ադմին ${msg.chat.id}-ի կողմից:`));
});

// Չեկի տեղադրում (Set Check)
bot.onText(/\/setcheck (\w+) (.+)/s, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const pkgKey = match[1];
    const text = match[2];
    if (activeChecks.hasOwnProperty(pkgKey)) {
        activeChecks[pkgKey] = text;
        saveData(CHECKS_FILE, activeChecks);
        bot.sendMessage(msg.chat.id, `✅ Չեկը թարմացվեց ${pkgKey}-ի համար:`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ Սխալ pkg անուն:");
    }
});

console.log("🤖 Բոտը աշխատում է (Multi-Admin mode)...");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// ---- ԿՈՆՖԻԳՈՒՐԱՑԻԱ ----
const TOKEN = "8781934221:AAHlyKDXM2ja6lPeOGHUC7oB5ir5bNQ0qyw";
const CARD_NUMBER = "5181800050618613";
const ADMIN_IDS = [1005008069, 1307510432]; 

const SUBS_FILE = "./subscribers.json";
const PROMO_FILE = "./used_promos.json";
const CHECKS_FILE = "./active_checks.json";
const SETTINGS_FILE = "./settings.json";

const DISCLAIMER = "\n\n⚠️ Ուշադրություն. Մենք պատասխանատվություն չենք կրում չեկերի արդյունքների համար: Խաղադրույք կատարեք սեփական պատասխանատվությամբ:";

// ---- ՖՈՒՆԿՑԻԱՆԵՐ ----
function loadData(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) { console.error("Error loading file:", filePath); }
    return defaultValue;
}
function saveData(filePath, data) { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }

const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

// ---- ԲԵՌՆՈՒՄ ----
let subscribers = loadData(SUBS_FILE, {});
let usedPromos = loadData(PROMO_FILE, []);
const DEFAULT_TEXT = "դեռ տեղադրված չէ:";

let activeChecks = loadData(CHECKS_FILE, {
    pkg_5: `Այսօրվա x5 չեկը ${DEFAULT_TEXT}`,
    pkg_10: `Այսօրվա x10 չեկը ${DEFAULT_TEXT}`,
    pkg_20: `Այսօրվա x20 չեկը ${DEFAULT_TEXT}`,
    pkg_30: `Այսօրվա x30 չեկը ${DEFAULT_TEXT}`,
    pkg_cl: `Champions League չեկը ${DEFAULT_TEXT}`
});
let settings = loadData(SETTINGS_FILE, { currentPromo: "GOAL10", promoCount: 0 });

const userStates = new Map();
const pendingPayments = new Map();
const bot = new TelegramBot(TOKEN, { polling: true });

const PACKAGES = {
    pkg_5:  { label: "Գործակից x5",  price: 0 },
    pkg_10: { label: "Գործակից x10", price: 3000 },
    pkg_20: { label: "Գործակից x20", price: 7000 },
    pkg_30: { label: "Գործակից x30", price: 10000 },
    pkg_cl: { label: "Champions League", price: 2000 },
};

// ---- ՄԵՆՅՈՒՆԵՐ ----
const MAIN_MENU = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 Օրվա չեկերը" }],
            [{ text: "🎁 Պրոմոկոդ" }, { text: "👤 Կարգավիճակ" }],
            [{ text: "🆘 Օգնություն" }]
        ],
        resize_keyboard: true,
        persistent: true
    }
};

const BACK_MENU = {
    reply_markup: {
        keyboard: [[{ text: "🔙 Հետ գնալ" }]],
        resize_keyboard: true,
        persistent: true
    }
};

// ---- ՀՐԱՄԱՆՆԵՐ ----
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `👋 Բարի գալուստ Goalking բոտ!${DISCLAIMER}`, MAIN_MENU);
});

function handleChecks(chatId) {
    const buyButtons = {
        inline_keyboard: [
            [{ text: "⚡ x10 — 3,000 դրամ", callback_data: "buy_pkg_10" }],
            [{ text: "🔥 x20 — 7,000 դրամ", callback_data: "buy_pkg_20" }],
            [{ text: "💎 x30 — 10,000 դրամ", callback_data: "buy_pkg_30" }],
            [{ text: "🏆 Champions League — 2,000 դրամ", callback_data: "buy_pkg_cl" }]
        ]
    };
    let messageText = subscribers[chatId] 
        ? `📊 Ձեր չեկը (${PACKAGES[subscribers[chatId]].label}):\n\n${activeChecks[subscribers[chatId]]}${DISCLAIMER}\n\n━━━━━━━━━━━━━━\n📦 Գնել այլ փաթեթ՝`
        : "📦 Ընտրեք փաթեթ՝";
    bot.sendMessage(chatId, messageText, { reply_markup: buyButtons });
}

// ---- MESSAGE HANDLER ----
bot.on("message", (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    const user = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

    if (!text || text.startsWith("/")) return;

    if (text === "📊 Օրվա չեկերը") return handleChecks(chatId);
    if (text === "👤 Կարգավիճակ") {
        const pkg = subscribers[chatId] ? PACKAGES[subscribers[chatId]] : null;
        return bot.sendMessage(chatId, pkg ? `✅ Ակտիվ: ${pkg.label}` : "❌ Բաժանորդ չես:", MAIN_MENU);
    }

    // SUPPORT-Ի ՄՈՒՏՔ
    if (text === "🆘 Օգնություն") {
        userStates.set(chatId, "AWAITING_SUPPORT");
        return bot.sendMessage(chatId, "Գրեք ձեր հարցը կամ խնդիրը, և մեր ադմինիստրատորները կպատասխանեն ձեզ հենց այստեղ․", BACK_MENU);
    }

    if (text === "🎁 Պրոմոկոդ") {
        if (subscribers[chatId]) return bot.sendMessage(chatId, "✅ Դու արդեն ունես ակտիվ փաթեթ:", MAIN_MENU);
        userStates.set(chatId, "AWAITING_PROMO");
        return bot.sendMessage(chatId, "🎁 Մուտքագրեք պրոմոկոդը․", BACK_MENU);
    }

    if (text === "🔙 Հետ գնալ") {
        userStates.delete(chatId);
        return bot.sendMessage(chatId, "Գլխավոր մենյու", MAIN_MENU);
    }

    // SUPPORT ՀԱՂՈՐԴԱԳՐՈՒԹՅԱՆ ՓՈԽԱՆՑՈՒՄ ԱԴՄԻՆԻՆ
    if (userStates.get(chatId) === "AWAITING_SUPPORT") {
        ADMIN_IDS.forEach(adminId => {
            bot.sendMessage(adminId, `📥 Նոր հարց Support-ին:\n👤 Օգտատեր: ${user}\n🆔 ID: ${chatId}\n\n📝 Հարց: ${text}\n\n________________\nՊատասխանելու համար գրեք:\n/reply ${chatId} [տեքստ]`);
        });
        bot.sendMessage(chatId, "✅ Ձեր հաղորդագրությունն ուղարկվեց։ Սպասեք պատասխանի։", MAIN_MENU);
        userStates.delete(chatId);
        return;
    }

    // ՊՐՈՄՈԿՈԴԻ ՍՏՈՒԳՈՒՄ
    if (userStates.get(chatId) === "AWAITING_PROMO") {
        const inputCode = text.trim().toUpperCase();
        if (inputCode === settings.currentPromo.toUpperCase()) {
            if (usedPromos.includes(chatId)) {
                bot.sendMessage(chatId, "❌ Դու արդեն օգտագործել ես պրոմոկոդը:", MAIN_MENU);
            } else {
                usedPromos.push(chatId);
                subscribers[chatId] = "pkg_5";
                settings.promoCount += 1;
                saveData(SUBS_FILE, subscribers);
                saveData(PROMO_FILE, usedPromos);
                saveData(SETTINGS_FILE, settings);
                bot.sendMessage(chatId, `🎉 Պրոմոկոդը ակտիվացվեց!`, MAIN_MENU);
                handleChecks(chatId);
            }
        } else {
            bot.sendMessage(chatId, "❌ Սխալ կոդ:", BACK_MENU);
        }
        userStates.delete(chatId);
    }
});

// ---- ԱԴՄԻՆ ՀՐԱՄԱՆՆԵՐ ----

// ՊԱՏԱՍԽԱՆԵԼ SUPPORT-ԻՆ
bot.onText(/\/reply (\d+) ([\s\S]+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const replyText = match[2];

    bot.sendMessage(userId, `📩 Պատասխան ադմինիստրատորից:\n\n${replyText}\n\n________________\nGoalking Support`);
    bot.sendMessage(msg.chat.id, `✅ Պատասխանն ուղարկվեց ID: ${userId} օգտատիրոջը:`);
});

bot.onText(/\/viewcheck (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const pkgKey = match[1];
    if (activeChecks[pkgKey]) bot.sendMessage(msg.chat.id, `📝 ${PACKAGES[pkgKey].label}:\n\n${activeChecks[pkgKey]}`);
});

bot.onText(/\/stats/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    bot.sendMessage(msg.chat.id, `📊 Վիճակագրություն\n\n🎟 Պրոմո՝ ${settings.currentPromo}\n👥 Պրոմո օգտագործողներ՝ ${settings.promoCount}\n✅ Բաժանորդներ՝ ${Object.keys(subscribers).length}`);
});

bot.onText(/\/setcheck\s+(\w+)\s+([\s\S]+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const pkgKey = match[1].trim();
    if (activeChecks.hasOwnProperty(pkgKey)) {
        activeChecks[pkgKey] = match[2].trim();
        saveData(CHECKS_FILE, activeChecks);
        bot.sendMessage(msg.chat.id, `✅ Թարմացվեց ${pkgKey}-ի համար:`);
    }
});

bot.onText(/\/approve (\d+) (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    subscribers[match[1]] = match[2];
    saveData(SUBS_FILE, subscribers);
    bot.sendMessage(match[1], `🎉 Ձեր վճարումը հաստատվեց!`, MAIN_MENU);
});

// ---- CALLBACKS & PHOTO ----
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id.toString();
    if (query.data.startsWith("buy_")) {
        const pkgKey = query.data.replace("buy_", "");
        if (activeChecks[pkgKey].includes(DEFAULT_TEXT)) {
            bot.sendMessage(chatId, "❌ Չեկը պատրաստ չէ: Փորձեք 10 րոպեից:");
        } else {
            pendingPayments.set(chatId, pkgKey);
            bot.sendMessage(chatId, `💳 Քարտ: <code>${CARD_NUMBER}</code>\n💰 Գումար: ${PACKAGES[pkgKey].price.toLocaleString()} դրամ\n\nՈւղարկիր կտրոնի նկարը:${DISCLAIMER}`, { parse_mode: "HTML" });
        }
    }
    bot.answerCallbackQuery(query.id);
});

bot.on("photo", (msg) => {
    const chatId = msg.chat.id.toString();
    if (!pendingPayments.has(chatId)) return;
    const pkgKey = pendingPayments.get(chatId);
    ADMIN_IDS.forEach(id => bot.sendPhoto(id, msg.photo[msg.photo.length - 1].file_id, {
        caption: `💳 Վճարում\nUser: ${chatId}\nՓաթեթ: ${pkgKey}\nՀաստատել: /approve ${chatId} ${pkgKey}`
    }));
    bot.sendMessage(chatId, "📨 Կտրոնն ուղարկված է:", MAIN_MENU);
});

console.log("🤖 Բոտը պատրաստ է (Anonymous Support active)...");
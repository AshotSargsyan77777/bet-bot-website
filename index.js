const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// ---- ԿՈՆՖԻԳՈՒՐԱՑԻԱ ----
const TOKEN = "8781934221:AAHlyKDXM2ja6lPeOGHUC7oB5ir5bNQ0qyw";
const CARD_NUMBER = "5181800050618613";
const ADMIN_IDS = [1005008069, 1307510432]; 
const VIP_CHANNEL_LINK = "https://t.me/+gbMtx2wt-UA4NGRi";

const SUBS_FILE = "./subscribers.json";
const PROMO_FILE = "./used_promos.json";
const CHECKS_FILE = "./active_checks.json";
const SETTINGS_FILE = "./settings.json";
const VIP_FILE = "./vip_subscribers.json";

const DISCLAIMER = "\n\n⚠️ Ուշադրություն. Մենք պատասխանատվություն չենք կրում չեկերի արդյունքների համար: Խաղադրույք կատարեք սեփական պատասխանատվությամբ:";

// ---- ՖՈՒՆԿՑԻԱՆԵՐ ----
function loadData(filePath, defaultValue) {
    try { if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8")); } 
    catch (e) { console.error("Error loading file:", filePath); }
    return defaultValue;
}
function saveData(filePath, data) { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }
const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

// ---- ԲԵՌՆՈՒՄ ----
let subscribers = loadData(SUBS_FILE, {});
let vipSubscribers = loadData(VIP_FILE, {});
let usedPromos = loadData(PROMO_FILE, []);
const DEFAULT_TEXT = "դեռ տեղադրված չէ:";

let activeChecks = loadData(CHECKS_FILE, {
    pkg_5: `🎁 Պրոմո չեկը ${DEFAULT_TEXT}`,
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
    pkg_5:  { label: "🎁 Պրոմո Փաթեթ", price: 0 },
    pkg_10: { label: "Գործակից x10", price: 3000 },
    pkg_20: { label: "Գործակից x20", price: 7000 },
    pkg_30: { label: "Գործակից x30", price: 10000 },
    pkg_cl: { label: "🏆 Champions League", price: 2000 },
    pkg_vip: { label: "👑 VIP Կանալ", price: 4000 }
};

const MAIN_MENU = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 Օրվա չեկերը" }],
            [{ text: "👑 VIP Կանալ" }],
            [{ text: "🎁 Պրոմոկոդ" }, { text: "👤 Կարգավիճակ" }],
            [{ text: "🆘 Օգնություն" }]
        ],
        resize_keyboard: true,
        persistent: true
    }
};

const BACK_MENU = {
    reply_markup: { keyboard: [[{ text: "🔙 Հետ գնալ" }]], resize_keyboard: true, persistent: true }
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
        ? `📊 Ձեր չեկը (${PACKAGES[subscribers[chatId]].label}):\n\n${activeChecks[subscribers[chatId]]}${DISCLAIMER}`
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
    
    if (text === "👑 VIP Կանալ") {
        if (vipSubscribers[chatId]) return bot.sendMessage(chatId, `🎉 VIP հղումը՝\n${VIP_CHANNEL_LINK}`, MAIN_MENU);
        return bot.sendMessage(chatId, `👑 Միացեք VIP կանալին:\n💰 Արժեքը՝ 4,000 դրամ`, { 
            reply_markup: { inline_keyboard: [[{ text: "💎 Գնել մուտք", callback_data: "buy_pkg_vip" }]] } 
        });
    }

    if (text === "👤 Կարգավիճակ") {
        const pkg = subscribers[chatId] ? PACKAGES[subscribers[chatId]] : null;
        let st = pkg ? `✅ Ակտիվ չեկ: ${pkg.label}` : "❌ Ակտիվ չեկ չունես:";
        if (vipSubscribers[chatId]) st += "\n👑 VIP Կանալ: Ակտիվ է";
        return bot.sendMessage(chatId, st, MAIN_MENU);
    }

    if (text === "🆘 Օգնություն") {
        userStates.set(chatId, "AWAITING_SUPPORT");
        return bot.sendMessage(chatId, "Գրեք ձեր հարցը․", BACK_MENU);
    }

    if (text === "🎁 Պրոմոկոդ") {
        if (subscribers[chatId]) return bot.sendMessage(chatId, "✅ Դու արդեն ունես ակտիվ փաթեթ:", MAIN_MENU);
        userStates.set(chatId, "AWAITING_PROMO");
        return bot.sendMessage(chatId, "🎁 Մուտքագրեք պրոմոկոդը․", BACK_MENU);
    }

    if (text === "🔙 Հետ գնալ") { userStates.delete(chatId); return bot.sendMessage(chatId, "Գլխավոր մենյու", MAIN_MENU); }

    // Support
    if (userStates.get(chatId) === "AWAITING_SUPPORT") {
        ADMIN_IDS.forEach(id => bot.sendMessage(id, `📥 Support:\n👤 User: ${user}\n🆔 ID: ${chatId}\n📝 Հարց: ${text}\n\n/reply ${chatId} [տեքստ]`));
        bot.sendMessage(chatId, "✅ Ուղարկվեց։", MAIN_MENU);
        userStates.delete(chatId); return;
    }

    // Promo Activation (ՎԵՐԱԿԱՆԳՆՎԱԾ ԾԱՆՈՒՑՈՒՄՆԵՐՈՎ)
    if (userStates.get(chatId) === "AWAITING_PROMO") {
        const inputCode = text.trim().toUpperCase();
        const activePromo = settings.currentPromo.toUpperCase();

        if (inputCode === activePromo) {
            if (usedPromos.includes(chatId)) {
                bot.sendMessage(chatId, "❌ Արդեն օգտագործված է:", MAIN_MENU);
                ADMIN_IDS.forEach(id => bot.sendMessage(id, `⚠️ ${user} (ID: ${chatId}) նորից փորձեց [${inputCode}]`));
            } else {
                usedPromos.push(chatId); subscribers[chatId] = "pkg_5"; settings.promoCount += 1;
                saveData(SUBS_FILE, subscribers); saveData(PROMO_FILE, usedPromos); saveData(SETTINGS_FILE, settings);
                bot.sendMessage(chatId, `🎉 Պրոմոկոդը ակտիվացվեց!`, MAIN_MENU); handleChecks(chatId);
                ADMIN_IDS.forEach(id => bot.sendMessage(id, `✅ ${user} (ID: ${chatId}) ակտիվացրեց պրոմոկոդը` ));
            }
        } else {
            bot.sendMessage(chatId, "❌ Սխալ կոդ:", BACK_MENU);
            ADMIN_IDS.forEach(id => bot.sendMessage(id, `❌ ${user} (ID: ${chatId}) գրեց սխալ պրոմոկոդ՝ [${inputCode}]`));
        }
        userStates.delete(chatId);
    }
});

// ---- CALLBACKS & PHOTO ----
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id.toString();
    const user = query.from.username ? `@${query.from.username}` : query.from.first_name;
    const pkgKey = query.data.replace("buy_", "");
    if (PACKAGES[pkgKey]) {
        if (pkgKey !== "pkg_vip" && activeChecks[pkgKey] && activeChecks[pkgKey].includes(DEFAULT_TEXT)) {
            bot.sendMessage(chatId, "❌ Չեկը պատրաստ չէ:");
            ADMIN_IDS.forEach(id => bot.sendMessage(id, `🚨 ՇՏԱՊ! ${user} փորձեց գնել ${pkgKey}`));
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
        caption: `💳 Վճարում\nUser: ${chatId}\nՓաթեթ: ${PACKAGES[pkgKey].label}\n/approve ${chatId} ${pkgKey}\n/reject ${chatId}`
    }));
    bot.sendMessage(chatId, "📨 Կտրոնն ուղարկված է ադմիններին:", MAIN_MENU);
});

// ---- ԱԴՄԻՆՆԵՐ ----
bot.onText(/\/approve (\d+) (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const pkgKey = match[2];
    if (pkgKey === "pkg_vip") {
        vipSubscribers[userId] = true; saveData(VIP_FILE, vipSubscribers);
        bot.sendMessage(userId, `🎉 VIP Մուտքը ակտիվացվեց!\n🔗 ${VIP_CHANNEL_LINK}`, MAIN_MENU);
    } else {
        subscribers[userId] = pkgKey; saveData(SUBS_FILE, subscribers);
        bot.sendMessage(userId, `🎉 Ձեր վճարումը հաստատվեց!`, MAIN_MENU);
    }
    bot.sendMessage(msg.chat.id, "✅ Հաստատված է:");
});

bot.onText(/\/setpromo (.+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    settings.currentPromo = match[1].trim(); settings.promoCount = 0; saveData(SETTINGS_FILE, settings);
    for (const id in subscribers) { if (subscribers[id] === "pkg_5") delete subscribers[id]; }
    saveData(SUBS_FILE, subscribers); usedPromos = []; saveData(PROMO_FILE, usedPromos);
    bot.sendMessage(msg.chat.id, `✅ Նոր պրոմո՝ ${settings.currentPromo.toUpperCase()} (Պրոմո բազան մաքրվեց)`, MAIN_MENU);
});

bot.onText(/\/setcheck\s+(\w+)\s+([\s\S]+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    if (activeChecks.hasOwnProperty(match[1].trim())) {
        activeChecks[match[1].trim()] = match[2].trim(); saveData(CHECKS_FILE, activeChecks);
        bot.sendMessage(msg.chat.id, `✅ Թարմացվեց:`);
    }
});

bot.onText(/\/stats/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    bot.sendMessage(msg.chat.id, `📊 Վիճակագրություն\n🎟 Պրոմո՝ ${settings.currentPromo}\n👥 Պրոմո օգտագործողներ՝ ${settings.promoCount}\n✅ Չեկի բաժանորդներ՝ ${Object.keys(subscribers).length}\n👑 VIP բաժանորդներ՝ ${Object.keys(vipSubscribers).length}`, MAIN_MENU);
});

bot.onText(/\/reply (\d+) ([\s\S]+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    bot.sendMessage(match[1], `📩 Պատասխան ադմինից:\n\n${match[2]}\n\n________________\nGoalking Support`);
});

bot.onText(/\/viewcheck (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    if (activeChecks[match[1]]) bot.sendMessage(msg.chat.id, `📝 ${activeChecks[match[1]]}`);
});

console.log("🤖 Բոտը պատրաստ է...");
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

// ---- ՖՈՒՆԿՑԻԱՆԵՐ ----
function loadData(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) { console.error("Error loading file:", filePath); }
    return defaultValue;
}
function saveData(filePath, data) { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }

const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

// ---- ՏՎՅԱԼՆԵՐԻ ՎԵՐԱԿԱՆԳՆՈՒՄ ----
let subscribers = loadData(SUBS_FILE, {});
let usedPromos = loadData(PROMO_FILE, []);

// ԱՅՍՏԵՂ ՏԵՂԱԴՐՎԱԾ Է ՁԵՐ ՉԵԿԸ ՈՐՊԵՍ ՆԱԽՆԱԿԱՆ ՏԵՔՍՏ
let activeChecks = loadData(CHECKS_FILE, {
    pkg_5: `📊 Այսօրվա x5 չեկը՝

⚽ Օսասունա - Բետիս  
→ Բետիս ԻՏԲ 0.5  
📈 Կֆ՝ 1.38

⚽ Քրիսթալ Փելաս - Նյուքասլ  
→ Տոտալ 1.5-ից բարձր  
📈 Կֆ՝ 1.24

⚽ Չելսի - Մանչեսթեր Սիթի  
→ Երկուսն էլ կխփեն — Այո  
📈 Կֆ՝ 1.50

⚽ Նոթինգեմ Ֆորեստ - Ասթոն Վիլա  
→ Տոտալ 1.5-ից բարձր  
📈 Կֆ՝ 1.30

⚽ Կոմո 1907 - Ինտեր  
→ Տոտալ 2.0-ից բարձր  
📈 Կֆ՝ 1.43

📊 Ընդհանուր կֆ՝ 4.77`,
    pkg_10: "Այսօրվա x10 չեկը դեռ տեղադրված չէ:",
    pkg_20: "Այսօրվա x20 չեկը դեռ տեղադրված չէ:",
    pkg_30: "Այսօրվա x30 չեկը դեռ տեղադրված չէ:"
});

let settings = loadData(SETTINGS_FILE, { currentPromo: "GOAL10" });

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

const PACKAGES = {
    pkg_5:  { label: "Գործակից x5",  price: 0 },
    pkg_10: { label: "Գործակից x10", price: 3000 },
    pkg_20: { label: "Գործակից x20", price: 7000 },
    pkg_30: { label: "Գործակից x30", price: 10000 },
};

// ---- ՀՐԱՄԱՆՆԵՐ ----
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 Բարի գալուստ!", MAIN_MENU);
});

function handleChecks(chatId) {
    const buyButtons = {
        inline_keyboard: [
            [{ text: "⚡ x10 — 3,000 դրամ", callback_data: "buy_pkg_10" }],
            [{ text: "🔥 x20 — 7,000 դրամ", callback_data: "buy_pkg_20" }],
            [{ text: "💎 x30 — 10,000 դրամ", callback_data: "buy_pkg_30" }],
        ]
    };

    let messageText = "";
    if (subscribers[chatId]) {
        const pkgKey = subscribers[chatId];
        const checkContent = activeChecks[pkgKey] || "❌ Չեկը դեռ տեղադրված չէ:";
        const label = PACKAGES[pkgKey] ? PACKAGES[pkgKey].label : "Անհայտ";
        messageText = `📊 Ձեր չեկը (${label}):\n\n${checkContent}\n\n━━━━━━━━━━━━━━\n📦 Գնել այլ փաթեթ՝`;
    } else {
        messageText = "📦 Դուք չունեք ակտիվ բաժանորդագրություն: Ընտրեք փաթեթ՝";
    }
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
    if (text === "🎁 Պրոմոկոդ") {
        if (subscribers[chatId]) return bot.sendMessage(chatId, "✅ Դու արդեն ունես ակտիվ փաթեթ (ստուգիր 'Օրվա չեկերը'):", MAIN_MENU);
        userStates.set(chatId, "AWAITING_PROMO");
        return bot.sendMessage(chatId, "🎁 Մուտքագրեք ձեր պրոմոկոդը․", BACK_MENU);
    }
    if (text === "🔙 Հետ գնալ") {
        userStates.delete(chatId);
        return bot.sendMessage(chatId, "Գլխավոր մենյու", MAIN_MENU);
    }

    if (userStates.get(chatId) === "AWAITING_PROMO") {
        const inputCode = text.trim().toUpperCase();
        const activePromo = settings.currentPromo.toUpperCase();

        if (inputCode === activePromo) {
            if (usedPromos.includes(chatId)) {
                bot.sendMessage(chatId, "❌ Դու արդեն օգտագործել ես պրոմոկոդը:", MAIN_MENU);
            } else {
                usedPromos.push(chatId);
                subscribers[chatId] = "pkg_5";
                saveData(SUBS_FILE, subscribers);
                saveData(PROMO_FILE, usedPromos);
                bot.sendMessage(chatId, `🎉 Պրոմոկոդը ակտիվացվեց!`, MAIN_MENU);
                handleChecks(chatId);
                ADMIN_IDS.forEach(id => bot.sendMessage(id, `✅ ${user} ակտիվացրեց պրոմոկոդը`));
            }
        } else {
            bot.sendMessage(chatId, "❌ Սխալ կոդ:", BACK_MENU);
        }
        userStates.delete(chatId);
    }
});

// ---- ԱԴՄԻՆ ՀՐԱՄԱՆՆԵՐ ----
bot.onText(/\/setcheck\s+(\w+)\s+([\s\S]+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const pkgKey = match[1].trim();
    const text = match[2].trim();
    if (activeChecks.hasOwnProperty(pkgKey)) {
        activeChecks[pkgKey] = text;
        saveData(CHECKS_FILE, activeChecks);
        bot.sendMessage(msg.chat.id, `✅ Չեկը թարմացվեց ${pkgKey}-ի համար:`);
    } else {
        bot.sendMessage(msg.chat.id, "❌ Սխալ pkg անուն:");
    }
});

bot.onText(/\/setpromo (.+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    settings.currentPromo = match[1].trim();
    saveData(SETTINGS_FILE, settings);
    bot.sendMessage(msg.chat.id, `✅ Նոր պրոմոկոդ՝ ${settings.currentPromo.toUpperCase()}`);
});

bot.onText(/\/approve (\d+) (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const pkgKey = match[2];
    subscribers[userId] = pkgKey;
    saveData(SUBS_FILE, subscribers);
    bot.sendMessage(userId, `🎉 Ձեր վճարումը հաստատվեց!`, MAIN_MENU);
    ADMIN_IDS.forEach(id => bot.sendMessage(id, `✅ ${userId} հաստատվեց:`));
});

// ---- CALLBACKS ----
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id.toString();
    if (query.data.startsWith("buy_")) {
        const pkgKey = query.data.replace("buy_", "");
        pendingPayments.set(chatId, pkgKey);
        bot.sendMessage(chatId, `💳 Քարտ: <code>${CARD_NUMBER}</code>\n💰 Գումար: ${PACKAGES[pkgKey].price.toLocaleString()} դրամ\nՈւղարկիր կտրոնի նկարը:`, { parse_mode: "HTML" });
    }
    bot.answerCallbackQuery(query.id);
});

bot.on("photo", (msg) => {
    const chatId = msg.chat.id.toString();
    if (!pendingPayments.has(chatId)) return;
    const pkgKey = pendingPayments.get(chatId);
    ADMIN_IDS.forEach(adminId => {
        bot.sendPhoto(adminId, msg.photo[msg.photo.length - 1].file_id, {
            caption: `💳 Վճարում\nUser: ${chatId}\nՓաթեթ: ${pkgKey}\nՀաստատել: /approve ${chatId} ${pkgKey}`
        });
    });
    bot.sendMessage(chatId, "📨 Կտրոնն ուղարկված է ադմիններին:", MAIN_MENU);
});

console.log("🤖 Բոտը պատրաստ է...");
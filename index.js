const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// ---- ԿՈՆՖԻԳՈՒՐԱՑԻԱ ----
const TOKEN = "8781934221:AAHlyKDXM2ja6lPeOGHUC7oB5ir5bNQ0qyw";
const CARD_NUMBER = "5181800050618613";
const PROMO_CODE = "QWAS0101";
const ADMIN_IDS = [1005008069, 1307510432]; 

const SUBS_FILE = "./subscribers.json";
const PROMO_FILE = "./used_promos.json";
const CHECKS_FILE = "./active_checks.json";

// ---- ՏՎՅԱԼՆԵՐ ----
function loadData(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) { console.error("Error loading file:", filePath); }
    return defaultValue;
}
function saveData(filePath, data) { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }

const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

let subscribers = loadData(SUBS_FILE, {});
let usedPromos = loadData(PROMO_FILE, []);
let activeChecks = loadData(CHECKS_FILE, {
    pkg_5: "Այսօրվա x5 չեկը դեռ տեղադրված չէ:",
    pkg_10: "Այսօրվա x10 չեկը դեռ տեղադրված չէ:",
    pkg_20: "Այսօրվա x20 չեկը դեռ տեղադրված չէ:",
    pkg_30: "Այսօրվա x30 չեկը դեռ տեղադրված չէ:"
});

const userStates = new Map();
const pendingPayments = new Map();
const bot = new TelegramBot(TOKEN, { polling: true });

// ---- ՄԵՆՅՈՒ ----
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

bot.setMyCommands([
    { command: '/start', description: 'Գլխավոր մենյու' },
    { command: '/checks', description: 'Տեսնել չեկերը' }
]);

const PACKAGES = {
    pkg_5:  { label: "Գործակից x5",  price: 0 },
    pkg_10: { label: "Գործակից x10", price: 3000 },
    pkg_20: { label: "Գործակից x20", price: 7000 },
    pkg_30: { label: "Գործակից x30", price: 10000 },
};

// ---- ՀՐԱՄԱՆՆԵՐ ----
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 Բարի գալուստ! Օգտվեք ներքևի կոճակներից․", MAIN_MENU);
});

function handleChecks(chatId) {
    let messageText = "";
    const buyButtons = {
        inline_keyboard: [
            [{ text: "⚡ x10 — 3,000 դրամ", callback_data: "buy_pkg_10" }],
            [{ text: "🔥 x20 — 7,000 դրամ", callback_data: "buy_pkg_20" }],
            [{ text: "💎 x30 — 10,000 դրամ", callback_data: "buy_pkg_30" }],
        ]
    };
    if (subscribers[chatId]) {
        const pkgKey = subscribers[chatId];
        messageText = `📊 Ձեր չեկը (${PACKAGES[pkgKey].label}):\n\n${activeChecks[pkgKey] || "❌ Դեռ չկա"}\n\n━━━━━━━━━━━━━━\n📦 Գնել այլ փաթեթ՝`;
    } else {
        messageText = "📦 Ընտրեք փաթեթ՝";
    }
    bot.sendMessage(chatId, messageText, { reply_markup: { ...buyButtons, ...MAIN_MENU.reply_markup } });
}

// ---- MESSAGE HANDLER (Ադմինի ծանուցումներով) ----
bot.on("message", (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    const user = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

    if (!text || text.startsWith("/")) return;

    if (text === "📊 Օրվա չեկերը") return handleChecks(chatId);
    if (text === "👤 Կարգավիճակ") {
        const pkg = subscribers[chatId] ? PACKAGES[subscribers[chatId]] : null;
        bot.sendMessage(chatId, pkg ? `✅ Ակտիվ: ${pkg.label}` : "❌ Բաժանորդ չես:", MAIN_MENU);
        return;
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

    // ՊՐՈՄՈԿՈԴԻ ՍՏՈՒԳՈՒՄ ԵՎ ԱԴՄԻՆԻՆ ԾԱՆՈՒՑՈՒՄ
    if (userStates.get(chatId) === "AWAITING_PROMO") {
        const code = text.trim();

        if (code.toUpperCase() === PROMO_CODE.toUpperCase()) {
            if (usedPromos.includes(chatId)) {
                bot.sendMessage(chatId, "❌ Դու արդեն օգտագործել ես պրոմոկոդը:", MAIN_MENU);
                // Ծանուցում ադմինին (Կրկնակի փորձ)
                ADMIN_IDS.forEach(id => bot.sendMessage(id, `⚠️ ${user} (ID: ${chatId}) փորձեց կրկին օգտագործել պրոմոկոդը:`));
            } else {
                usedPromos.push(chatId);
                subscribers[chatId] = "pkg_5";
                saveData(SUBS_FILE, subscribers);
                saveData(PROMO_FILE, usedPromos);
                bot.sendMessage(chatId, `🎉 Պրոմոկոդը ակտիվացվեց!`, MAIN_MENU);
                handleChecks(chatId);
                // Ծանուցում ադմինին (Ճիշտ կոդ)
                ADMIN_IDS.forEach(id => bot.sendMessage(id, `✅ ${user} (ID: ${chatId}) ակտիվացրեց պրոմոկոդը:`));
            }
        } else {
            bot.sendMessage(chatId, "❌ Սխալ կոդ:", BACK_MENU);
            // Ծանուցում ադմինին (Սխալ կոդ)
            ADMIN_IDS.forEach(id => bot.sendMessage(id, `❌ ${user} (ID: ${chatId}) գրեց սխալ պրոմոկոդ: [${code}]`));
        }
        userStates.delete(chatId);
    }
});

// ---- CALLBACK QUERIES ----
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id.toString();
    if (query.data.startsWith("buy_")) {
        const pkgKey = query.data.replace("buy_", "");
        pendingPayments.set(chatId, pkgKey);
        bot.sendMessage(chatId, `💳 Քարտ: <code>${CARD_NUMBER}</code>\n💰 Գումար: ${PACKAGES[pkgKey].price.toLocaleString()} դրամ\nՈւղարկիր կտրոնի նկարը:`, { parse_mode: "HTML" });
    }
    bot.answerCallbackQuery(query.id);
});

// ---- PHOTO ----
bot.on("photo", (msg) => {
    const chatId = msg.chat.id.toString();
    if (!pendingPayments.has(chatId)) return;
    const pkgKey = pendingPayments.get(chatId);
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    ADMIN_IDS.forEach(adminId => {
        bot.sendPhoto(adminId, fileId, {
            caption: `💳 Վճարում\nUser: ${chatId}\nՓաթեթ: ${pkgKey}\n\nՀաստատել: /approve ${chatId} ${pkgKey}\nՄերժել: /reject ${chatId}`
        });
    });
    bot.sendMessage(chatId, "📨 Կտրոնն ուղարկված է ադմիններին:", MAIN_MENU);
});

// ---- ADMIN COMMANDS ----
bot.onText(/\/approve (\d+) (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const pkgKey = match[2];
    subscribers[userId] = pkgKey;
    saveData(SUBS_FILE, subscribers);
    bot.sendMessage(userId, `🎉 Ձեր վճարումը հաստատվեց!`, MAIN_MENU);
    ADMIN_IDS.forEach(id => bot.sendMessage(id, `✅ Օգտատեր ${userId}-ը հաստատվեց:`));
});

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

console.log("🤖 Բոտը պատրաստ է (Admin Notifications active)...");
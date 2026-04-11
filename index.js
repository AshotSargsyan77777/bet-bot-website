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

const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

// ---- ՏՎՅԱԼՆԵՐԻ ՎԵՐԱԿԱՆԳՆՈՒՄ ----
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

// ---- ՉԵԿԵՐԻ ՖՈՒՆԿՑԻԱ (ՈՒՂՂՎԱԾ) ----
function handleChecks(chatId) {
    let messageText = "";
    
    // Գնման կոճակները միշտ նույնն են
    const buyButtons = {
        inline_keyboard: [
            [{ text: "⚡ x10 — 3,000 դրամ", callback_data: "buy_pkg_10" }],
            [{ text: "🔥 x20 — 7,000 դրամ", callback_data: "buy_pkg_20" }],
            [{ text: "💎 x30 — 10,000 դրամ", callback_data: "buy_pkg_30" }],
        ]
    };

    if (subscribers[chatId]) {
        const pkgKey = subscribers[chatId];
        const checkContent = activeChecks[pkgKey] || "❌ Չեկը դեռ տեղադրված չէ:";
        const pkgLabel = PACKAGES[pkgKey] ? PACKAGES[pkgKey].label : "Անհայտ փաթեթ";
        
        messageText = `📊 Ձեր չեկը (${pkgLabel}):\n\n${checkContent}\n\n━━━━━━━━━━━━━━\n📦 Ցանկանու՞մ եք գնել ավելի բարձր գործակցով փաթեթ՝`;
    } else {
        messageText = "📦 Դուք չունեք ակտիվ բաժանորդագրություն: Ընտրեք փաթեթ՝";
    }

    bot.sendMessage(chatId, messageText, { reply_markup: buyButtons });
}

// ---- ՀԱՂՈՐԴԱԳՐՈՒԹՅՈՒՆՆԵՐԻ ՄՇԱԿՈՒՄ ----
bot.on("message", (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    if (!text) return;

    if (text === "📊 Օրվա չեկերը") return handleChecks(chatId);
    if (text === "👤 Կարգավիճակ") {
        const pkg = subscribers[chatId] ? PACKAGES[subscribers[chatId]] : null;
        const st = pkg ? `✅ Ակտիվ փաթեթ: ${pkg.label}` : "❌ Ակտիվ բաժանորդ չես:";
        return bot.sendMessage(chatId, st, MAIN_MENU);
    }
    if (text === "🎁 Պրոմոկոդ") {
        if (subscribers[chatId]) return bot.sendMessage(chatId, "✅ Դու արդեն ունես ակտիվ փաթեթ (օգտվիր 'Օրվա չեկերը' բաժնից):", MAIN_MENU);
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
                bot.sendMessage(chatId, `🎉 Պրոմոկոդը ակտիվացվեց!`, MAIN_MENU);
                handleChecks(chatId); // Միանգամից ցույց տալ չեկը և մյուս փաթեթները
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
        if (PACKAGES[pkgKey]) {
            pendingPayments.set(chatId, pkgKey);
            bot.sendMessage(chatId, `💳 Քարտ: <code>${CARD_NUMBER}</code>\n💰 Գումար: ${PACKAGES[pkgKey].price.toLocaleString()} դրամ\nՈւղարկիր կտրոնի նկարը:`, { parse_mode: "HTML" });
        }
    }
    bot.answerCallbackQuery(query.id);
});

// ---- ԼՈՒՍԱՆԿԱՐ ----
bot.on("photo", (msg) => {
    const chatId = msg.chat.id.toString();
    if (!pendingPayments.has(chatId)) return;
    const pkgKey = pendingPayments.get(chatId);
    const fileId = msg.photo[msg.photo.length - 1].file_id;

    ADMIN_IDS.forEach(adminId => {
        if (adminId !== 0) {
            bot.sendPhoto(adminId, fileId, {
                caption: `💳 Վճարում\nUser: ${chatId}\nՓաթեթ: ${pkgKey}\n\nՀաստատել: /approve ${chatId} ${pkgKey}\nՄերժել: /reject ${chatId}`
            });
        }
    });
    bot.sendMessage(chatId, "📨 Կտրոնն ուղարկված է ադմիններին:");
});

// ---- ԱԴՄԻՆ ՀՐԱՄԱՆՆԵՐ ----
bot.onText(/\/approve (\d+) (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const pkgKey = match[2];
    subscribers[userId] = pkgKey;
    saveData(SUBS_FILE, subscribers);
    bot.sendMessage(userId, `🎉 Ձեր վճարումը հաստատվեց!`, MAIN_MENU);
    ADMIN_IDS.forEach(id => bot.sendMessage(id, `✅ Օգտատեր ${userId}-ը հաստատվեց:`));
});

bot.onText(/\/reject (\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    bot.sendMessage(match[1], "❌ Ձեր վճարումը մերժվեց:");
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

console.log("🤖 Բոտը թարմացվել է...");
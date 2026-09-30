const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const express = require("express");
require("dotenv").config();

// ================= ԿՈՆՖԻԳՈՒՐԱՑԻԱ =================
const TOKEN = process.env.BOT_TOKEN;
const CARD_NUMBER = process.env.CARD_NUMBER;
const N8N_INTERNAL_KEY = process.env.N8N_INTERNAL_KEY;
const ADMIN_IDS = (process.env.ADMIN_ID || "").split(",").map(Number).filter(Boolean);
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const DATA_DIR = process.env.DATA_DIR || "."; // Render-ում՝ Disk mount path, օր. /data
const PROMO_FROM_3X = process.env.PROMO_FROM_3X === "1"; // 1 = պրոմո չեկը ավտոմատ = standard_3x
const VIP_CHANNEL_LINK = "https://t.me/+gbMtx2wt-UA4NGRi";

if (!TOKEN) { console.error("BOT_TOKEN missing"); process.exit(1); }

const SUBS_FILE = path.join(DATA_DIR, "subscribers.json");
const PROMO_FILE = path.join(DATA_DIR, "used_promos.json");
const CHECKS_FILE = path.join(DATA_DIR, "active_checks.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const VIP_FILE = path.join(DATA_DIR, "vip_subscribers.json");

const DISCLAIMER = "\n\n⚠️ Ուշադրություն. Մենք պատասխանատվություն չենք կրում չեկերի արդյունքների համար: Խաղադրույք կատարեք սեփական պատասխանատվությամբ:";
const DEFAULT_TEXT = "դեռ տեղադրված չէ:";
const UNAVAILABLE_TEXT = "այսօր հասանելի չէ:";

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e && e.message ? e.message : e));

// ================= EXPRESS =================
const app = express();
app.use(express.json({ limit: "2mb" }));

// ================= ՖԱՅԼԵՐ =================
function loadData(filePath, defaultValue) {
    try { if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch (e) { console.error("Error loading file:", filePath, e.message); }
    return defaultValue;
}
function saveData(filePath, data) {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tmp = filePath + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, filePath);
    } catch (e) { console.error("Error saving file:", filePath, e.message); }
}
const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

function todayYerevan() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yerevan" }).format(new Date());
}

// ================= ՏՎՅԱԼՆԵՐ =================
let subscribers = loadData(SUBS_FILE, {});
let vipSubscribers = loadData(VIP_FILE, {});
let usedPromos = loadData(PROMO_FILE, []);
let settings = loadData(SETTINGS_FILE, { currentPromo: "SHOT5", promoCount: 0, checksDate: null });

let activeChecks = loadData(CHECKS_FILE, {
    standard_3x:   `Այսօրվա x3 չեկը ${DEFAULT_TEXT}`,
    standard_5x:   `Այսօրվա x5 չեկը ${DEFAULT_TEXT}`,
    standard_10x:  `Այսօրվա x10 չեկը ${DEFAULT_TEXT}`,
    standard_20x:  `Այսօրվա x20 չեկը ${DEFAULT_TEXT}`,
    champions_3x:  `Champions League x3 չեկը ${DEFAULT_TEXT}`,
    champions_5x:  `Champions League x5 չեկը ${DEFAULT_TEXT}`,
    champions_10x: `Champions League x10 չեկը ${DEFAULT_TEXT}`,
    pkg_5:         `🎁 Պրոմո չեկը ${DEFAULT_TEXT}`,
});

const PACKAGES = {
    standard_3x:   { label: "Գործակից x3",  price: 2000 },
    standard_5x:   { label: "Գործակից x5",  price: 3000 },
    standard_10x:  { label: "Գործակից x10", price: 5000 },
    standard_20x:  { label: "Գործակից x20", price: 7000 },
    champions_3x:  { label: "🏆 Champions League x3",  price: 2000 },
    champions_5x:  { label: "🏆 Champions League x5",  price: 3000 },
    champions_10x: { label: "🏆 Champions League x10", price: 7000 },
    pkg_vip: { label: "👑 VIP Կանալ", price: 5000 },
    pkg_5:   { label: "🎁 Պրոմո Փաթեթ", price: 0 },
};
const N8N_KEYS = Object.keys(PACKAGES).filter((k) => k !== "pkg_vip" && k !== "pkg_5");

// չեկը պատրաստ է՝ եթե ունի իրական տեքստ և այսօրվա ամսաթիվ (պրոմոն՝ ձեռքով, ամսաթվից անկախ)
function isCheckReady(key) {
    const t = activeChecks[key];
    if (!t) return false;
    if (t.includes(DEFAULT_TEXT) || t.includes(UNAVAILABLE_TEXT)) return false;
    if (key === "pkg_5" && !PROMO_FROM_3X) return true;
    return settings.checksDate === todayYerevan();
}

function getCheckText(key) {
    if (isCheckReady(key)) return activeChecks[key];
    return `${PACKAGES[key].label} չեկը ${UNAVAILABLE_TEXT}`;
}

// ================= ԲՈՏ =================
const bot = new TelegramBot(TOKEN);
const WEBHOOK_PATH = `/bot${TOKEN}`;
const userStates = new Map();
const pendingPayments = new Map();

const safeSend = (id, text, opts) => bot.sendMessage(id, text, opts).catch((e) => console.error("send error:", id, e.message));

function syncAdmins(message, senderId) {
    ADMIN_IDS.forEach((id) => {
        if (id !== Number(senderId)) safeSend(id, `🔔 Admin Sync:\n${message}`);
    });
}

const MAIN_MENU = {
    reply_markup: {
        keyboard: [[{ text: "📊 Օրվա չեկերը" }], [{ text: "👑 VIP Կանալ" }], [{ text: "🎁 Պրոմոկոդ" }, { text: "👤 Կարգավիճակ" }], [{ text: "🆘 Օգնություն" }]],
        resize_keyboard: true, persistent: true,
    },
};
const BACK_MENU = {
    reply_markup: { keyboard: [[{ text: "🔙 Հետ գնալ" }]], resize_keyboard: true, persistent: true },
};

// ================= ՀՐԱՄԱՆՆԵՐ =================
bot.onText(/^\/start/, (msg) => {
    safeSend(msg.chat.id, `👋 Բարի գալուստ Goalking բոտ!${DISCLAIMER}`, MAIN_MENU);
});

function buyButtons() {
    const row = (icon, name, key) => [{
        text: `${icon} ${name} — ${PACKAGES[key].price.toLocaleString("en-US")} դրամ${isCheckReady(key) ? "" : " (հասանելի չէ)"}`,
        callback_data: `buy_${key}`,
    }];
    return {
        inline_keyboard: [
            row("⚡", "x3", "standard_3x"),
            row("🎯", "x5", "standard_5x"),
            row("🔥", "x10", "standard_10x"),
            row("💎", "x20", "standard_20x"),
            row("🏆", "CL x3", "champions_3x"),
            row("🏆", "CL x5", "champions_5x"),
            row("🏆", "CL x10", "champions_10x"),
        ],
    };
}

function handleChecks(chatId) {
    const key = subscribers[chatId];
    let text = "📦 Ընտրեք փաթեթ՝";
    if (key && PACKAGES[key]) {
        text = `📊 Ձեր չեկը (${PACKAGES[key].label}):\n\n${getCheckText(key)}${DISCLAIMER}\n\n📦 Այլ փաթեթ գնելու համար՝`;
    }
    safeSend(chatId, text, { reply_markup: buyButtons() });
}

// ================= ՀԱՂՈՐԴԱԳՐՈՒԹՅՈՒՆՆԵՐ =================
bot.on("message", (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;
    const user = msg.from && msg.from.username ? `@${msg.from.username}` : (msg.from && msg.from.first_name) || chatId;

    if (!text || text.startsWith("/")) return;

    if (text === "📊 Օրվա չեկերը") return handleChecks(chatId);

    if (text === "👑 VIP Կանալ") {
        if (vipSubscribers[chatId]) return safeSend(chatId, `🎉 VIP հղումը՝\n${VIP_CHANNEL_LINK}`, MAIN_MENU);
        return safeSend(chatId, `👑 Միացեք VIP կանալին:\n💰 Արժեքը՝ 5,000 դրամ`, {
            reply_markup: { inline_keyboard: [[{ text: "💎 Գնել մուտք", callback_data: "buy_pkg_vip" }]] },
        });
    }

    if (text === "👤 Կարգավիճակ") {
        const pkg = subscribers[chatId] ? PACKAGES[subscribers[chatId]] : null;
        let st = pkg ? `✅ Ակտիվ չեկ: ${pkg.label}` : "❌ Ակտիվ չեկ չունես:";
        if (vipSubscribers[chatId]) st += "\n👑 VIP Կանալ: Ակտիվ է";
        return safeSend(chatId, st, MAIN_MENU);
    }

    if (text === "🆘 Օգնություն") {
        userStates.set(chatId, "AWAITING_SUPPORT");
        return safeSend(chatId, "Գրեք ձեր հարցը․", BACK_MENU);
    }

    if (text === "🎁 Պրոմոկոդ") {
        if (subscribers[chatId]) return safeSend(chatId, "✅ Դու արդեն ունես ակտիվ փաթեթ:", MAIN_MENU);
        userStates.set(chatId, "AWAITING_PROMO");
        return safeSend(chatId, "🎁 Մուտքագրեք պրոմոկոդը․", BACK_MENU);
    }

    if (text === "🔙 Հետ գնալ") {
        userStates.delete(chatId);
        return safeSend(chatId, "Գլխավոր մենյու", MAIN_MENU);
    }

    if (userStates.get(chatId) === "AWAITING_SUPPORT") {
        ADMIN_IDS.forEach((id) => safeSend(id, `📥 Support:\n👤 User: ${user}\n🆔 ID: ${chatId}\n📝 Հարց: ${text}\n\n/reply ${chatId} [տեքստ]`));
        safeSend(chatId, "✅ Ուղարկվեց։", MAIN_MENU);
        userStates.delete(chatId);
        return;
    }

    if (userStates.get(chatId) === "AWAITING_PROMO") {
        const inputCode = text.trim().toUpperCase();
        if (inputCode === String(settings.currentPromo).toUpperCase()) {
            if (usedPromos.includes(chatId)) {
                safeSend(chatId, "❌ Արդեն օգտագործված է:", MAIN_MENU);
            } else {
                usedPromos.push(chatId);
                subscribers[chatId] = "pkg_5";
                settings.promoCount += 1;
                saveData(SUBS_FILE, subscribers);
                saveData(PROMO_FILE, usedPromos);
                saveData(SETTINGS_FILE, settings);
                safeSend(chatId, "🎉 Պրոմոկոդը ակտիվացվեց!", MAIN_MENU);
                handleChecks(chatId);
                ADMIN_IDS.forEach((id) => safeSend(id, `✅ ${user} (ID: ${chatId}) ակտիվացրեց պրոմոկոդը`));
            }
        } else {
            safeSend(chatId, "❌ Սխալ կոդ:", BACK_MENU);
        }
        userStates.delete(chatId);
    }
});

// ================= CALLBACK (ԳՆՈՒՄ) =================
bot.on("callback_query", async (query) => {
    try {
        console.log("callback:", query.data, "from", query.from.id);
        await bot.answerCallbackQuery(query.id).catch(() => {});

        const chatId = query.message.chat.id.toString();
        const user = query.from.username ? `@${query.from.username}` : query.from.first_name;
        const pkgKey = String(query.data || "").replace("buy_", "");
        if (!PACKAGES[pkgKey] || pkgKey === "pkg_5") return;

        if (pkgKey !== "pkg_vip" && !isCheckReady(pkgKey)) {
            await safeSend(chatId, "❌ Այս չեկը այսօր հասանելի չէ:");
            ADMIN_IDS.forEach((id) => safeSend(id, `🚨 ${user} փորձեց գնել ${pkgKey}, բայց հասանելի չէ`));
            return;
        }

        pendingPayments.set(chatId, pkgKey);
        await safeSend(
            chatId,
            `💳 Քարտ: <code>${CARD_NUMBER}</code>\n💰 Գումար: ${PACKAGES[pkgKey].price.toLocaleString("en-US")} դրամ\n\nՈւղարկիր կտրոնի նկարը:${DISCLAIMER}`,
            { parse_mode: "HTML" }
        );
    } catch (e) {
        console.error("callback error:", e.message);
    }
});

// ================= ԿՏՐՈՆԻ ՆԿԱՐ =================
bot.on("photo", (msg) => {
    const chatId = msg.chat.id.toString();
    if (!pendingPayments.has(chatId)) return;
    const pkgKey = pendingPayments.get(chatId);
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    ADMIN_IDS.forEach((id) => bot.sendPhoto(id, fileId, {
        caption: `💳 Վճարում\nUser: ${chatId}\nՓաթեթ: ${PACKAGES[pkgKey].label}\n/approve ${chatId} ${pkgKey}\n/reject ${chatId}`,
    }).catch((e) => console.error("sendPhoto error:", e.message)));
    safeSend(chatId, "📨 Կտրոնն ուղարկված է ադմիններին:", MAIN_MENU);
});

// ================= ԱԴՄԻՆ ՀՐԱՄԱՆՆԵՐ =================
bot.onText(/\/approve (\d+) (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const pkgKey = match[2];
    if (!PACKAGES[pkgKey]) return safeSend(msg.chat.id, "⚠️ Անհայտ փաթեթ:");

    if (pkgKey === "pkg_vip") {
        vipSubscribers[userId] = true;
        saveData(VIP_FILE, vipSubscribers);
        safeSend(userId, `🎉 VIP Մուտքը ակտիվացվեց!\n🔗 ${VIP_CHANNEL_LINK}`, MAIN_MENU);
    } else {
        if (!isCheckReady(pkgKey)) {
            return safeSend(msg.chat.id, `⚠️ ${pkgKey} չեկը այսօր պատրաստ չէ, վճարումը չհաստատվեց:`);
        }
        subscribers[userId] = pkgKey;
        saveData(SUBS_FILE, subscribers);
        safeSend(
            userId,
            `🎉 Ձեր վճարումը հաստատվեց!\n\n📊 Ձեր չեկը (${PACKAGES[pkgKey].label}):\n\n${getCheckText(pkgKey)}${DISCLAIMER}`,
            MAIN_MENU
        );
    }
    pendingPayments.delete(userId);
    safeSend(msg.chat.id, "✅ Հաստատված է:");
    syncAdmins(`✅ Ադմին ${msg.from.first_name}-ը հաստատեց ${userId}-ի վճարումը (${pkgKey})`, msg.chat.id);
});

bot.onText(/\/reject (\d+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    pendingPayments.delete(userId);
    safeSend(userId, "❌ Ձեր վճարումը մերժվեց ադմինիստրատորի կողմից:", MAIN_MENU);
    safeSend(msg.chat.id, `❌ Օգտատեր ${userId} մերժվեց:`);
    syncAdmins(`❌ Ադմին ${msg.from.first_name}-ը մերժեց ${userId}-ի վճարումը`, msg.chat.id);
});

bot.onText(/\/setpromo (.+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    settings.currentPromo = match[1].trim();
    settings.promoCount = 0;
    saveData(SETTINGS_FILE, settings);
    for (const id in subscribers) { if (subscribers[id] === "pkg_5") delete subscribers[id]; }
    saveData(SUBS_FILE, subscribers);
    usedPromos = [];
    saveData(PROMO_FILE, usedPromos);
    safeSend(msg.chat.id, `✅ Նոր պրոմո՝ ${settings.currentPromo.toUpperCase()}`);
    syncAdmins(`🆕 Ադմին ${msg.from.first_name}-ը փոխեց պրոմոկոդը՝ ${settings.currentPromo.toUpperCase()}`, msg.chat.id);
});

bot.onText(/\/setcheck\s+(\w+)\s+([\s\S]+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const pkg = match[1].trim();
    if (!Object.prototype.hasOwnProperty.call(activeChecks, pkg)) return safeSend(msg.chat.id, "⚠️ Անհայտ փաթեթ:");
    activeChecks[pkg] = match[2].trim();
    saveData(CHECKS_FILE, activeChecks);
    // ձեռքով դրված չեկը համարվում է այսօրվանը
    settings.checksDate = todayYerevan();
    saveData(SETTINGS_FILE, settings);
    safeSend(msg.chat.id, "✅ Թարմացվեց:");
    syncAdmins(`📝 Ադմին ${msg.from.first_name}-ը թարմացրեց ${pkg} չեկը`, msg.chat.id);
});

bot.onText(/\/reply (\d+) ([\s\S]+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const userId = match[1];
    const reply = match[2];
    safeSend(userId, `📩 Պատասխան ադմինից:\n\n${reply}\n\n________________\nGoalking Support`);
    safeSend(msg.chat.id, "✅ Ուղարկվեց:");
    syncAdmins(`📩 Ադմին ${msg.from.first_name}-ը պատասխանեց ID ${userId}-ին:\n"${reply}"`, msg.chat.id);
});

bot.onText(/\/viewcheck (\w+)/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const k = match[1];
    if (!activeChecks[k]) return safeSend(msg.chat.id, "⚠️ Անհայտ փաթեթ:");
    safeSend(msg.chat.id, `📝 ${activeChecks[k]}\n\n(ready: ${isCheckReady(k)}, date: ${settings.checksDate || "—"})`);
});

bot.onText(/^\/stats/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const ready = Object.keys(PACKAGES).filter((k) => k !== "pkg_vip" && isCheckReady(k));
    safeSend(
        msg.chat.id,
        `📊 Վիճակագրություն\n🎟 Պրոմո՝ ${settings.currentPromo}\n👥 Պրոմո օգտագործողներ՝ ${settings.promoCount}\n✅ Չեկի բաժանորդներ՝ ${Object.keys(subscribers).length}\n👑 VIP բաժանորդներ՝ ${Object.keys(vipSubscribers).length}\n📅 Չեկերի ամսաթիվ՝ ${settings.checksDate || "—"}\n🟢 Պատրաստ՝ ${ready.join(", ") || "ոչ մեկը"}`,
        MAIN_MENU
    );
});

// ================= WEBHOOK ROUTES =================
app.post(WEBHOOK_PATH, (req, res) => {
    try { bot.processUpdate(req.body); } catch (e) { console.error("processUpdate error:", e.message); }
    res.sendStatus(200);
});

app.get("/health", (req, res) => res.send("OK"));

function authenticateSecret(req, res, next) {
    if (!N8N_INTERNAL_KEY || req.headers["x-internal-key"] !== N8N_INTERNAL_KEY) {
        return res.status(401).json({ error: "unauthorized" });
    }
    next();
}

function formatPackage(pkg) {
    const lines = pkg.selections.map((s, i) => `${i + 1}. ${s.fixture} — ${s.selection} (${s.odd})`);
    let text = `🎯 Ընդհանուր գործակիցը՝ ${pkg.combined_odds}x\n\n${lines.join("\n")}`;
    if (pkg.estimated_hit_chance !== undefined) {
        text += `\n\n📈 Գնահատված հավանականություն՝ ~${pkg.estimated_hit_chance}% (գնահատական է, ոչ երաշխիք)`;
    }
    if (pkg.quality === "stretch") text += "\n⚠️ Բարձր ռիսկի փաթեթ";
    else if (pkg.quality === "relaxed") text += "\n⚠️ Միջին ռիսկի փաթեթ";
    return text;
}

app.post("/internal/packages", authenticateSecret, (req, res) => {
    try {
        const packages = req.body && req.body.packages;
        if (!Array.isArray(packages)) return res.status(400).json({ error: "packages must be an array" });

        // նախ բոլոր n8n փաթեթները՝ «հասանելի չէ» (որ հին չեկ չմնա)
        for (const k of N8N_KEYS) activeChecks[k] = `${PACKAGES[k].label} չեկը ${UNAVAILABLE_TEXT}`;

        let available = 0;
        for (const pkg of packages) {
            const pkgKey = `${pkg.tier}_${pkg.package}`;
            if (!N8N_KEYS.includes(pkgKey)) continue;
            if (!pkg.available || !Array.isArray(pkg.selections) || pkg.selections.length === 0) continue;
            activeChecks[pkgKey] = formatPackage(pkg);
            available++;
        }

        settings.checksDate = todayYerevan();
        if (PROMO_FROM_3X && isCheckReady("standard_3x")) activeChecks.pkg_5 = activeChecks.standard_3x;

        saveData(CHECKS_FILE, activeChecks);
        saveData(SETTINGS_FILE, settings);

        const readyList = N8N_KEYS.filter((k) => isCheckReady(k));
        ADMIN_IDS.forEach((id) => safeSend(id, `🔄 n8n թարմացում (${settings.checksDate})\n🟢 Հասանելի՝ ${readyList.join(", ") || "ոչ մեկը"}`));

        res.json({ ok: true, received: packages.length, available });
    } catch (err) {
        console.error("packages webhook error:", err.message);
        res.status(500).json({ error: "internal error" });
    }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("🌐 Webhook server listening on port " + PORT);
    if (RENDER_URL) {
        bot.setWebHook(`${RENDER_URL}${WEBHOOK_PATH}`)
            .then(() => console.log("✅ Telegram webhook set"))
            .catch((e) => console.error("❌ Failed to set webhook:", e.message));
    } else {
        console.warn("⚠️ RENDER_EXTERNAL_URL not found — webhook not set automatically");
    }
});

console.log("🤖 Բոտը միացված է (webhook mode)...");
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

// ================= ՊԱՀՈՑ (Upstash Redis, հակառակ դեպքում՝ ֆայլեր) =================
const stripQuotes = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
let REDIS_URL = stripQuotes(process.env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, "");
if (REDIS_URL && !/^[a-z][a-z0-9+.-]*:\/\//i.test(REDIS_URL)) REDIS_URL = "https://" + REDIS_URL; // պակաս https://
const REDIS_TOKEN = stripQuotes(process.env.UPSTASH_REDIS_REST_TOKEN);
const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redisKey = (filePath) => `betbot:${path.basename(filePath, ".json")}`;

async function redisCmd(cmd) {
    let r;
    try {
        r = await fetch(REDIS_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify(cmd),
        });
    } catch (e) {
        const c = e.cause ? (e.cause.code || e.cause.message) : "";
        let hint = "";
        try { const u = new URL(REDIS_URL); hint = ` [url: ${u.protocol}//${u.hostname}]`; } catch (_) { hint = " [url: INVALID FORMAT]"; }
        throw new Error(`${e.message}${c ? " (" + c + ")" : ""}${hint}`);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    return j.result;
}

function readFileData(filePath, defaultValue) {
    try { if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch (e) { console.error("Error loading file:", filePath, e.message); }
    return defaultValue;
}

// Բեռնում. Redis-ի սխալի դեպքում ՉԵՆՔ օգտագործում default (որ լավ տվյալները չվերագրվեն), այլ կանգնում ենք
async function loadData(filePath, defaultValue) {
    if (!USE_REDIS) return readFileData(filePath, defaultValue);
    const key = redisKey(filePath);
    let lastErr;
    for (let i = 0; i < 5; i++) {
        try {
            const raw = await redisCmd(["GET", key]);
            if (raw !== null && raw !== undefined) return JSON.parse(raw);
            const v = readFileData(filePath, defaultValue); // բազայում դեռ չկա՝ ֆայլից կամ default
            await redisCmd(["SET", key, JSON.stringify(v)]);
            return v;
        } catch (e) {
            lastErr = e;
            console.error(`Redis load retry ${i + 1} (${key}):`, e.message);
            await sleep(2000);
        }
    }
    throw new Error(`Redis load failed for ${key}: ${lastErr && lastErr.message}`);
}

const writeChains = {};
function saveData(filePath, data) {
    const json = JSON.stringify(data, null, 2);
    try { // տեղային պահուստ
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tmp = filePath + ".tmp";
        fs.writeFileSync(tmp, json);
        fs.renameSync(tmp, filePath);
    } catch (e) { console.error("Error saving file:", filePath, e.message); }

    if (USE_REDIS) {
        const key = redisKey(filePath);
        writeChains[key] = (writeChains[key] || Promise.resolve()).then(async () => {
            for (let i = 0; i < 3; i++) {
                try { await redisCmd(["SET", key, json]); return; }
                catch (e) { console.error(`Redis save retry ${i + 1} (${key}):`, e.message); await sleep(1500); }
            }
        });
    }
}
const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

function todayYerevan() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yerevan" }).format(new Date());
}

// ================= ՏՎՅԱԼՆԵՐ =================
const defaultChecks = () => ({
    standard_3x:   `Այսօրվա x3 չեկը ${DEFAULT_TEXT}`,
    standard_5x:   `Այսօրվա x5 չեկը ${DEFAULT_TEXT}`,
    standard_10x:  `Այսօրվա x10 չեկը ${DEFAULT_TEXT}`,
    standard_20x:  `Այսօրվա x20 չեկը ${DEFAULT_TEXT}`,
    champions_3x:  `Champions League x3 չեկը ${DEFAULT_TEXT}`,
    champions_5x:  `Champions League x5 չեկը ${DEFAULT_TEXT}`,
    champions_10x: `Champions League x10 չեկը ${DEFAULT_TEXT}`,
    pkg_5:         `🎁 Պրոմո չեկը ${DEFAULT_TEXT}`,
});
const defaultSettings = () => ({ currentPromo: "SHOT5", promoCount: 0, checksDate: null });

let subscribers = {};
let vipSubscribers = {};
let usedPromos = [];
let settings = defaultSettings();
let activeChecks = defaultChecks();

async function initData() {
    subscribers = await loadData(SUBS_FILE, {});
    vipSubscribers = await loadData(VIP_FILE, {});
    usedPromos = await loadData(PROMO_FILE, []);
    settings = { ...defaultSettings(), ...(await loadData(SETTINGS_FILE, defaultSettings())) };
    activeChecks = { ...defaultChecks(), ...(await loadData(CHECKS_FILE, defaultChecks())) };
    console.log(`💾 Storage: ${USE_REDIS ? "Upstash Redis" : "local files (will be lost on restart)"}`);
}

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
        `📊 Վիճակագրություն\n🎟 Պրոմո՝ ${settings.currentPromo}\n👥 Պրոմո օգտագործողներ՝ ${settings.promoCount}\n✅ Չեկի բաժանորդներ՝ ${Object.keys(subscribers).length}\n👑 VIP բաժանորդներ՝ ${Object.keys(vipSubscribers).length}\n📅 Չեկերի ամսաթիվ՝ ${settings.checksDate || "—"}\n💾 Պահոց՝ ${USE_REDIS ? "Redis (անվտանգ)" : "ֆայլ (կկորչի restart-ից հետո)"}\n🟢 Պատրաստ՝ ${ready.join(", ") || "ոչ մեկը"}`,
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

// Բացատրություն յուրաքանչյուր խաղադրույքի համար՝ n8n-ի ուղարկած reasons/probability դաշտերից (տրամաբանությունը չի փոխվում)
function explainSelection(s) {
    const reasons = Array.isArray(s.reasons) ? s.reasons.join(" | ") : "";
    const num = (re) => { const m = reasons.match(re); return m ? m.slice(1).map(Number) : null; };
    const xg = num(/xG\s+([\d.]+)\/([\d.]+)/) || num(/Expected goals \(shrunk\):\s*([\d.]+)\s*-\s*([\d.]+)/);
    const xgTotal = num(/xG total\s+([\d.]+)/);
    const form = num(/Form: home\s+([\d.]+)%\s+vs away\s+([\d.]+)%/);
    const h2h = num(/H2H\s+(\d+)-(\d+)-(\d+)\s+in\s+(\d+)/);
    const mkt = num(/Market \(no margin\):\s*(\d+)\/(\d+)\/(\d+)/);
    const p = Number.isFinite(s.probability) ? Math.round(s.probability * 100) : null;
    const sel = String(s.selection || "");
    const [homeName, awayName] = String(s.fixture || "").split(" - ");

    if (s.market === "BTTS") {
        if (!xg) return "";
        if (/Yes$/i.test(sel)) {
            return `⚽ Երկու թիմի վերջին խաղերի ցուցանիշներով էլ ակնկալվում են գոլեր (${xg[0]} և ${xg[1]}), ուստի երկուսի գոլ խփելը հավանական է։`;
        }
        const weakIsHome = xg[0] <= xg[1];
        const weakName = weakIsHome ? homeName : awayName;
        const weakXg = weakIsHome ? xg[0] : xg[1];
        return `⚽ ${weakName}-ի հարձակումը վերջին խաղերի ցուցանիշներով թույլ է (ակնկալվում է ընդամենը ${weakXg} գոլ), ուստի երկուսի գոլ խփելը քիչ հավանական է։`;
    }

    if (s.market === "OU") {
        const lm = sel.match(/(\d+(?:\.\d+)?)/);
        if (!xgTotal || !lm) return "";
        return /over/i.test(sel)
            ? `⚽ Ակնկալվում է գոլային խաղ՝ ընդհանուր մոտ ${xgTotal[0]} գոլ (գիծը՝ ${lm[1]})։`
            : `⚽ Ակնկալվում է փակ խաղ՝ ընդհանուր մոտ ${xgTotal[0]} գոլ, ինչը ${lm[1]}-ից ցածր է։`;
    }

    if (s.market === "MATCH_WINNER" || s.market === "DOUBLE_CHANCE") {
        const isDC = s.market === "DOUBLE_CHANCE";
        const name = sel.replace(/\s*\((Home|Away) Win\)$/, "").replace(/ or Draw$/, "");
        const isHome = /\(Home Win\)$/.test(sel) || (isDC && name === homeName);
        const reasonsList = [];

        if (form) {
            const fav = isHome ? form[0] : form[1];
            const opp = isHome ? form[1] : form[0];
            if (fav > opp + 5) reasonsList.push("վերջին խաղերում ավելի լավ ձևի մեջ է");
        }
        if (h2h && h2h[3] > 0) {
            const favW = isHome ? h2h[0] : h2h[2];
            const oppW = isHome ? h2h[2] : h2h[0];
            if (favW > oppW) reasonsList.push(`անմիջական հանդիպումներում առավելություն ունի (${favW} հաղթանակ ${h2h[3]} խաղից)`);
        }
        if (mkt) {
            const side = isHome ? mkt[0] : mkt[2];
            if (side >= Math.max(...mkt)) reasonsList.push("նաև շուկայի կողմից համարվում է ֆավորիտ");
        }

        if (isDC) {
            const head = `🛡 Երկակի շանս. ${name}-ը չպարտվելու դեպքում խաղադրույքը հաղթում է։`;
            return reasonsList.length ? `${head} ${name}-ը ${reasonsList.join(", ")}։` : head;
        }
        if (reasonsList.length) return `📊 ${name}-ը ${reasonsList.join(", ")}։`;
        if (p !== null) return `📊 Մոդելը այս ելքին տալիս է ~${p}% հավանականություն։`;
    }
    return "";
}

function formatPackage(pkg) {
    const build = (withWhy) => pkg.selections.map((s, i) => {
        let line = `${i + 1}. ${s.fixture} — ${s.selection} (${s.odd})`;
        if (withWhy) {
            const why = explainSelection(s);
            if (why) line += `\n${why}`;
        }
        return line;
    }).join(withWhy ? "\n\n" : "\n");

    let body = build(true);
    if (body.length > 3000) body = build(false); // Telegram-ի 4096 սահմանից պաշտպանություն
    let text = `🎯 Ընդհանուր գործակիցը՝ ${pkg.combined_odds}x\n\n${body}`;
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

async function start() {
    await initData();
    app.listen(PORT, async () => {
        console.log("🌐 Webhook server listening on port " + PORT);
        if (!RENDER_URL) {
            console.warn("⚠️ RENDER_EXTERNAL_URL not found — webhook not set automatically");
            return;
        }
        try {
            const r = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: `${RENDER_URL}${WEBHOOK_PATH}`,
                    allowed_updates: ["message", "callback_query"],
                    drop_pending_updates: false,
                }),
            });
            const j = await r.json();
            console.log(j.ok ? "✅ Telegram webhook set (message + callback_query)" : "❌ setWebhook failed: " + j.description);
        } catch (e) {
            console.error("❌ Failed to set webhook:", e.message);
        }
    });
}

start().catch((e) => { console.error("Startup failed:", e.message); process.exit(1); });

console.log("🤖 Բոտը միացված է (webhook mode)...");
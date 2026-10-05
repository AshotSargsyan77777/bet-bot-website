const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

// ================= ԿՈՆՖԻԳՈՒՐԱՑԻԱ =================
const TOKEN = process.env.BOT_TOKEN;
const CARD_NUMBER = process.env.CARD_NUMBER;
const N8N_INTERNAL_KEY = process.env.N8N_INTERNAL_KEY;
const ADMIN_IDS = (process.env.ADMIN_ID || "").split(",").map(Number).filter(Boolean);
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const DATA_DIR = process.env.DATA_DIR || "."; // Render-ում՝ Disk mount path, օր. /data
const PROMO_FROM_3X = process.env.PROMO_FROM_3X === "1"; // 1 = պրոմո չեկը ավտոմատ = standard_3x
const PROMOS_PER_UPDATE = Math.max(0, parseInt(process.env.PROMOS_PER_UPDATE || "1", 10)); // քանի պրոմո կոդ ստեղծել n8n-ի ամեն թարմացման հետ
const VIP_CHANNEL_LINK = "https://t.me/+gbMtx2wt-UA4NGRi";

if (!TOKEN) { console.error("BOT_TOKEN missing"); process.exit(1); }

const SUBS_FILE = path.join(DATA_DIR, "subscribers.json");
const PROMO_CODES_FILE = path.join(DATA_DIR, "promo_codes.json");
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

// «Օրը» սկսվում է Yerevan ժամանակով 02:00-ին (02:00-ից մինչև հաջորդ օրվա 02:00), ինչպես n8n-ի խաղերի պատուհանը
function todayYerevan() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yerevan" }).format(new Date(Date.now() - 12 * 60 * 60 * 1000));
}

// ================= ԲԱԺԱՆՈՐԴԱԳՐՈՒԹՅՈՒՆ =================
// Վճարովի չեկը վավեր է միայն գնման «օրվա» համար (02:00-ից 02:00). պրոմոն՝ մինչև admin-ը փոխի պրոմոկոդը.
// Հին ձևաչափը (string) վճարովի փաթեթի համար համարվում է ժամկետանց, պրոմոյինը՝ ակտիվ.
function getSub(chatId) {
    const v = subscribers[chatId];
    if (!v) return null;
    if (typeof v === "string") return v === "pkg_5" ? { pkg: "pkg_5", date: null, text: null } : null;
    if (!v.pkg || !PACKAGES[v.pkg]) return null;
    if (v.pkg === "pkg_5") return v;
    return v.date === todayYerevan() ? v : null;
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
    promo_5x:      `🎁 Պրոմո չեկը ${DEFAULT_TEXT}`,
    pkg_5:         `🎁 Պրոմո չեկը ${DEFAULT_TEXT}`,
});
const defaultSettings = () => ({ currentPromo: "SHOT5", promoCount: 0, checksDate: null });

let subscribers = {};
let vipSubscribers = {};
let promoCodes = {}; // { CODE: { created, usedBy, usedAt } }
let settings = defaultSettings();
let activeChecks = defaultChecks();

async function initData() {
    subscribers = await loadData(SUBS_FILE, {});
    vipSubscribers = await loadData(VIP_FILE, {});
    promoCodes = await loadData(PROMO_CODES_FILE, {});
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
    promo_5x: { label: "🎁 Պրոմո չեկ (մինչև x5)", price: 0 },
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

function sendUserCheck(chatId) {
    const sub = getSub(chatId);
    let text = "📦 Ընտրեք փաթեթ՝";
    if (sub) {
        const body = sub.pkg === "pkg_5" ? getCheckText("pkg_5") : (sub.text || getCheckText(sub.pkg));
        text = `📊 Ձեր չեկը (${PACKAGES[sub.pkg].label}):\n\n${body}${DISCLAIMER}\n\n📦 Այլ փաթեթ գնելու համար՝`;
    }
    safeSend(chatId, text, { reply_markup: buyButtons() });
}

function handleChecks(chatId) {
    if (isAdmin(chatId)) {
        sendAllChecksToAdmin(chatId).then(() => safeSend(chatId, "ℹ️ Գնման կոճակների թեստի համար՝ /buy"));
        return;
    }
    sendUserCheck(chatId);
}

// ================= ՊՐՈՄՈ ԿՈԴԵՐ (պատահական, 5 նիշ, յուրաքանչյուրը՝ մեկ օգտագործման, տալիս է առանձին պրոմո չեկ՝ մինչև x5) =================
const PROMO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // առանց 0/O/1/I
const PROMO_PACKAGES = ["promo_5x"];                         // պրոմոյով տրվում է առանձին պրոմո չեկը (մինչև x5), ոչ թե վճարովին

function generatePromoCodes(n) {
    const out = [];
    while (out.length < n) {
        let c = "";
        for (let i = 0; i < 5; i++) c += PROMO_ALPHABET[crypto.randomInt(PROMO_ALPHABET.length)];
        if (promoCodes[c]) continue;
        promoCodes[c] = { created: todayYerevan(), usedBy: null, usedAt: null };
        out.push(c);
    }
    saveData(PROMO_CODES_FILE, promoCodes);
    return out;
}
const promoCounts = () => {
    const all = Object.values(promoCodes);
    const used = all.filter((v) => v.usedBy).length;
    return { free: all.length - used, used };
};

// ================= ԱԴՄԻՆԻՆ՝ ԲՈԼՈՐ ՊԱՏՐԱՍՏ ՉԵԿԵՐԸ =================
async function sendAllChecksToAdmin(chatId, withHeader = true) {
    const ready = N8N_KEYS.filter(isCheckReady);
    const notReady = N8N_KEYS.filter((k) => !isCheckReady(k));
    if (withHeader) {
        await safeSend(chatId, `📋 Պատրաստ չեկեր՝ ${ready.length} (${settings.checksDate || "—"})${notReady.length ? "\n⛔ Հասանելի չեն՝ " + notReady.join(", ") : ""}`);
    }
    for (const k of ready) {
        await safeSend(chatId, `📦 ${k} — ${PACKAGES[k].label} (${PACKAGES[k].price ? PACKAGES[k].price.toLocaleString("en-US") + " դրամ" : "անվճար պրոմո"})\n\n${activeChecks[k]}`);
    }
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
        const sub = getSub(chatId);
        const pkg = sub ? PACKAGES[sub.pkg] : null;
        let st = pkg ? `✅ Ակտիվ չեկ: ${pkg.label}` : "❌ Ակտիվ չեկ չունես:";
        if (vipSubscribers[chatId]) st += "\n👑 VIP Կանալ: Ակտիվ է";
        return safeSend(chatId, st, MAIN_MENU);
    }

    if (text === "🆘 Օգնություն") {
        userStates.set(chatId, "AWAITING_SUPPORT");
        return safeSend(chatId, "Գրեք ձեր հարցը․", BACK_MENU);
    }

    if (text === "🎁 Պրոմոկոդ") {
        if (getSub(chatId)) return safeSend(chatId, "✅ Դու արդեն ունես ակտիվ փաթեթ:", MAIN_MENU);
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
        const code = text.trim().toUpperCase().replace(/[\s-]/g, "");
        userStates.delete(chatId);
        const entry = promoCodes[code];
        if (!entry) return safeSend(chatId, "❌ Սխալ կոդ:", MAIN_MENU);
        if (entry.usedBy) return safeSend(chatId, "❌ Այս կոդն արդեն օգտագործված է:", MAIN_MENU);
        if (getSub(chatId)) return safeSend(chatId, "✅ Դու արդեն ունես ակտիվ փաթեթ:", MAIN_MENU);

        const key = PROMO_PACKAGES.find((k) => isCheckReady(k));
        if (!key) return safeSend(chatId, "⏳ Պրոմո չեկը այսօր դեռ պատրաստ չէ, փորձեք ավելի ուշ (կոդը չի ծախսվել):", MAIN_MENU);

        entry.usedBy = chatId;
        entry.usedAt = new Date().toISOString();
        subscribers[chatId] = { pkg: key, date: todayYerevan(), text: getCheckText(key), promo: true };
        saveData(PROMO_CODES_FILE, promoCodes);
        saveData(SUBS_FILE, subscribers);
        safeSend(chatId, "🎉 Պրոմոկոդը ակտիվացվեց!", MAIN_MENU);
        sendUserCheck(chatId);
        ADMIN_IDS.forEach((id) => safeSend(id, `🎁 ${user} (ID: ${chatId}) ակտիվացրեց պրոմո ${code} (${key})`));
        return;
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
        if (!PACKAGES[pkgKey] || pkgKey === "pkg_5" || pkgKey === "promo_5x") return;

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
        // պահում ենք հենց այն չեկը, որի համար վճարել է (այսօրվա օրվա համար)
        subscribers[userId] = { pkg: pkgKey, date: todayYerevan(), text: getCheckText(pkgKey) };
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

bot.onText(/^\/genpromo(?:\s+(\d+))?/, (msg, match) => {
    if (!isAdmin(msg.chat.id)) return;
    const n = Math.min(Math.max(parseInt(match[1] || "1", 10), 1), 50);
    const codes = generatePromoCodes(n);
    bot.sendMessage(
        msg.chat.id,
        `🎁 ${n} նոր պրոմո կոդ (մեկ օգտագործման, տալիս է առանձին պրոմո չեկ՝ մինչև x5).\n\n${codes.map((c) => `<code>${c}</code>`).join("\n")}`,
        { parse_mode: "HTML" }
    ).catch((e) => console.error("genpromo send error:", e.message));
    syncAdmins(`🎁 Ադմին ${msg.from.first_name}-ը ստեղծեց ${n} պրոմո կոդ`, msg.chat.id);
});

bot.onText(/^\/promos/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    const { free, used } = promoCounts();
    const freeList = Object.entries(promoCodes).filter(([, v]) => !v.usedBy).map(([c]) => c).slice(0, 100);
    bot.sendMessage(
        msg.chat.id,
        `🎁 Պրոմո կոդեր. ազատ՝ ${free}, օգտագործված՝ ${used}${freeList.length ? "\n\n" + freeList.map((c) => `<code>${c}</code>`).join("\n") : ""}`,
        { parse_mode: "HTML" }
    ).catch((e) => console.error("promos send error:", e.message));
});

bot.onText(/^\/allchecks/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    sendAllChecksToAdmin(msg.chat.id);
});

bot.onText(/^\/buy/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    safeSend(msg.chat.id, "📦 Ընտրեք փաթեթ՝", { reply_markup: buyButtons() });
});

bot.onText(/^\/admin/, (msg) => {
    if (!isAdmin(msg.chat.id)) return;
    safeSend(msg.chat.id, [
        "🛠 Admin հրամաններ",
        "/allchecks — բոլոր պատրաստ չեկերը",
        "/genpromo [N] — N պատահական 5-նիշ պրոմո կոդ (կանխադրված 1, առավելագույնը 50), տալիս է պրոմո չեկ՝ մինչև x5",
        "/promos — ազատ/օգտագործված պրոմոներ",
        "/stats — վիճակագրություն",
        "/viewcheck <package> — մեկ չեկ",
        "/setcheck <package> <տեքստ> — ձեռքով չեկ",
        "/approve <ID> <package> — հաստատել վճարում",
        "/reject <ID> — մերժել",
        "/reply <ID> <տեքստ> — պատասխան user-ին",
        "/buy — գնման կոճակներ (թեստ)",
    ].join("\n"));
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
        `📊 Վիճակագրություն\n🎁 Պրոմո կոդեր՝ ազատ ${promoCounts().free}, օգտագործված ${promoCounts().used}\n✅ Ակտիվ չեկ ունեցողներ՝ ${Object.keys(subscribers).filter((id) => getSub(id)).length}\n👑 VIP բաժանորդներ՝ ${Object.keys(vipSubscribers).length}\n📅 Չեկերի ամսաթիվ՝ ${settings.checksDate || "—"}\n💾 Պահոց՝ ${USE_REDIS ? "Redis (անվտանգ)" : "ֆայլ (կկորչի restart-ից հետո)"}\n🟢 Պատրաստ՝ ${ready.join(", ") || "ոչ մեկը"}`,
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
            return `Երկու թիմի շուկայի և թիմերի ցուցանիշներով էլ ակնկալվում են գոլեր (${xg[0]} և ${xg[1]}), ուստի երկուսի գոլ խփելը հավանական է։`;
        }
        const weakIsHome = xg[0] <= xg[1];
        const weakName = weakIsHome ? homeName : awayName;
        const weakXg = weakIsHome ? xg[0] : xg[1];
        return `${weakName}-ի հարձակումը շուկայի և թիմերի ցուցանիշներով թույլ է (ակնկալվում է ընդամենը ${weakXg} գոլ), ուստի երկուսի գոլ խփելը քիչ հավանական է։`;
    }

    if (s.market === "OU") {
        const lm = sel.match(/(\d+(?:\.\d+)?)/);
        if (!xgTotal || !lm) return "";
        return /over/i.test(sel)
            ? `Ակնկալվում է գոլային խաղ՝ ընդհանուր մոտ ${xgTotal[0]} գոլ (գիծը՝ ${lm[1]})։`
            : `Ակնկալվում է փակ խաղ՝ ընդհանուր մոտ ${xgTotal[0]} գոլ, ինչը ${lm[1]}-ից ցածր է։`;
    }

    if (s.market === "TEAM_TOTAL_HOME" || s.market === "TEAM_TOTAL_AWAY") {
        const isH = s.market === "TEAM_TOTAL_HOME";
        const team = isH ? homeName : awayName;
        const lm = sel.match(/(Over|Under)\s+(\d+(?:\.\d+)?)/i);
        if (!xg || !lm) return "";
        const tx = isH ? xg[0] : xg[1];
        return /over/i.test(lm[1])
            ? `${team}-ի ակնկալվող գոլերը՝ ${tx} (գիծը՝ ${lm[2]})։`
            : `${team}-ի հարձակումը սահմանափակ է (ակնկալվում է ~${tx} գոլ), ուստի ${lm[2]} գիծը հավանաբար չի գերազանցվի։`;
    }

    if (s.market === "OU_1H") {
        const lm = sel.match(/(?:Over|Under)\s+(\d+(?:\.\d+)?)/i);
        if (!xgTotal || !lm) return "";
        return `Առաջին խաղակեսում ակնկալվում է մոտ ${(xgTotal[0] * 0.45).toFixed(2)} գոլ (գիծը՝ ${lm[1]})։`;
    }

    if (s.market === "CLEAN_SHEET_HOME" || s.market === "CLEAN_SHEET_AWAY" || s.market === "WIN_TO_NIL_HOME" || s.market === "WIN_TO_NIL_AWAY") {
        const isH = /_HOME$/.test(s.market);
        const team = isH ? homeName : awayName;
        const opp = isH ? awayName : homeName;
        if (!xg) return "";
        const ox = isH ? xg[1] : xg[0];
        const yes = /Yes$/i.test(sel);
        return yes
            ? `${opp}-ի ակնկալվող գոլերը ցածր են (${ox}), ուստի ${team}-ը կարող է մնալ առանց բաց թողնված գոլի։`
            : `${opp}-ից ակնկալվում է ~${ox} գոլ, ուստի ${team}-ի դարպասը անխախտ մնալը քիչ հավանական է։`;
    }

    if (s.market === "ODD_EVEN") {
        return p !== null ? `Մոդելը այս ելքին տալիս է ~${p}% հավանականություն։` : "";
    }

    if (s.market === "DNB") {
        const name = sel.replace(/^Draw No Bet\s*—\s*/, "");
        return `Ոչ-ոքիի դեպքում գումարը վերադարձվում է, ուստի ${name}-ը չպարտվելու դեպքում ռիսկը փոքր է։`;
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
            const head = `Երկակի շանս. ${name}-ը չպարտվելու դեպքում խաղադրույքը հաղթում է։`;
            return reasonsList.length ? `${head} ${name}-ը ${reasonsList.join(", ")}։` : head;
        }
        if (reasonsList.length) return `${name}-ը ${reasonsList.join(", ")}։`;
        if (p !== null) return `Մոդելը այս ելքին տալիս է ~${p}% հավանականություն։`;
    }
    return "";
}

const NUM_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const MARKET_EMOJI = {
    MATCH_WINNER: "🏆", DOUBLE_CHANCE: "🛡", DNB: "🏆", BTTS: "🥅", OU: "⚽",
    TEAM_TOTAL_HOME: "⚽", TEAM_TOTAL_AWAY: "⚽", OU_1H: "⏱", ODD_EVEN: "🔢",
    CLEAN_SHEET_HOME: "🧤", CLEAN_SHEET_AWAY: "🧤", WIN_TO_NIL_HOME: "💪", WIN_TO_NIL_AWAY: "💪",
};
const LINE = "━━━━━━━━━━━━━━";

function formatPackage(pkg) {
    const build = (withWhy) => pkg.selections.map((s, i) => {
        const num = NUM_EMOJI[i] || `${i + 1}.`;
        const odd = Number(s.odd);
        const rows = [
            `${num} 🏟 ${s.fixture}`,
            `${MARKET_EMOJI[s.market] || "🎯"} ${s.selection}`,
            `💰 Գործակից՝ ${Number.isFinite(odd) ? odd.toFixed(2) : s.odd}`,
        ];
        if (withWhy) {
            const why = explainSelection(s);
            if (why) rows.push(`💡 ${why}`);
        }
        return rows.join("\n");
    }).join(withWhy ? "\n\n" : "\n\n");

    let body = build(true);
    if (body.length > 3000) body = build(false); // Telegram-ի 4096 սահմանից պաշտպանություն
    const total = Number(pkg.combined_odds);
    let text = `⚽ GOALKING ՉԵԿ\n🎯 Ընդհանուր գործակից՝ ${Number.isFinite(total) ? total.toFixed(2) : pkg.combined_odds}x\n${LINE}\n\n${body}\n\n${LINE}`;
    const bks = [...new Set(pkg.selections.map((x) => x.bookmaker).filter(Boolean))];
    if (bks.length === 1) text += `\nℹ️ Գործակիցները՝ ${bks[0]}`;
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
        const chances = packages
            .filter((p) => p.available && p.estimated_hit_chance !== undefined)
            .map((p) => `${p.tier}_${p.package}: ~${p.estimated_hit_chance}%${p.quality && p.quality !== "strict" ? " (" + p.quality + ")" : ""}`);
        const newCodes = PROMOS_PER_UPDATE > 0 ? generatePromoCodes(PROMOS_PER_UPDATE) : [];
        (async () => {
            for (const id of ADMIN_IDS) {
                await safeSend(id, `🔄 n8n թարմացում (${settings.checksDate})\n🟢 Հասանելի՝ ${readyList.join(", ") || "ոչ մեկը"}${chances.length ? "\n📈 Գնահատված հավանականություն (միայն admin)՝\n" + chances.join("\n") : ""}`);
                await sendAllChecksToAdmin(id, false);
                if (newCodes.length) {
                    await bot.sendMessage(
                        id,
                        `🎁 Օրվա պրոմո կոդ${newCodes.length > 1 ? "եր" : ""} (մեկ օգտագործման, տալիս է առանձին պրոմո չեկ՝ մինչև x5)՝\n\n${newCodes.map((c) => `<code>${c}</code>`).join("\n")}`,
                        { parse_mode: "HTML" }
                    ).catch((e) => console.error("promo send error:", e.message));
                }
            }
        })();

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
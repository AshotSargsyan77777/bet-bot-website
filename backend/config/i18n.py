"""Translations of the API's own user-facing messages (hy is the source language).

Django/DRF messages are translated by Django itself (LocaleMiddleware + Accept-Language);
this covers the project's messages, which are written in Armenian in the code.
"""

import re

from django.utils import translation
from rest_framework.renderers import JSONRenderer

LANGS = ("hy", "en", "ru")

# Armenian source text → (English, Russian)
MESSAGES: dict[str, tuple[str, str]] = {
    "Սերվերի ներքին սխալ": ("Internal server error", "Внутренняя ошибка сервера"),
    "Չեկը չի գտնվել": ("Check not found", "Чек не найден"),
    "Այս փաթեթի չեկը այսօր հասանելի չէ": ("This package's check is not available today", "Чек этого пакета сегодня недоступен"),
    "Թույլատրված են միայն JPEG, PNG, WEBP, GIF նկարներ": ("Only JPEG, PNG, WEBP, GIF images are allowed", "Разрешены только изображения JPEG, PNG, WEBP, GIF"),
    "Վճարումն արդեն դիտարկված է": ("This payment has already been reviewed", "Платёж уже рассмотрен"),
    "Կոնստրուկտորի պատվերը չի գտնվել": ("Combinator order not found", "Заказ конструктора не найден"),
    "Այս փաթեթի չեկը այսօր պատրաստ չէ": ("This package's check is not ready today", "Чек этого пакета сегодня не готов"),
    "❌ Սխալ կոդ": ("❌ Invalid code", "❌ Неверный код"),
    "❌ Այս կոդն արդեն օգտագործված է": ("❌ This code has already been used", "❌ Этот код уже использован"),
    "✅ Դուք այսօր արդեն ստացել եք պրոմո չեկ": ("✅ You have already received a promo check today", "✅ Сегодня вы уже получили промо-чек"),
    "⏳ Պրոմո չեկը այսօր դեռ պատրաստ չէ": ("⏳ Today's promo check is not ready yet", "⏳ Промо-чек на сегодня ещё не готов"),
    "Անհայտ status": ("Unknown status", "Неизвестный статус"),
    "Վճարումը չի գտնվել": ("Payment not found", "Платёж не найден"),
    "Կտրոն չկա": ("No receipt", "Нет квитанции"),
    "Կտրոնի ֆայլը չի գտնվել": ("Receipt file not found", "Файл квитанции не найден"),
    "Ադմինի համար անվճար է": ("Free for admins", "Для админа бесплатно"),
    "Այս մակարդակը այսօր արդեն գնված է կամ սպասում է հաստատման": (
        "This tier is already bought today or awaiting approval",
        "Этот уровень уже куплен сегодня или ожидает подтверждения",
    ),
    "Օգտանունը կարող է պարունակել տառեր, թվեր, բացատ և . @ + - _": (
        "Username may contain letters, digits, spaces and . @ + - _",
        "Имя пользователя может содержать буквы, цифры, пробел и . @ + - _",
    ),
    "Այս username-ը արդեն գոյություն ունի": ("This username already exists", "Такое имя пользователя уже существует"),
    "Այս email-ը արդեն գրանցված է": ("This email is already registered", "Этот email уже зарегистрирован"),
    "Ընթացիկ գաղտնաբառը սխալ է": ("Current password is incorrect", "Текущий пароль неверен"),
    "Telegram մուտքը կարգավորված չէ": ("Telegram login is not configured", "Вход через Telegram не настроен"),
    "Telegram-ի տվյալները թերի են": ("Telegram data is incomplete", "Данные Telegram неполные"),
    "Telegram-ի ստորագրությունը սխալ է": ("Invalid Telegram signature", "Неверная подпись Telegram"),
    "Telegram-ի տվյալները սխալ են": ("Invalid Telegram data", "Неверные данные Telegram"),
    "Telegram մուտքի ժամկետը անցել է, փորձեք նորից": ("Telegram login expired, please try again", "Срок входа через Telegram истёк, попробуйте снова"),
    "VIP մուտք է պահանջվում": ("VIP access required", "Требуется VIP-доступ"),
    "Մուտք միայն ադմինի համար": ("Admins only", "Только для админа"),
    "Հաշիվը արգելափակված է": ("The account is blocked", "Аккаунт заблокирован"),
    "Այս Telegram հաշիվը արդեն կապված է այլ օգտատիրոջ հետ": (
        "This Telegram account is already linked to another user",
        "Этот Telegram-аккаунт уже привязан к другому пользователю",
    ),
    "Telegram հաշիվը արդեն կապված է": ("A Telegram account is already linked", "Telegram-аккаунт уже привязан"),
    "Telegram-ը կապված չէ": ("Telegram is not linked", "Telegram не привязан"),
    "Նախ սահմանեք գաղտնաբառ, որպեսզի կարողանաք մուտք գործել առանց Telegram-ի": (
        "Set a password first so you can log in without Telegram",
        "Сначала задайте пароль, чтобы входить без Telegram",
    ),
    "Խաղերի տվյալների մատակարարը (API-Football) կարգավորված չէ": (
        "The match data provider (API-Football) is not configured",
        "Поставщик данных матчей (API-Football) не настроен",
    ),
    "Խաղը չի գտնվել": ("Match not found", "Матч не найден"),
    "Վիճակագրությունը ժամանակավորապես անհասանելի է": ("Statistics are temporarily unavailable", "Статистика временно недоступна"),
    "Հղումը անվավեր է կամ ժամկետանց, խնդրեք նորը": (
        "The link is invalid or expired, request a new one",
        "Ссылка недействительна или устарела, запросите новую",
    ),
    "Այդպիսի օգտատեր չի գտնվել": ("No such user", "Такой пользователь не найден"),
    "Չեք կարող հանել ձեր սեփական ադմինի իրավունքը": ("You can't remove your own admin rights", "Нельзя снять права админа с самого себя"),
    "Գլխավոր ադմինին այստեղից հանել հնարավոր չէ": ("The main admin can't be removed here", "Главного админа здесь снять нельзя"),
    "Նշեք email հասցե": ("Enter an email address", "Укажите email"),
    "Խաղն արդեն սկսվել է": ("The match has already started", "Матч уже начался"),
    "Այս վերլուծությունը արդեն գնված է կամ սպասում է հաստատման": (
        "This analysis is already bought or awaiting approval",
        "Этот анализ уже куплен или ожидает подтверждения",
    ),
    "Վերլուծության պատվերը չի գտնվել": ("Analysis order not found", "Заказ анализа не найден"),
}

PATTERNS: list[tuple[re.Pattern, tuple[str, str]]] = [
    (
        re.compile(r"^Նկարը չափազանց մեծ է \(max (\d+) MB\)$"),
        ("Image is too large (max {0} MB)", "Изображение слишком большое (макс. {0} МБ)"),
    ),
]

_FIELD_PREFIX = re.compile(r"^([A-Za-z_][\w.]*): (.+)$", re.S)


def current_lang() -> str:
    lang = (translation.get_language() or "hy").split("-")[0]
    return lang if lang in LANGS else "hy"


def localize(text, lang: str | None = None):
    """Translates one of the project's Armenian messages; anything else is returned unchanged."""
    if not isinstance(text, str):
        return text
    lang = lang or current_lang()
    if lang == "hy":
        return text
    idx = 0 if lang == "en" else 1
    if text in MESSAGES:
        return MESSAGES[text][idx]
    for pattern, out in PATTERNS:
        m = pattern.match(text)
        if m:
            return out[idx].format(*m.groups())
    m = _FIELD_PREFIX.match(text)  # "receipt: <message>" from the error handler
    if m and m.group(2) != text:
        translated = localize(m.group(2), lang)
        if translated != m.group(2):
            return f"{m.group(1)}: {translated}"
    return text


class LocalizedJSONRenderer(JSONRenderer):
    """Translates error messages (`error`, `detail`, `fields`) to the request's language."""

    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = (renderer_context or {}).get("response")
        if response is not None and response.status_code >= 400 and isinstance(data, dict) and current_lang() != "hy":
            data = dict(data)
            for key in ("error", "detail"):
                if key in data:
                    data[key] = localize(data[key])
            if isinstance(data.get("fields"), dict):
                data["fields"] = {
                    k: [localize(m) for m in v] if isinstance(v, list) else localize(v) for k, v in data["fields"].items()
                }
        return super().render(data, accepted_media_type, renderer_context)

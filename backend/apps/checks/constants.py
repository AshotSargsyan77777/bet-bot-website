DEFAULT_TEXT = "դեռ տեղադրված չէ:"
UNAVAILABLE_TEXT = "այսօր հասանելի չէ:"

PACKAGES = {
    "standard_3x": {"label": "Գործակից x3", "price": 2000},
    "standard_5x": {"label": "Գործակից x5", "price": 3000},
    "standard_10x": {"label": "Գործակից x10", "price": 5000},
    "standard_20x": {"label": "Գործակից x20", "price": 7000},
    "champions_3x": {"label": "🏆 Champions League x3", "price": 2000},
    "champions_5x": {"label": "🏆 Champions League x5", "price": 3000},
    "champions_10x": {"label": "🏆 Champions League x10", "price": 7000},
    "promo_5x": {"label": "🎁 Պրոմո չեկ (մինչև x5)", "price": 0},
    "pkg_vip": {"label": "👑 VIP Կանալ", "price": 5000},
    "pkg_5": {"label": "🎁 Պրոմո Փաթեթ", "price": 0},
}

N8N_KEYS = [k for k in PACKAGES if k not in ("pkg_vip", "pkg_5")]
PROMO_PACKAGES = ["promo_5x"]
PURCHASABLE_KEYS = [k for k in PACKAGES if k not in ("promo_5x", "pkg_5")]

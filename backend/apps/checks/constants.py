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
    "europa_3x": {"label": "🌍 Europa / Conference League x3", "price": 2000},
    "europa_5x": {"label": "🌍 Europa / Conference League x5", "price": 3000},
    "europa_10x": {"label": "🌍 Europa / Conference League x10", "price": 5000},
    "promo_5x": {"label": "🎁 Պրոմո չեկ (մինչև x5)", "price": 0},
    "pkg_vip": {"label": "👑 VIP Կանալ", "price": 5000},
    "pkg_5": {"label": "🎁 Պրոմո Փաթեթ", "price": 0},
}

N8N_KEYS = [k for k in PACKAGES if k not in ("pkg_vip", "pkg_5")]
PROMO_PACKAGES = ["promo_5x"]
PURCHASABLE_KEYS = [k for k in PACKAGES if k not in ("promo_5x", "pkg_5")]

# Combinator checks (VIP builds own combination and pays per check). The tier is chosen by the
# upper bound of the requested total odds: up to 5.5 → x5, up to 10.5 → x10, up to 15.8 → x15, up to 21 → x20.
COMBO_TIERS = {
    "combo_x5": {"label": "🎯 Կոնստրուկտոր x5", "price": 3000, "min": 4.8, "max": 5.3, "upto": 5.5},
    "combo_x10": {"label": "🎯 Կոնստրուկտոր x10", "price": 5000, "min": 9.5, "max": 10.5, "upto": 10.5},
    "combo_x15": {"label": "🎯 Կոնստրուկտոր x15", "price": 6000, "min": 14.3, "max": 15.8, "upto": 15.8},
    "combo_x20": {"label": "🎯 Կոնստրուկտոր x20", "price": 8000, "min": 19.0, "max": 21.0, "upto": 21.0},
}

# Full analysis of one match (all markets), bought per match
ANALYSIS_KEY = "match_analysis"
ANALYSIS_PRODUCT = {ANALYSIS_KEY: {"label": "🔍 Խաղի վերլուծություն", "price": 1000}}

# Everything that can be paid for (labels/prices for payments, admin and revenue)
ALL_PRODUCTS = {**PACKAGES, **COMBO_TIERS, **ANALYSIS_PRODUCT}


def product_label(key: str) -> str:
    return ALL_PRODUCTS.get(key, {}).get("label", key)


def combo_tier_for(target_max: float) -> str | None:
    for key, tier in COMBO_TIERS.items():
        if target_max <= tier["upto"]:
            return key
    return None

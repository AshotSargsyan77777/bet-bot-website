from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

YEREVAN = ZoneInfo("Asia/Yerevan")
# The "day" runs 01:00 → 01:00 Yerevan: n8n publishes the day's checks at 01:00 for the matches starting
# from 01:00 until 01:00 next night, so matches just after midnight still belong to the evening before.
DAY_START_HOUR = 1


def yerevan_today() -> str:
    """Yerevan "day" with a 01:00 boundary — the same day as the n8n window and the Telegram bot."""
    return (datetime.now(YEREVAN) - timedelta(hours=DAY_START_HOUR)).strftime("%Y-%m-%d")

from datetime import datetime
from zoneinfo import ZoneInfo

YEREVAN = ZoneInfo("Asia/Yerevan")


def yerevan_today() -> str:
    """The calendar day in Yerevan (00:00 boundary), the same day as the n8n window and the bot."""
    return datetime.now(YEREVAN).strftime("%Y-%m-%d")

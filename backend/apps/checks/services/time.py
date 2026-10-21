from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

YEREVAN = ZoneInfo("Asia/Yerevan")


def yerevan_today() -> str:
    """Day boundary at 02:00 Yerevan (matches n8n window)."""
    now = datetime.now(YEREVAN)
    adjusted = now - timedelta(hours=2)
    return adjusted.strftime("%Y-%m-%d")

from django.db import migrations

# Package catalogue is fixed configuration (apps.checks.constants), not demo data:
# every package needs its DailyCheck row, initially "not set yet".
DEFAULT_TEXT = "դեռ տեղադրված չէ:"


def seed(apps, schema_editor):
    from apps.checks.constants import PACKAGES

    DailyCheck = apps.get_model("checks", "DailyCheck")
    AppSettings = apps.get_model("checks", "AppSettings")
    for key, meta in PACKAGES.items():
        DailyCheck.objects.get_or_create(
            package_key=key, defaults={"body_text": f"{meta['label']} չեկը {DEFAULT_TEXT}", "is_available": False}
        )
    AppSettings.objects.get_or_create(pk=1)


class Migration(migrations.Migration):
    dependencies = [("checks", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

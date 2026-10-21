from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Grant (or revoke with --revoke) Goalking admin rights (is_staff) for an existing user."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--revoke", action="store_true")

    def handle(self, username, revoke=False, **options):
        User = get_user_model()
        user = User.objects.filter(username__iexact=username).first()
        if not user:
            raise CommandError(f"User '{username}' not found")
        user.is_staff = not revoke
        user.save(update_fields=["is_staff"])
        self.stdout.write(self.style.SUCCESS(f"{user.username}: is_staff={user.is_staff}"))

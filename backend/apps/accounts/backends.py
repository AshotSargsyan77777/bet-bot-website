from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class UsernameOrEmailBackend(ModelBackend):
    """Log in with the username or the email, in any letter case.

    Lookup order: exact username, then case-insensitive username, then email — each only when it is
    unambiguous (usernames may contain "@", and old accounts may share an email).
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        login = (username or kwargs.get(User.USERNAME_FIELD) or "").strip()
        if not login or password is None:
            return None
        user = None
        for lookup in ({"username": login}, {"username__iexact": login}, {"email__iexact": login}):
            matches = list(User.objects.filter(**lookup)[:2])
            if len(matches) == 1:
                user = matches[0]
                break
        if user is None:
            User().set_password(password)  # same work as a real check, so timing doesn't reveal accounts
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None

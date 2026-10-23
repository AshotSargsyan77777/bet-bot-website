import logging
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import TelegramAccount
from .password_reset import find_user, send_reset, user_from_uid
from .serializers import (
    ChangePasswordSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    TelegramAuthSerializer,
    TelegramSettingsSerializer,
    UserSerializer,
)
from .telegram import TelegramAuthError, verify_login

User = get_user_model()
logger = logging.getLogger(__name__)


class AuthThrottleMixin:
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "auth"


class RegisterView(AuthThrottleMixin, generics.CreateAPIView):
    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()
    serializer_class = RegisterSerializer


class LoginView(AuthThrottleMixin, TokenObtainPairView):
    pass


class RefreshView(AuthThrottleMixin, TokenRefreshView):
    pass


class LogoutView(APIView):
    """Blacklists the given refresh token so it can no longer be used."""

    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()

    def post(self, request):
        token = request.data.get("refresh") if isinstance(request.data, dict) else None
        if not token:
            return Response({"error": "refresh token required", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            RefreshToken(token).blacklist()
        except TokenError:
            pass  # already invalid/expired: logout is idempotent
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user


class ChangePasswordView(AuthThrottleMixin, APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"ok": True})


class PasswordResetRequestView(APIView):
    """Sends a reset link to the account's Telegram and/or email. The answer is the same whether or not
    the account exists, so it cannot be used to find out who is registered."""

    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = find_user(serializer.validated_data["login"])
        if user:
            channels = send_reset(user)
            logger.info("Password reset for user %s sent via %s", user.pk, ",".join(channels) or "nothing")
        return Response({"ok": True})


class PasswordResetConfirmView(AuthThrottleMixin, APIView):
    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = user_from_uid(data["uid"])
        if not user or not default_token_generator.check_token(user, data["token"]):
            return Response(
                {"error": "Հղումը անվավեր է կամ ժամկետանց, խնդրեք նորը", "code": "invalid_token"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(data["new_password"], user=user)
        except DjangoValidationError as e:
            return Response(
                {"error": e.messages[0], "code": "invalid", "fields": {"new_password": e.messages}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(data["new_password"])
        user.save(update_fields=["password"])  # also invalidates the reset link (it depends on the password)
        _logout_everywhere(user)
        return Response({"ok": True, "username": user.username})


def _logout_everywhere(user) -> None:
    """After a reset, sessions opened with the old password must not keep working."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class PublicConfigView(APIView):
    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()

    def get(self, request):
        return Response({"telegram_bot_username": settings.TELEGRAM_BOT_USERNAME if settings.TELEGRAM_BOT_TOKEN else ""})


def _verified_telegram(request):
    serializer = TelegramAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return verify_login(request.data)


def _unique_username(preferred: str, telegram_id: int) -> str:
    """Telegram username if it is free on the site, otherwise tg<id> (unique by definition)."""
    preferred = (preferred or "").strip()[:150]
    if preferred and not User.objects.filter(username__iexact=preferred).exists():
        return preferred
    fallback = f"tg{telegram_id}"
    if User.objects.filter(username__iexact=fallback).exists():
        fallback = f"{fallback}_{secrets.token_hex(3)}"
    return fallback


class TelegramLoginView(AuthThrottleMixin, APIView):
    """Log in (or sign up) with the Telegram Login Widget."""

    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()

    def post(self, request):
        try:
            tg = _verified_telegram(request)
        except TelegramAuthError as e:
            return Response({"error": str(e), "code": "telegram_auth"}, status=status.HTTP_400_BAD_REQUEST)
        created = False
        with transaction.atomic():
            account = TelegramAccount.objects.select_related("user").filter(telegram_id=tg["telegram_id"]).first()
            if account:
                user = account.user
                for field in ("username", "first_name", "photo_url"):
                    setattr(account, field, tg[field])
                account.save(update_fields=["username", "first_name", "photo_url"])
            else:
                user = User(username=_unique_username(tg["username"], tg["telegram_id"]), first_name=tg["first_name"][:150])
                user.set_unusable_password()
                user.save()
                TelegramAccount.objects.create(user=user, **tg)
                created = True
        if not user.is_active:
            return Response({"error": "Հաշիվը արգելափակված է", "code": "inactive"}, status=status.HTTP_403_FORBIDDEN)
        refresh = RefreshToken.for_user(user)
        return Response({"access": str(refresh.access_token), "refresh": str(refresh), "created": created})


class TelegramLinkView(APIView):
    """POST: link Telegram to the current account · PATCH: notifications on/off · DELETE: unlink."""

    def post(self, request):
        try:
            tg = _verified_telegram(request)
        except TelegramAuthError as e:
            return Response({"error": str(e), "code": "telegram_auth"}, status=status.HTTP_400_BAD_REQUEST)
        other = TelegramAccount.objects.filter(telegram_id=tg["telegram_id"]).exclude(user=request.user).first()
        if other:
            return Response(
                {"error": "Այս Telegram հաշիվը արդեն կապված է այլ օգտատիրոջ հետ", "code": "telegram_taken"},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            TelegramAccount.objects.update_or_create(user=request.user, defaults=tg)
        except IntegrityError:
            return Response({"error": "Telegram հաշիվը արդեն կապված է", "code": "telegram_taken"}, status=status.HTTP_409_CONFLICT)
        request.user.refresh_from_db()
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = TelegramSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = TelegramAccount.objects.filter(user=request.user).update(**serializer.validated_data)
        if not updated:
            return Response({"error": "Telegram-ը կապված չէ", "code": "not_linked"}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserSerializer(User.objects.get(pk=request.user.pk)).data)

    def delete(self, request):
        if not request.user.has_usable_password():
            return Response(
                {"error": "Նախ սահմանեք գաղտնաբառ, որպեսզի կարողանաք մուտք գործել առանց Telegram-ի", "code": "no_password"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        TelegramAccount.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

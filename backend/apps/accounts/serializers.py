from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .permissions import user_is_admin

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    username = serializers.RegexField(
        r"^[\w.@+\- ]+$",
        max_length=150,
        min_length=3,
        error_messages={"invalid": "Օգտանունը կարող է պարունակել տառեր, թվեր, բացատ և . @ + - _"},
    )
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ("id", "username", "email", "password")

    def validate_username(self, value):
        value = " ".join((value or "").split())
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Այս username-ը արդեն գոյություն ունի")
        return value

    def validate_email(self, value):
        value = (value or "").strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Այս email-ը արդեն գրանցված է")
        return value

    def validate(self, attrs):
        candidate = User(username=attrs.get("username"), email=attrs.get("email"))
        validate_password(attrs["password"], user=candidate)
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )


class UserSerializer(serializers.ModelSerializer):
    is_admin = serializers.SerializerMethodField()
    is_vip = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()
    telegram = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "is_admin", "is_vip", "has_password", "telegram", "date_joined")
        read_only_fields = ("id", "username", "is_admin", "is_vip", "has_password", "telegram", "date_joined")

    def get_has_password(self, obj):
        return obj.has_usable_password()

    def get_telegram(self, obj):
        account = getattr(obj, "telegram", None) if hasattr(obj, "telegram") else None
        if not account:
            return None
        return {"username": account.username, "first_name": account.first_name, "notifications": account.notifications}

    def get_is_admin(self, obj):
        return user_is_admin(obj)

    def get_is_vip(self, obj):
        from apps.commerce.models import VipMember

        return VipMember.objects.filter(user=obj).exists()

    def validate_email(self, value):
        value = (value or "").strip().lower()
        if User.objects.filter(email__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("Այս email-ը արդեն գրանցված է")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    # Users who signed up with Telegram have no password yet and may set one without the current password.
    current_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)

    def validate(self, attrs):
        user = self.context["request"].user
        if user.has_usable_password() and not user.check_password(attrs.get("current_password") or ""):
            raise serializers.ValidationError({"current_password": ["Ընթացիկ գաղտնաբառը սխալ է"]})
        return attrs

    def validate_new_password(self, value):
        validate_password(value, user=self.context["request"].user)
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    login = serializers.CharField(max_length=254)  # username or email


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)


class TelegramAuthSerializer(serializers.Serializer):
    """Payload of the Telegram Login Widget callback."""

    id = serializers.IntegerField()
    auth_date = serializers.IntegerField()
    hash = serializers.CharField(max_length=128)
    first_name = serializers.CharField(max_length=256, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=256, required=False, allow_blank=True)
    username = serializers.CharField(max_length=64, required=False, allow_blank=True)
    photo_url = serializers.CharField(max_length=500, required=False, allow_blank=True)


class TelegramSettingsSerializer(serializers.Serializer):
    notifications = serializers.BooleanField()

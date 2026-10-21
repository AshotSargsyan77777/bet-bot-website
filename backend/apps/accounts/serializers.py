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

    class Meta:
        model = User
        fields = ("id", "username", "email", "is_admin", "is_vip", "date_joined")
        read_only_fields = ("id", "username", "is_admin", "is_vip", "date_joined")

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
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Ընթացիկ գաղտնաբառը սխալ է")
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context["request"].user)
        return value

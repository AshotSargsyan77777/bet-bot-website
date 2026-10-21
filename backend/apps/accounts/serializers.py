from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ("id", "username", "email", "password")

    def validate_username(self, value):
        value = (value or "").strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Այս username-ը արդեն գոյություն ունի")
        return value

    def validate_email(self, value):
        value = (value or "").strip().lower()
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Այս email-ը արդեն գրանցված է")
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )


class UserSerializer(serializers.ModelSerializer):
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "is_admin")

    def get_is_admin(self, obj):
        from django.conf import settings

        if obj.is_staff or obj.is_superuser:
            return True
        return (obj.email or "").lower() in settings.ADMIN_EMAILS

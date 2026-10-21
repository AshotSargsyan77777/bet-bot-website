from django.conf import settings
from rest_framework.permissions import BasePermission

from apps.commerce.models import VipMember


class IsVipMember(BasePermission):
    message = "VIP access required"

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        return VipMember.objects.filter(user=user).exists()


class IsAdminUser(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_staff or request.user.is_superuser:
            return True
        email = (request.user.email or "").lower()
        return email in settings.ADMIN_EMAILS

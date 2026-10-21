from rest_framework.permissions import BasePermission

from apps.commerce.models import VipMember


def user_is_admin(user) -> bool:
    """Admin rights come only from Django staff/superuser flags (never from a self-declared email)."""
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


class IsVipMember(BasePermission):
    message = "VIP մուտք է պահանջվում"

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user_is_admin(user):
            return True
        return VipMember.objects.filter(user=user).exists()


class IsAdminUser(BasePermission):
    message = "Մուտք միայն ադմինի համար"

    def has_permission(self, request, view):
        return user_is_admin(request.user)

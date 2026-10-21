from django.contrib import admin

from .models import Payment, PromoCode, SelectionCandidate, Subscription, VipMember


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "package_key", "valid_date", "from_promo", "is_active", "created_at")
    list_filter = ("is_active", "from_promo", "package_key")
    search_fields = ("user__username",)


@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "created_date", "used_by", "used_at")
    search_fields = ("code", "used_by__username")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "package_key", "status", "created_at", "reviewed_at", "reviewed_by")
    list_filter = ("status", "package_key")
    search_fields = ("user__username",)


@admin.register(VipMember)
class VipMemberAdmin(admin.ModelAdmin):
    list_display = ("user", "granted_at")
    search_fields = ("user__username",)


@admin.register(SelectionCandidate)
class SelectionCandidateAdmin(admin.ModelAdmin):
    list_display = ("fixture_name", "market", "selection", "odd", "active", "created_at")
    list_filter = ("active", "market")

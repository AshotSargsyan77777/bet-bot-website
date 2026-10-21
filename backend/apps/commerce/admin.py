from django.contrib import admin

from .models import Payment, PromoCode, SelectionCandidate, Subscription, VipMember


admin.site.register(Subscription)
admin.site.register(PromoCode)
admin.site.register(Payment)
admin.site.register(VipMember)
admin.site.register(SelectionCandidate)

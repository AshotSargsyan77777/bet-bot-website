from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.views import MeView, RegisterView
from apps.checks.views import AdminChecksView, CatalogView, InternalPackagesWebhook, MyCheckView
from apps.commerce.views import (
    AdminCandidatesView,
    AdminPaymentsView,
    AdminPromoView,
    AdminStatsView,
    PaymentListCreateView,
    PromoRedeemView,
    StatusView,
    VipStatusView,
)
from apps.combinator.views import CombinatorPoolView, CombinatorSearchView
from apps.games.views import GameDetailView, GameListView
from apps.support.views import AdminSupportView, SupportTicketCreateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", lambda r: __import__("django.http").http.HttpResponse("OK")),
    path("api/auth/register/", RegisterView.as_view()),
    path("api/auth/token/", TokenObtainPairView.as_view()),
    path("api/auth/token/refresh/", TokenRefreshView.as_view()),
    path("api/me/", MeView.as_view()),
    path("api/checks/catalog/", CatalogView.as_view()),
    path("api/checks/mine/", MyCheckView.as_view()),
    path("api/payments/", PaymentListCreateView.as_view()),
    path("api/promo/redeem/", PromoRedeemView.as_view()),
    path("api/vip/status/", VipStatusView.as_view()),
    path("api/status/", StatusView.as_view()),
    path("api/support/", SupportTicketCreateView.as_view()),
    path("api/games/", GameListView.as_view()),
    path("api/games/<int:fixture_id>/", GameDetailView.as_view()),
    path("api/combinator/pool/", CombinatorPoolView.as_view()),
    path("api/combinator/search/", CombinatorSearchView.as_view()),
    path("api/internal/packages/", InternalPackagesWebhook.as_view()),
    path("api/admin/payments/", AdminPaymentsView.as_view()),
    path("api/admin/promo/", AdminPromoView.as_view()),
    path("api/admin/stats/", AdminStatsView.as_view()),
    path("api/admin/checks/", AdminChecksView.as_view()),
    path("api/admin/candidates/", AdminCandidatesView.as_view()),
    path("api/admin/support/", AdminSupportView.as_view()),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

from django.contrib import admin
from django.http import HttpResponse
from django.urls import path

from apps.accounts.views import ChangePasswordView, LoginView, LogoutView, MeView, RefreshView, RegisterView
from apps.checks.views import AdminChecksView, CatalogView, InternalPackagesWebhook, MyCheckView, PublicSummaryView
from apps.commerce.views import (
    AdminCandidateDetailView,
    AdminCandidatesView,
    AdminPaymentReceiptView,
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
from apps.support.views import AdminSupportDetailView, AdminSupportView, SupportTicketListCreateView


def health(_request):
    return HttpResponse("OK", content_type="text/plain")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    path("api/auth/register/", RegisterView.as_view()),
    path("api/auth/token/", LoginView.as_view()),
    path("api/auth/token/refresh/", RefreshView.as_view()),
    path("api/auth/logout/", LogoutView.as_view()),
    path("api/auth/password/", ChangePasswordView.as_view()),
    path("api/me/", MeView.as_view()),
    path("api/summary/", PublicSummaryView.as_view()),
    path("api/checks/catalog/", CatalogView.as_view()),
    path("api/checks/mine/", MyCheckView.as_view()),
    path("api/payments/", PaymentListCreateView.as_view()),
    path("api/promo/redeem/", PromoRedeemView.as_view()),
    path("api/vip/status/", VipStatusView.as_view()),
    path("api/status/", StatusView.as_view()),
    path("api/support/", SupportTicketListCreateView.as_view()),
    path("api/games/", GameListView.as_view()),
    path("api/games/<int:fixture_id>/", GameDetailView.as_view()),
    path("api/combinator/pool/", CombinatorPoolView.as_view()),
    path("api/combinator/search/", CombinatorSearchView.as_view()),
    path("api/internal/packages/", InternalPackagesWebhook.as_view()),
    path("api/admin/payments/", AdminPaymentsView.as_view()),
    path("api/admin/payments/<int:payment_id>/receipt/", AdminPaymentReceiptView.as_view()),
    path("api/admin/promo/", AdminPromoView.as_view()),
    path("api/admin/stats/", AdminStatsView.as_view()),
    path("api/admin/checks/", AdminChecksView.as_view()),
    path("api/admin/candidates/", AdminCandidatesView.as_view()),
    path("api/admin/candidates/<int:pk>/", AdminCandidateDetailView.as_view()),
    path("api/admin/support/", AdminSupportView.as_view()),
    path("api/admin/support/<int:pk>/", AdminSupportDetailView.as_view()),
]

from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404, HttpResponse
from django.urls import path, re_path

from apps.accounts.views import (
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    PublicConfigView,
    RefreshView,
    RegisterView,
    TelegramLinkView,
    TelegramLoginView,
)
from apps.analysis.views import AnalysisBuyView, AnalysisDetailView, AnalysisListView, MyAnalysesView
from apps.checks.views import (
    AdminChecksView,
    AdminRecordDetailView,
    AdminRecordsView,
    CatalogView,
    CheckHistoryStatsView,
    CheckHistoryView,
    InternalPackagesWebhook,
    InternalSettleWebhook,
    MyCheckView,
    PublicSummaryView,
)
from apps.commerce.views import (
    AdminCandidateDetailView,
    AdminCandidatesView,
    AdminPaymentReceiptView,
    AdminPaymentsView,
    AdminPromoView,
    AdminRevenueView,
    AdminStatsView,
    PaymentListCreateView,
    PromoRedeemView,
    StatusView,
    VipStatusView,
)
from apps.combinator.views import ComboOrderListCreateView, CombinatorPoolView, CombinatorSearchView
from apps.games.views import GameDetailView, GameListView
from apps.support.views import AdminSupportDetailView, AdminSupportView, SupportTicketListCreateView


def health(_request):
    return HttpResponse("OK", content_type="text/plain")


def spa_index(_request):
    """Serves the built React app for client-side routes (/checks, /games/123, ...)."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.is_file():
        raise Http404("Frontend build not found")
    response = FileResponse(index.open("rb"), content_type="text/html")
    response["Cache-Control"] = "no-cache"
    return response


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    path("api/auth/register/", RegisterView.as_view()),
    path("api/auth/token/", LoginView.as_view()),
    path("api/auth/token/refresh/", RefreshView.as_view()),
    path("api/auth/logout/", LogoutView.as_view()),
    path("api/auth/password/", ChangePasswordView.as_view()),
    path("api/auth/telegram/", TelegramLoginView.as_view()),
    path("api/me/telegram/", TelegramLinkView.as_view()),
    path("api/config/", PublicConfigView.as_view()),
    path("api/me/", MeView.as_view()),
    path("api/summary/", PublicSummaryView.as_view()),
    path("api/checks/catalog/", CatalogView.as_view()),
    path("api/checks/mine/", MyCheckView.as_view()),
    path("api/checks/history/", CheckHistoryView.as_view()),
    path("api/checks/history/stats/", CheckHistoryStatsView.as_view()),
    path("api/payments/", PaymentListCreateView.as_view()),
    path("api/promo/redeem/", PromoRedeemView.as_view()),
    path("api/vip/status/", VipStatusView.as_view()),
    path("api/status/", StatusView.as_view()),
    path("api/support/", SupportTicketListCreateView.as_view()),
    path("api/games/", GameListView.as_view()),
    path("api/games/<int:fixture_id>/", GameDetailView.as_view()),
    path("api/combinator/pool/", CombinatorPoolView.as_view()),
    path("api/combinator/search/", CombinatorSearchView.as_view()),
    path("api/combinator/orders/", ComboOrderListCreateView.as_view()),
    path("api/analysis/", AnalysisListView.as_view()),
    path("api/analysis/mine/", MyAnalysesView.as_view()),
    path("api/analysis/<int:pk>/", AnalysisDetailView.as_view()),
    path("api/analysis/<int:pk>/buy/", AnalysisBuyView.as_view()),
    path("api/internal/packages/", InternalPackagesWebhook.as_view()),
    path("api/internal/settle/", InternalSettleWebhook.as_view()),
    path("api/admin/payments/", AdminPaymentsView.as_view()),
    path("api/admin/payments/<int:payment_id>/receipt/", AdminPaymentReceiptView.as_view()),
    path("api/admin/promo/", AdminPromoView.as_view()),
    path("api/admin/stats/", AdminStatsView.as_view()),
    path("api/admin/revenue/", AdminRevenueView.as_view()),
    path("api/admin/records/", AdminRecordsView.as_view()),
    path("api/admin/records/<int:pk>/", AdminRecordDetailView.as_view()),
    path("api/admin/checks/", AdminChecksView.as_view()),
    path("api/admin/candidates/", AdminCandidatesView.as_view()),
    path("api/admin/candidates/<int:pk>/", AdminCandidateDetailView.as_view()),
    path("api/admin/support/", AdminSupportView.as_view()),
    path("api/admin/support/<int:pk>/", AdminSupportDetailView.as_view()),
    # Must stay last: everything that is not API/admin/static is a React route.
    re_path(r"^(?!api/|admin/|static/|health/).*$", spa_index),
]

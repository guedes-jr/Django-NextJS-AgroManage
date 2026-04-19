"""
Accounts app URLs — authentication and user management.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"users", views.UserViewSet, basename="user")

urlpatterns = [
    path("login/", views.login_view, name="auth_login"),
    path("logout/", views.logout_view, name="auth_logout"),
    path("token/refresh/", views.refresh_token_view, name="auth_token_refresh"),
    path("me/", views.me_view, name="auth_me"),
    path("change-password/", views.change_password_view, name="auth_change_password"),
    path("", include(router.urls)),
]
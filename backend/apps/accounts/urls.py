"""
Accounts app URLs — authentication and user management.
"""
from django.urls import path, include, re_path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"users", views.UserViewSet, basename="user")

urlpatterns = [
    re_path(r"^login/?$", views.login_view, name="auth_login"),
    re_path(r"^register/?$", views.register_view, name="auth_register"),
    re_path(r"^password-recovery/?$", views.password_recovery_view, name="auth_password_recovery"),
    re_path(r"^logout/?$", views.logout_view, name="auth_logout"),
    re_path(r"^token/refresh/?$", views.refresh_token_view, name="auth_token_refresh"),
    re_path(r"^me/?$", views.me_view, name="auth_me"),
    re_path(r"^change-password/?$", views.change_password_view, name="auth_change_password"),
    path("", include(router.urls)),
]
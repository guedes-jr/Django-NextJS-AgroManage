from rest_framework_simplejwt.tokens import RefreshToken


def issue_tokens_for_user(user):
    """Issue tokens bound to the user's current revocable session version."""

    refresh = RefreshToken.for_user(user)
    refresh["session_version"] = user.session_version
    return refresh

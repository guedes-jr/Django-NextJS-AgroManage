FROM python:3.12.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SANDBOX_SOCKET=/run/agromanage-sandbox/executor.sock

RUN groupadd --gid 10001 sandbox \
    && useradd --uid 10001 --gid sandbox --no-create-home --shell /usr/sbin/nologin sandbox \
    && install -d -o sandbox -g sandbox -m 0750 /run/agromanage-sandbox

WORKDIR /app
COPY --chown=root:root server.py /app/server.py

USER 10001:10001
ENTRYPOINT ["python", "-I", "/app/server.py"]

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN pip install --no-cache-dir mlflow psycopg2-binary

WORKDIR /mlflow
EXPOSE 5001

CMD ["sh", "-c", "SECURITY_FLAG=''; if [ \"${MLFLOW_DISABLE_SECURITY_MIDDLEWARE:-false}\" = \"true\" ]; then SECURITY_FLAG='--disable-security-middleware'; fi; mlflow server --host 0.0.0.0 --port ${MLFLOW_PORT:-5001} --workers ${MLFLOW_WORKERS:-1} --backend-store-uri ${MLFLOW_BACKEND_STORE_URI:-sqlite:////mlflow/mlflow.db} --default-artifact-root ${MLFLOW_DEFAULT_ARTIFACT_ROOT:-/mlflow/artifacts} --allowed-hosts \"${MLFLOW_ALLOWED_HOSTS:-localhost,127.0.0.1,mlflow}\" --cors-allowed-origins \"${MLFLOW_CORS_ALLOWED_ORIGINS:-http://localhost:*,http://127.0.0.1:*,http://[::1]:*}\" ${SECURITY_FLAG}"]

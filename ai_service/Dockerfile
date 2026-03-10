FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN pip install --no-cache-dir mlflow psycopg2-binary

WORKDIR /mlflow
EXPOSE 5001

CMD ["sh", "-c", "mlflow server --host 0.0.0.0 --port ${MLFLOW_PORT:-5001} --backend-store-uri ${MLFLOW_BACKEND_STORE_URI:-sqlite:////mlflow/mlflow.db} --default-artifact-root ${MLFLOW_DEFAULT_ARTIFACT_ROOT:-/mlflow/artifacts} --allowed-hosts \"${MLFLOW_ALLOWED_HOSTS:-localhost,127.0.0.1,mlflow}\""]

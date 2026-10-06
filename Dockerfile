FROM python:3.14-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/service/backend
WORKDIR /service
COPY backend/requirements.lock /service/backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock
COPY backend /service/backend
COPY app/src/france-boundaries.json /service/app/src/france-boundaries.json
COPY donnees /service/donnees
RUN useradd --uid 10001 --create-home cailloute && mkdir /service/var && chown -R cailloute:cailloute /service/var /service/donnees
USER cailloute
ENV DATA_DIR=/service/var PORT=8080
CMD ["sh", "-c", "exec uvicorn cailloute.main:app --no-access-log --host 0.0.0.0 --port ${PORT}"]

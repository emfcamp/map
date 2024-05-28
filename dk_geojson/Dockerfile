FROM python:3.11-slim-bookworm
RUN pip install poetry
COPY pyproject.toml /
COPY poetry.lock /
RUN poetry install
COPY ./generate_dk_geojson.py /

ENV DB_URL "postgresql://postgres:postgres@db/postgres"

CMD ["poetry", "run", "python3", "/generate_dk_geojson.py", "/noc"]

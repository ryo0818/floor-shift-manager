FROM postgres:17-bookworm

# Runs only when the data volume is empty.
COPY initdb/ /docker-entrypoint-initdb.d/

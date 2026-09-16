# Fastify Blog Docker

Simple Fastify application packaged with Docker.

The project is mainly used to practice containerization, Docker Compose and basic application health monitoring.

## Stack

- Node.js
- Fastify
- Docker
- Docker Compose

## Run with Docker

```bash
docker compose up --build
```

The application will be available at:

```text
http://localhost:3000
```

## Endpoints

### GET /

Returns:

```json
{
  "hello": "world"
}
```

### GET /health

Health check endpoint:

```json
{
  "status": "ok"
}
```

## Docker

The container:

- runs on Node.js Alpine
- runs as a non-root user
- includes a health check
- automatically restarts unless stopped manually
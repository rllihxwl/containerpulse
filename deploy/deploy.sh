#!/bin/sh
set -u

APP_DIR=$(cd "$(dirname "$0")" && pwd)
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
ENV_FILE="$APP_DIR/.env"
NEW_IMAGE="${1:-}"

if [ -z "$NEW_IMAGE" ]; then
  echo "Usage: deploy.sh <image>"
  exit 2
fi

cd "$APP_DIR" || exit 1

compose() {
  docker compose \
    -p containerpulse \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

write_image() {
  printf 'CONTAINERPULSE_IMAGE=%s\n' "$1" > "$ENV_FILE.tmp"
  chmod 600 "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}

wait_ready() {
  i=0

  while [ "$i" -lt 30 ]; do
    CID="$(compose ps -q app 2>/dev/null || true)"

    if [ -n "$CID" ]; then
      if docker exec "$CID" node -e "
        Promise.all([
          fetch('http://127.0.0.1:3000/healthz'),
          fetch('http://127.0.0.1:3000/readyz')
        ]).then(responses => {
          if (responses.some(response => !response.ok)) process.exit(1)
        }).catch(() => process.exit(1))
      " >/dev/null 2>&1; then
        return 0
      fi
    fi

    sleep 2
    i=$((i + 1))
  done

  return 1
}

deploy_image() {
  IMAGE="$1"

  write_image "$IMAGE"

  echo "Pulling $IMAGE"

  if ! compose pull app; then
    return 1
  fi

  echo "Starting ContainerPulse"

  if ! compose up -d --remove-orphans app; then
    return 1
  fi

  echo "Running health and readiness checks"

  wait_ready
}

OLD_IMAGE=""

if [ -f "$ENV_FILE" ]; then
  OLD_IMAGE="$(sed -n 's/^CONTAINERPULSE_IMAGE=//p' "$ENV_FILE" | head -n 1)"
fi

echo "Deploying $NEW_IMAGE"

if deploy_image "$NEW_IMAGE"; then
  echo "Deployment successful"
  exit 0
fi

echo "Deployment failed"

if [ -z "$OLD_IMAGE" ]; then
  echo "No previous image available for rollback"
  exit 1
fi

if [ "$OLD_IMAGE" = "$NEW_IMAGE" ]; then
  echo "Previous image is identical to failed image"
  exit 1
fi

echo "Rolling back to $OLD_IMAGE"

if deploy_image "$OLD_IMAGE"; then
  echo "Rollback successful"
  exit 1
fi

echo "Rollback failed"
exit 2

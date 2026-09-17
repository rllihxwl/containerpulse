FROM node:24-alpine

WORKDIR /app

ARG GIT_SHA=development
ARG BUILD_DATE=local
ARG IMAGE_TAG=local

ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
ENV BUILD_DATE=$BUILD_DATE
ENV IMAGE_TAG=$IMAGE_TAG

LABEL org.opencontainers.image.title="ContainerPulse"
LABEL org.opencontainers.image.description="Release-aware service health and deployment observability"
LABEL org.opencontainers.image.source="https://github.com/rllihxwl/js-fastify-blog-docker"
LABEL org.opencontainers.image.revision=$GIT_SHA
LABEL org.opencontainers.image.created=$BUILD_DATE

COPY package*.json ./

RUN npm ci --omit=dev

COPY --chown=node:node . .

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["npm", "start"]

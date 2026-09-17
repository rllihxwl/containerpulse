const path = require('node:path')
const Fastify = require('fastify')
const packageJson = require('../package.json')
const fastifyStatic = require('@fastify/static')
const prometheus = require('@prometheus-io/client')

function buildApp() {
  const startedAt = Date.now()

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  })

  const build = {
    service: 'ContainerPulse',
    version: process.env.APP_VERSION || packageJson.version,
    commit: process.env.GIT_SHA || 'development',
    buildDate: process.env.BUILD_DATE || 'local',
    environment: process.env.NODE_ENV || 'development',
    image: process.env.IMAGE_TAG || 'local'
  }

  /*
   * Prometheus registry
   */

  const registry = new prometheus.Registry()

  registry.setDefaultLabels({
    service: 'containerpulse'
  })

  prometheus.collectDefaultMetrics({
    register: registry,
    prefix: 'containerpulse_'
  })

  const httpRequests = new prometheus.Counter({
    name: 'containerpulse_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry]
  })

  const httpDuration = new prometheus.Histogram({
    name: 'containerpulse_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [
      0.005,
      0.01,
      0.025,
      0.05,
      0.1,
      0.25,
      0.5,
      1,
      2.5,
      5
    ],
    registers: [registry]
  })

  /*
   * Dashboard traffic store
   *
   * total counters live for the lifetime of the process.
   * latency/error calculations use a rolling 5 minute window.
   */

  const traffic = {
    totalRequests: 0,
    totalServerErrors: 0,
    recent: []
  }

  const FIVE_MINUTES = 5 * 60 * 1000
  const ACTIVITY_BUCKET_MS = 10 * 1000
  const ACTIVITY_BUCKETS = 30

  const excludedPaths = new Set([
    '/healthz',
    '/readyz',
    '/meta',
    '/metrics',
    '/api/v1/status'
  ])

  function shouldTrackRequest(request) {
    const pathname = request.url.split('?')[0]

    if (excludedPaths.has(pathname)) {
      return false
    }

    if (pathname.startsWith('/assets/')) {
      return false
    }

    return true
  }

  function pruneRecent(now = Date.now()) {
    const cutoff = now - FIVE_MINUTES

    while (
      traffic.recent.length > 0 &&
      traffic.recent[0].timestamp < cutoff
    ) {
      traffic.recent.shift()
    }
  }

  function percentile(values, percentileValue) {
    if (values.length === 0) {
      return 0
    }

    const sorted = [...values].sort((a, b) => a - b)

    const index = Math.max(
      0,
      Math.ceil((percentileValue / 100) * sorted.length) - 1
    )

    return sorted[index]
  }

  function getTrafficSnapshot() {
    const now = Date.now()

    pruneRecent(now)

    const durations = traffic.recent.map(item => item.durationMs)

    const serverErrors = traffic.recent.filter(
      item => item.statusCode >= 500
    ).length

    const avgLatencyMs =
      durations.length === 0
        ? 0
        : durations.reduce((sum, value) => sum + value, 0) /
          durations.length

    const p95LatencyMs = percentile(durations, 95)

    const lastMinuteRequests = traffic.recent.filter(
      item => item.timestamp >= now - 60_000
    ).length

    const activity = []

    const activityStart =
      now - ACTIVITY_BUCKET_MS * ACTIVITY_BUCKETS

    for (let i = 0; i < ACTIVITY_BUCKETS; i++) {
      const start =
        activityStart + i * ACTIVITY_BUCKET_MS

      const end = start + ACTIVITY_BUCKET_MS

      const count = traffic.recent.filter(
        item =>
          item.timestamp >= start &&
          item.timestamp < end
      ).length

      activity.push(count)
    }

    return {
      totalRequests: traffic.totalRequests,
      totalServerErrors: traffic.totalServerErrors,
      requestsPerMinute: lastMinuteRequests,
      errorRatePercent:
        traffic.recent.length === 0
          ? 0
          : (serverErrors / traffic.recent.length) * 100,
      avgLatencyMs,
      p95LatencyMs,
      activity,
      windowSeconds: FIVE_MINUTES / 1000
    }
  }

  /*
   * HTTP metrics hooks
   */

  app.addHook('onRequest', async request => {
    if (!shouldTrackRequest(request)) {
      return
    }

    request.metricsStart = process.hrtime.bigint()
  })

  app.addHook('onResponse', async (request, reply) => {
    if (!request.metricsStart) {
      return
    }

    const end = process.hrtime.bigint()

    const durationSeconds =
      Number(end - request.metricsStart) / 1e9

    const durationMs = durationSeconds * 1000

    const route =
      request.routeOptions?.url ||
      'unmatched'

    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode)
    }

    httpRequests.inc(labels)

    httpDuration.observe(
      labels,
      durationSeconds
    )

    traffic.totalRequests += 1

    if (reply.statusCode >= 500) {
      traffic.totalServerErrors += 1
    }

    traffic.recent.push({
      timestamp: Date.now(),
      durationMs,
      statusCode: reply.statusCode
    })

    pruneRecent()
  })

  /*
   * Static dashboard
   */

  app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/assets/'
  })

  app.get('/', async (request, reply) => {
    return reply.sendFile('index.html')
  })

  /*
   * Demo application endpoint
   */

  app.get('/api/v1/hello', async () => {
    return {
      hello: 'world',
      service: 'ContainerPulse'
    }
  })

  /*
   * Health endpoints
   */

  app.get('/healthz', async () => {
    return {
      status: 'ok'
    }
  })

  app.get('/readyz', async () => {
    return {
      status: 'ready'
    }
  })

  /*
   * Build metadata
   */

  app.get('/meta', async () => {
    return {
      ...build,
      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        uptimeSeconds: Math.floor(process.uptime())
      }
    }
  })

  /*
   * Dashboard API
   */

  app.get('/api/v1/status', async () => {
    const memory = process.memoryUsage()

    return {
      status: 'healthy',

      service: build.service,
      version: build.version,
      environment: build.environment,

      deployment: {
        commit: build.commit,
        image: build.image,
        buildDate: build.buildDate
      },

      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        uptimeSeconds: Math.floor(
          (Date.now() - startedAt) / 1000
        ),
        memoryMb: Math.round(
          memory.rss / 1024 / 1024
        )
      },

      metrics: getTrafficSnapshot(),

      timestamp: new Date().toISOString()
    }
  })

  /*
   * Prometheus
   */

  app.get('/metrics', async (request, reply) => {
    reply.type(registry.contentType)

    return registry.metrics()
  })

  return app
}

module.exports = {
  buildApp
}



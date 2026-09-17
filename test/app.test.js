process.env.LOG_LEVEL = 'silent'

const test = require('node:test')
const assert = require('node:assert/strict')

const { buildApp } = require('../src/app')

test('GET /healthz returns healthy status', async () => {
  const app = buildApp()

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz'
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), {
      status: 'ok'
    })
  } finally {
    await app.close()
  }
})

test('GET /readyz returns ready status', async () => {
  const app = buildApp()

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/readyz'
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), {
      status: 'ready'
    })
  } finally {
    await app.close()
  }
})

test('GET /api/v1/status returns runtime information', async () => {
  const app = buildApp()

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/status'
    })

    assert.equal(response.statusCode, 200)

    const body = response.json()

    assert.equal(body.status, 'healthy')
    assert.equal(body.service, 'ContainerPulse')

    assert.equal(
      typeof body.runtime.uptimeSeconds,
      'number'
    )

    assert.equal(
      typeof body.runtime.memoryMb,
      'number'
    )

    assert.equal(
      typeof body.metrics.totalRequests,
      'number'
    )

    assert.ok(
      Array.isArray(body.metrics.activity)
    )
  } finally {
    await app.close()
  }
})

test('GET /api/v1/hello is tracked by metrics', async () => {
  const app = buildApp()

  try {
    await app.inject({
      method: 'GET',
      url: '/api/v1/hello'
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/status'
    })

    const body = response.json()

    assert.equal(body.metrics.totalRequests, 1)
    assert.equal(body.metrics.totalServerErrors, 0)
  } finally {
    await app.close()
  }
})

test('GET /metrics exposes Prometheus metrics', async () => {
  const app = buildApp()

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/metrics'
    })

    assert.equal(response.statusCode, 200)

    assert.match(
      response.body,
      /containerpulse_process_/
    )
  } finally {
    await app.close()
  }
})

test('unknown route returns 404', async () => {
  const app = buildApp()

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/this-does-not-exist'
    })

    assert.equal(response.statusCode, 404)
  } finally {
    await app.close()
  }
})


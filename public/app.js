function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`

  return `${minutes}m`
}

function formatBuildDate(value) {
  if (!value || value === 'local') {
    return 'Local build'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function formatCheckedDate(value) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value))
}

function shortCommit(commit) {
  if (!commit || commit === 'development') {
    return commit || 'Unknown'
  }

  return commit.slice(0, 7)
}

function removeSkeleton(element) {
  element.classList.remove('skeleton')
}

function setText(selector, value) {
  const element = document.querySelector(selector)

  if (!element) {
    return
  }

  element.textContent = value
  removeSkeleton(element)
}

function setBadge(selector, text, type) {
  const element = document.querySelector(selector)

  element.textContent = text
  element.className = `badge ${type}`
}

function setDot(selector, type) {
  const element = document.querySelector(selector)

  element.className = `status-dot ${type}`

  if (selector === '#hero-status-dot') {
    element.classList.add('large')
  }
}

function renderActivity(values) {
  const line = document.querySelector('#activity-line')
  const area = document.querySelector('#activity-area')

  if (!Array.isArray(values) || values.length === 0) {
    return
  }

  const width = 100
  const height = 32
  const bottom = 30
  const top = 3

  const max = Math.max(...values, 1)

  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : (index / (values.length - 1)) * width

    const ratio = value / max

    const y =
      bottom -
      ratio * (bottom - top)

    return {
      x,
      y
    }
  })

  const pointString = points
    .map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ')

  line.setAttribute('points', pointString)

  const areaPath = [
    `M ${points[0].x.toFixed(2)} ${bottom}`,
    ...points.map(
      point =>
        `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    ),
    `L ${points[points.length - 1].x.toFixed(2)} ${bottom}`,
    'Z'
  ].join(' ')

  area.setAttribute('d', areaPath)

  setText(
    '#traffic-peak',
    `Peak ${Math.max(...values)} / 10s`
  )
}

async function checkEndpoint(url) {
  try {
    const response = await fetch(url, {
      cache: 'no-store'
    })

    return response.ok
  } catch {
    return false
  }
}

async function loadStatus() {
  const refreshButton = document.querySelector('#refresh-button')

  refreshButton.disabled = true
  refreshButton.textContent = 'Checking...'

  const [statusResult, healthOk, readyOk] = await Promise.all([
    fetch('/api/v1/status', {
      cache: 'no-store'
    }),
    checkEndpoint('/healthz'),
    checkEndpoint('/readyz')
  ]).catch(() => [null, false, false])

  setBadge(
    '#health-status',
    healthOk ? 'OK' : 'FAILED',
    healthOk ? 'success' : 'danger'
  )

  setBadge(
    '#ready-status',
    readyOk ? 'READY' : 'NOT READY',
    readyOk ? 'success' : 'danger'
  )

  try {
    if (!statusResult || !statusResult.ok) {
      throw new Error('Status API unavailable')
    }

    const data = await statusResult.json()

    setText('#version', data.version)
    setText('#environment', data.environment)
    setText('#uptime', formatUptime(data.runtime.uptimeSeconds))
    setText('#memory', `${data.runtime.memoryMb} MB`)

    setText(
      '#requests',
      data.metrics.totalRequests.toLocaleString()
    )

    setText(
      '#rpm',
      `${data.metrics.requestsPerMinute} req/min`
    )

    setText(
      '#error-rate',
      `${data.metrics.errorRatePercent.toFixed(2)}%`
    )

    setText(
      '#avg-latency',
      `${data.metrics.avgLatencyMs.toFixed(2)} ms`
    )

    setText(
      '#p95-latency',
      `${data.metrics.p95LatencyMs.toFixed(2)} ms`
    )

    setText(
      '#metrics-window',
      `Rolling ${Math.round(data.metrics.windowSeconds / 60)} min`
    )

    renderActivity(data.metrics.activity)

    const commitElement = document.querySelector('#commit')
    commitElement.dataset.fullValue = data.deployment.commit

    setText(
      '#commit',
      shortCommit(data.deployment.commit)
    )

    const imageElement = document.querySelector('#image')
    imageElement.dataset.fullValue = data.deployment.image

    setText(
      '#image',
      data.deployment.image
    )

    setText(
      '#build-date',
      formatBuildDate(data.deployment.buildDate)
    )

    setText(
      '#runtime',
      data.runtime.node
    )

    setText(
      '#platform',
      `${data.runtime.platform}/${data.runtime.architecture}`
    )

    setText(
      '#checked',
      formatCheckedDate(data.timestamp)
    )

    document
      .querySelectorAll('.copy-button')
      .forEach(button => {
        button.disabled = false
      })

    const environment =
      String(data.environment).toLowerCase()

    document.querySelector('#service-type').textContent =
      `${environment.toUpperCase()} SERVICE`

    if (healthOk && readyOk) {
      document.querySelector('#top-status').textContent =
        'All systems operational'

      document.querySelector('#service-status').textContent =
        'Service healthy'

      document.querySelector('#service-description').textContent =
        'Runtime, deployment and service checks are reporting normally.'

      setDot('#top-status-dot', 'success')
      setDot('#hero-status-dot', 'success')

      setBadge(
        '#release-status',
        'Healthy',
        'success'
      )
    } else {
      document.querySelector('#top-status').textContent =
        'Service degraded'

      document.querySelector('#service-status').textContent =
        'Service degraded'

      document.querySelector('#service-description').textContent =
        'One or more service checks are currently failing.'

      setDot('#top-status-dot', 'warning')
      setDot('#hero-status-dot', 'warning')

      setBadge(
        '#release-status',
        'Degraded',
        'warning'
      )
    }
  } catch {
    document.querySelector('#top-status').textContent =
      'Status unavailable'

    document.querySelector('#service-status').textContent =
      'Unable to load service status'

    document.querySelector('#service-description').textContent =
      'ContainerPulse could not retrieve runtime information.'

    document.querySelector('#service-type').textContent =
      'SERVICE STATUS UNKNOWN'

    setDot('#top-status-dot', 'danger')
    setDot('#hero-status-dot', 'danger')

    setBadge(
      '#release-status',
      'Unavailable',
      'danger'
    )

    document
      .querySelectorAll('.skeleton')
      .forEach(element => {
        element.classList.remove('skeleton')
        element.textContent = 'Unavailable'
      })
  } finally {
    refreshButton.disabled = false
    refreshButton.textContent = 'Refresh'
  }
}

async function copyValue(button) {
  const targetId = button.dataset.copyTarget
  const target = document.querySelector(`#${targetId}`)

  const value =
    target.dataset.fullValue ||
    target.textContent

  try {
    await navigator.clipboard.writeText(value)

    const originalText = button.textContent

    button.textContent = 'Copied'

    setTimeout(() => {
      button.textContent = originalText
    }, 1200)
  } catch {
    button.textContent = 'Failed'

    setTimeout(() => {
      button.textContent = 'Copy'
    }, 1200)
  }
}

document
  .querySelector('#refresh-button')
  .addEventListener('click', loadStatus)

document
  .querySelectorAll('.copy-button')
  .forEach(button => {
    button.addEventListener('click', () => {
      copyValue(button)
    })
  })

loadStatus()

setInterval(loadStatus, 30000)

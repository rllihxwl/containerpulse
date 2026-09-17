const { buildApp } = require('./src/app')

const app = buildApp()

const start = async () => {
  try {
    await app.listen({
      port: Number(process.env.PORT || 3000),
      host: process.env.HOST || '0.0.0.0'
    })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

const shutdown = async (signal) => {
  app.log.info({ signal }, 'Graceful shutdown started')

  try {
    await app.close()
    app.log.info('Server stopped cleanly')
    process.exit(0)
  } catch (error) {
    app.log.error(error, 'Graceful shutdown failed')
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start()

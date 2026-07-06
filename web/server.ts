import express from 'express'

const PORT = 8080
const HOST = '0.0.0.0'

const app = express()

const cached_paths = ['/assets', '/icons']

cached_paths.forEach((dir) =>
  app.use(
    dir,
    express.static(`./dist${dir}`, {
      setHeaders: (res) => {
        // Liberal CORS policy - we have no private data on this hostname
        res.setHeader('Access-Control-Allow-Origin', '*')
      },
      maxAge: '90d',
    })
  )
)

app.use(
  express.static('./dist', {
    index: ['index.html'],
    setHeaders: (res) => {
      // Liberal CORS policy - we have no private data on this hostname
      res.setHeader('Access-Control-Allow-Origin', '*')
    },
    maxAge: '5m',
  })
)

app.listen(PORT, HOST)
console.log(`Running on http://${HOST}:${PORT}`)

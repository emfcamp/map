import express from 'express'

const PORT = 8080
const HOST = '0.0.0.0'

const app = express()
app.use(
  express.static('./dist', {
    index: ['index.html'],
    setHeaders: (res) => {
      // Liberal CORS policy - we have no private data on this hostname
      res.setHeader('Access-Control-Allow-Origin', '*')
    },
  })
)

app.listen(PORT, HOST)
console.log(`Running on http://${HOST}:${PORT}`)

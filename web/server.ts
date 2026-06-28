import express from 'express'

const PORT = 8080
const HOST = '0.0.0.0'

const app = express()
app.use(
  express.static('./dist', {
    index: ['index.html'],
  })
)

app.listen(PORT, HOST)
console.log(`Running on http://${HOST}:${PORT}`)

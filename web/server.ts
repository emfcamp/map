import express from 'express'
import serveStatic from 'serve-static'

const PORT = 8080
const HOST = '0.0.0.0'

const app = express()
app.use(serveStatic('./dist', { 'index': ['index.html'] }))

app.listen(PORT, HOST)
console.log(`Running on http://${HOST}:${PORT}`)

var express = require('express')
var fs = require('fs')
var https = require('https')
var http = require('http')
var app = express()

app.get('/', function (req, res) {
  res.send('hello world')
})

http.createServer(app).listen(3080, function () {
  console.log('Example app listening on port 3080! Go to http://localhost:3080/')
})

https.createServer({
  key: fs.readFileSync('certs/server.key'),
  cert: fs.readFileSync('certs/server.cert')
}, app)
.listen(3443, function () {
  console.log('Example app listening on port 3443! Go to https://localhost:3443/')
})

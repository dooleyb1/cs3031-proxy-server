// HTTP & HTTPS modules
var http = require('http');
var https = require('https');
var crypto = require('crypto');

// URL & Request modules
var url = require('url');
var request = require('request');

// Filesystem module
const fs = require('fs');

// SSL Cert & Key
var privateKey = fs.readFileSync('certs/server.key').toString();
var certificate = fs.readFileSync('certs/server.cert').toString();

var options = {key: privateKey, cert: certificate};

https.createServer( options, function(req,res)
{
    app.handle( req, res );
} ).listen( 443 );

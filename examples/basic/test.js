var Hyjack = require('../../index');
var hyjack = new Hyjack({noWatcher: true});
var async = require('async');
var request = require('request');
var wrapedMethods = ['post', 'put', 'patch', 'head', 'del', 'get'];

hyjack.emit('console::log', 'Hitting google using '+wrapedMethods.join(', '));
hyjack.emit('console::log', 'Using HTTP');

async.each(wrapedMethods, function(method, next){
  request[method]('http://google.com', function(){
    next();
  });
}, function(){
  hyjack.emit('console::log', '\nUsing HTTPS');

  wrapedMethods.forEach(function(method){
    request[method]('https://google.com');
  });
});

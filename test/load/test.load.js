var assert = require('assert');
var request = require('request');
var Hyjack = require('../../index');
var async = require('async');
var counter = Hyjack.counter;
var target = 'http://localhost:8080/api/v1/proxy?url=http://localhost:8080/';
var spawn = require('child_process').spawn;
var server;
var noop = function(){};

var samples = [];
var NUM_TESTS = 10000;
var NUM_TESTS_TOTAL = NUM_TESTS * 2;

var log = console.log;

var startServer = function(noHyjack){
  log('Starting server');
  var args = ['server.js'];
  if(noHyjack){
    args.push('--no-hyjack');
  }
  server = spawn('node', args);

  server.stdout.on('data', function (data) {
    log(data.toString().trim());
  });
  server.stderr.on('data', function (data) {
    log(data.toString().trim());
  });
  server.on('close', function(){
    log('Server shutdown');
  });
};

var shutdownServer = function(){
  server.kill();
};

var tst = 0, last = -1;
var runTest = function(callback){
  async.eachLimit(new Array(NUM_TESTS), 10, function(none, next){
    var curr = Math.floor((tst++ / NUM_TESTS_TOTAL)*100);
    if(curr>last){
      console.log(curr+'% Complete ('+tst+'/'+NUM_TESTS_TOTAL+')');
      last = curr;
    }
    var start = counter();
    request(target, function(){
      samples.push(Math.ceil(counter(start)));
      next();
    });
  }, function(){
    var min=9007199254740992, max=0;
    var sum = samples.reduce(function(ttl, val){
      if(val<min){
        min = val;
      }
      if(val>max){
        max = val;
      }
      return ttl+val;
    }, 0);
    var avg = sum / samples.length;
    shutdownServer();
    setTimeout(function(){
      (callback || noop)(min, max, Math.ceil(avg), samples.length);
    }, 2000);
  });
}

startServer(true);
console.log('Waiting for server to start.');
setTimeout(function(){
  runTest(function(min, max, avg, num){
    samples = [];
    startServer(false);

    console.log('Waiting for server to start.');
    setTimeout(function(){
      runTest(function(min2, max2, avg2, num2){
        log('No hyjack (min, max, avg, number): ', min+'ms', max+'ms', avg+'ms', num+' iterations');
        log('With hyjack (min, max, avg, number): ', min2+'ms', max2+'ms', avg2+'ms', num2+' iterations');
      });
    }, 1000);
  });
}, 1000);

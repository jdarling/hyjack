var request = require('request');
var Hyjack = require('../../index');
var async = require('async');
var counter = Hyjack.counter;

var samples = [];

var target = process.argv[2];
var NUM_TESTS = parseInt(process.argv[3])||1000;

if(!target){
  console.log('Usage: node test.hammer.js <endpoint> <numTests>');
  console.log('  numTests is optional and defaults to 1000');
  console.log('EG:');
  console.log('  node test.hammer.js htt://www.google.com/');
  process.exit();
}

async.eachLimit(new Array(NUM_TESTS), 10, function(none, next){
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
  console.log('Min response time: ', min+'ms');
  console.log('Max response time: ', max+'ms');
  console.log('Avg response time: ', Math.ceil(avg)+'ms');
  console.log('Number Samples ran:', samples.length);
});

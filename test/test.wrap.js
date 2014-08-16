var assert = require('assert');
var async = require('async');
var request = require('request');

var touch = function(fileName, callback){
  var src = "var fs = require('fs');"+
    "fs.writeFileSync('"+fileName+"', fs.readFileSync('"+fileName+"'));";
  var touch = require('child_process').spawn('node', ['-e', src]);
  touch.stdout.on('data', function(data){
    console.log(data.toString());
  });
  touch.stderr.on('data', function(data){
    console.log(data.toString());
  });
  if(callback){
    touch.on('close', function(){
      callback();
    });
  }
};

var getSlope = function(samples, key){
  var sum = 0;
  var max = 0;
  var min = Infinity;
  samples.forEach(function (sample) {
    var value = sample[key];
    sum += value;
    if (value > max) max = value;
    if (value < min) min = value;
  });
  var mean = sum / samples.length;
  var deviation = 0;
  samples.forEach(function (sample) {
    var diff = mean - sample[key];
    deviation += diff * diff;
  });
  deviation = Math.sqrt(deviation / (samples.length - 1));
  var limit = mean / 10;
  if (deviation > limit) {
    console.log("%s: min %s, mean %s, max %s, standard deviation %s", key, min, mean, max, deviation);
    throw new Error("Deviation for " + key + " over " + limit + ", probably a memory leak");
  }
};

describe('Hyjack basic tests', function(){

  describe('Library', function(){
    var Hyjack;
    var os = require('os');

    it('Should load successfully', function(done){
      Hyjack = require('../index');
      done();
    });

    it('Should allow for creation with no arguments', function(done){
      var hyjack = new Hyjack();
      hyjack.clearHooks();
      done();
    });

    it('Should allow for creation with empty object', function(done){
      var hyjack = new Hyjack({});
      hyjack.clearHooks();
      done();
    });

    it('Should allow for creation with empty string', function(done){
      var hyjack = new Hyjack('');
      hyjack.clearHooks();
      done();
    });

    it('Should allow creation with explicit hooks', function(done){
      var hooks = {};
      var hyjack = new Hyjack({hooks: hooks});
      hyjack.clearHooks();
      done();
    });

    it('Should allow events to be emitted back for use', function(done){
      var hyjack;
      var hooks = {
        'Capture when os.type called': {
          type: 'method',
          method: 'trigger',
          unit: 'os',
          methodName: 'type',
          callback: function(){
            hyjack.emit('done', this._super);
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {fs: require('fs')}});
      hyjack.on('done', function(){
        hyjack.clearHooks();
        done();
      });
      os.type();
    });

    it('Should provide a high percision counter', function(done){
      var hyjack;
      var hooks = {
        'Capture when os.type called': {
          type: 'method',
          method: 'trigger',
          unit: 'os',
          methodName: 'type',
          callback: function(){
            hyjack.emit('done', counter());
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {fs: require('fs')}});
      hyjack.on('done', function(counterValue){
        assert(counterValue);
        hyjack.clearHooks();
        done();
      });
      os.type();
    });
  });

  describe('Wrap emit on http', function(){
    var Hyjack = require('../index');
    var hooks = {
      'Capture http.Agent.free': {
        type: 'event',
        method: 'trigger',
        unit: 'http',
        object: 'Agent',
        event: 'free',
        callback: function(event, socket){
          hyjack.emit('agent::free', socket);
        }
      }
    };

    it('Should take explicit hooks and wrap http.Agent.free', function(done){
      var hyjack = new Hyjack({hooks: hooks});
      hyjack.clearHooks();
      done();
    });

    it('Should wrap http.Agent.free calls', function(done){
      var hyjack = new Hyjack({hooks: hooks});
      this.timeout(10000);
      hyjack.on('agent::free', function(){
        hyjack.clearHooks();
        done();
      });
      request('https://www.google.com/');
    });

    it('Should allow us to time length between events', function(done){
      var hyjack = new Hyjack({hooks: {
          'Capture all traffic going to the outside world': {
            type: 'event',
            method: 'timer',
            start: {
              unit: 'http',
              object: 'ClientRequest',
              event: 'socket',
              callback: function(event, socket){
                this.map.set(socket._httpMessage, {
                  start: this.counter,
                  started: new Date()
                });
              }
            },
            complete: {
              unit: 'http',
              object: 'Agent',
              event: 'free',
              callback: function(event, socket){
                var conversation = this.map.get(socket._httpMessage);
                if(!conversation){
                  return;
                }
                // Make sure you cleanup after yourself
                this.map.delete(socket._httpMessage);
                conversation.complete = this.counter;
                conversation.duration = conversation.complete - conversation.start;
                conversation.completed = new Date();
                try{ // capture the uri component of the req object if it exists
                  conversation.uri = socket._httpMessage.res.request.uri;
                }catch(e){
                }
                hyjack.emit('done', conversation);
              }
            }
          }
        }
      });
      this.timeout(10000);
      hyjack.on('done', function(pkt){
        assert(pkt.start);
        assert(pkt.complete);
        assert(pkt.duration===pkt.complete-pkt.start);
        hyjack.clearHooks();
        done();
      });
      request('https://www.google.com/');
    });
  });

  describe('Wrap super method', function(){
    var Hyjack = require('../index');
    var hyjack;
    it('Should allow us to get called when the source method is called', function(done){
      var os = require('os');
      var hooks = {
        'Capture when os.type called': {
          type: 'method',
          method: 'trigger',
          unit: 'os',
          methodName: 'type',
          callback: function(){
            hyjack.clearHooks();
            hyjack.emit('done', {_super: this._super, self: this});
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {done: done, assert: assert}});
      hyjack.on('done', function(info){
        assert(info._super);
        assert(info._super.call(info.self));
        hyjack.clearHooks();
        done();
      });
      os.type();
    });
  });

  describe('Injection', function(){
    var Hyjack = require('../index');
    var os = require('os');
    it('Should allow us to inject custom libraries', function(done){
      var hyjack;
      var hooks = {
        'Capture when os.type called': {
          type: 'method',
          method: 'trigger',
          unit: 'os',
          methodName: 'type',
          callback: function(){
            if(!net){
              throw new Error('fs does not exist!');
            }
            hyjack.emit('done', this._super);
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {net: require('net')}});
      hyjack.on('done', function(_super){
        assert(_super);
        assert(_super.call(this));
        hyjack.clearHooks();
        done();
      });
      os.type();
    });
    it('Should allow us to inject custom methods and use them', function(done){
      var hyjack;
      var hooks = {
        'Capture when os.type called': {
          type: 'method',
          method: 'trigger',
          unit: 'os',
          methodName: 'type',
          callback: function(){
            assert(this._super);
            assert(this._super.call(this));
            hyjack.clearHooks();
            done();
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {assert: assert, done: done}});
      os.type();
    });
  });
});

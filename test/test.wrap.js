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
      hyjack.stopWatchingConfig();
      done();
    });
    it('Should create the config file if it doesn\'t exist', function(done){
      var fs = require('fs');
      var hyjack;
      if(fs.existsSync('./hyjack.exists')){
        fs.unlinkSync('./hyjack.exists');
      }
      hyjack = new Hyjack('./hyjack.exists');
      assert(fs.existsSync('./hyjack.exists'));
      fs.unlinkSync('./hyjack.exists');
      hyjack.stopWatchingConfig();
      done();
    });
    it('Should allow for creation with empty object', function(done){
      var hyjack = new Hyjack({});
      hyjack.stopWatchingConfig();
      done();
    });
    it('Should allow for creation with empty string', function(done){
      var hyjack = new Hyjack('');
      hyjack.stopWatchingConfig();
      done();
    });
    it('Should allow creation with explicit hooks', function(done){
      var hooks = {};
      var hyjack = new Hyjack({hooks: hooks});
      hyjack.stopWatchingConfig();
      done();
    });
    it('Should allow events to be emitted back for use', function(done){
      var hyjack;
      var hooks = {
        'Capture when os.type called': {
          type: 'method',
          method: 'override',
          unit: 'os',
          methodName: 'type',
          callback: function(_super){
            hyjack.emit('done', _super);
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {fs: require('fs')}});
      hyjack.on('done', function(_super){
        hyjack.clearHooks();
        hyjack.stopWatchingConfig();
        done();
      });
      os.type();
    });
    it('Should provide a high percision counter', function(done){
      var hyjack;
      var hooks = {
        'Capture when os.type called': {
          type: 'method',
          method: 'override',
          unit: 'os',
          methodName: 'type',
          callback: function(_super){
            hyjack.emit('done', counter());
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {fs: require('fs')}});
      hyjack.on('done', function(counterValue){
        assert(counterValue);
        hyjack.clearHooks();
        hyjack.stopWatchingConfig();
        done();
      });
      os.type();
    });
    it('Should not crash if another module watches the config file', function(done){
      this.timeout(10000);
      var fs = require('fs');
      var watcher = new Function();
      var hyjack;
      var hooks = {
      };
      fs.watchFile('./hyjack.config', watcher);
      hyjack = new Hyjack({hooks: hooks, sandbox: {fs: require('fs')}});
      touch('./hyjack.config', function(){
        setTimeout(done, 1000); // give it pleanty of time to crash
      });
    });
    it('Should not crash if you update the config file an insane amount of times', function(done){
      var fs = require('fs');
      var CONFIG_FILE = './hyjack.insane';
      var hyjack;
      var NUM_TESTS = 1000;

      fs.writeFileSync(CONFIG_FILE, "{'Capture http.Agent.free': {type: 'event',method: 'trigger',unit: 'http',object: 'Agent',event: 'free',callback: function(event, socket){hyjack.emit('agent::free', socket);}}}");
      hyjack = new Hyjack(CONFIG_FILE);

      this.timeout(10*60000); // This test can take a REALLY LONG time to complete
      async.eachSeries(new Array(NUM_TESTS), function(empty, next){
        touch(CONFIG_FILE, function(){
          setTimeout(next, 10);
        });
      }, function(){
        hyjack.stopWatchingConfig();
        hyjack.clearHooks();
        fs.unlink(CONFIG_FILE);
        done();
      });
    });
    it('Should issue an event when config reloaded', function(done){
      this.timeout(30000); // Allow up to 30 seconds for the detection of the change
      var Hyjack = require('../index');
      var fs = require('fs');
      var CONFIG_FILE = './hyjack.touch';
      var hyjack;

      fs.writeFileSync(CONFIG_FILE, "{'Capture http.Agent.free': {type: 'event',method: 'trigger',unit: 'http',object: 'Agent',event: 'free',callback: function(event, socket){hyjack.emit('agent::free', socket);}}}");
      hyjack = new Hyjack(CONFIG_FILE);
      hyjack.on('hyjack::config::reload', function(){
        hyjack.stopWatchingConfig();
        hyjack.clearHooks();
        fs.unlink(CONFIG_FILE);
        done();
      });
      setTimeout(function(){
        touch(CONFIG_FILE);
      }, 100);
    });
    it('Shouldn\'t leak when reloading config lots of times', function(done){
      this.timeout(10*60000); // This test can take a REALLY LONG time to complete
      var samples = [];
      var NUM_TESTS = 100;
      var Hyjack = require('../index');
      var hyjack;
      var CONFIG_FILE = './hyjack.touch';
      var fs = require('fs');

      samples.push(process.memoryUsage());

      fs.writeFileSync(CONFIG_FILE, "{'Capture http.Agent.free': {type: 'event',method: 'trigger',unit: 'http',object: 'Agent',event: 'free',callback: function(event, socket){hyjack.emit('agent::free', socket);}}}");
      hyjack = new Hyjack(CONFIG_FILE);
      hyjack.on('hyjack::config::reload', function(){
        samples.push(process.memoryUsage());
      });

      async.eachSeries(new Array(NUM_TESTS), function(empty, next){
        touch(CONFIG_FILE, function(){
          setTimeout(next, 500);
        });
      }, function(){
        hyjack.stopWatchingConfig();
        hyjack.clearHooks();
        fs.unlink(CONFIG_FILE);
        getSlope(samples, 'rss');
        done();
      });
    });
  });

  describe('Wrap emit on http', function(){
    var Hyjack = require('../index');
    var hyjack;
    it('Should take explicit hooks and wrap http.Agent.free', function(done){
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
      hyjack = new Hyjack({hooks: hooks});
      hyjack.stopWatchingConfig();
      done();
    });
    it('Should wrap http.Agent.free calls', function(done){
      this.timeout(10000);
      hyjack.on('agent::free', function(){
        hyjack.clearHooks();
        hyjack.stopWatchingConfig();
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
          method: 'override',
          unit: 'os',
          methodName: 'type',
          callback: function(_super){
            hyjack.clearHooks();
            hyjack.emit('done', {_super: _super, self: this});
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {done: done, assert: assert}});
      hyjack.on('done', function(info){
        assert(info._super);
        assert(info._super.call(info.self));
        hyjack.stopWatchingConfig();
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
          method: 'override',
          unit: 'os',
          methodName: 'type',
          callback: function(_super){
            if(!net){
              throw new Error('fs does not exist!');
            }
            hyjack.emit('done', _super);
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {net: require('net')}});
      hyjack.on('done', function(_super){
        assert(_super);
        assert(_super.call(this));
        hyjack.clearHooks();
        hyjack.stopWatchingConfig();
        done();
      });
      os.type();
    });
    it('Should allow us to inject custom methods and use them', function(done){
      var hyjack;
      var hooks = {
        'Capture when os.type called': {
          type: 'method',
          method: 'override',
          unit: 'os',
          methodName: 'type',
          callback: function(_super){
            assert(_super);
            assert(_super.call(this));
            hyjack.clearHooks();
            hyjack.stopWatchingConfig();
            done();
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {assert: assert, done: done}});
      os.type();
    });
  });
});

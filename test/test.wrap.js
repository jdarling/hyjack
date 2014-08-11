var assert = require('assert');
var async = require('async');
var request = require('request');

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
      done();
    });
    it('Should allow for creation with empty object', function(done){
      var hyjack = new Hyjack({});
      done();
    });
    it('Should allow for creation with empty string', function(done){
      var hyjack = new Hyjack('');
      done();
    });
    it('Should allow creation with explicit hooks', function(done){
      var hooks = {};
      var hyjack = new Hyjack({hooks: hooks});
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
        done();
      });
      os.type();
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
      done();
    });
    it('Should wrap http.Agent.free calls', function(done){
      hyjack.on('agent::free', function(){
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
            done();
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks, sandbox: {assert: assert, done: done}});
      os.type();
    });
  });
});

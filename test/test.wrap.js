var assert = require('assert');
var async = require('async');
var request = require('request');

describe('Hyjack basic tests', function(){
  describe('Library', function(){
    var Hyjack;
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
        done();
        hyjack.clearHooks();
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
            assert(_super);
            assert(_super.call(this));
            done();
          }
        }
      };
      hyjack = new Hyjack({hooks: hooks});
      os.type();
    });
  });
});

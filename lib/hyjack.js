var uuid = require('uuid').v4;
var fs = require('fs');
var util = require('util');
var events = require('events');
var vm = require('vm');

var counter = (function(){
  var getNanoSeconds = function getNanoSeconds(){
      hr = process.hrtime();
      return hr[0] * 1e9 + hr[1];
    };
  var loadTime = getNanoSeconds();
  return function(from){
    var v = (getNanoSeconds()-loadTime) / 1e6;
    return from?v-from:v;
  };
})();

var trace_error = function trace_error(e){
  if(e.stack){
    console.error(e.stack);
  }else{
    console.trace(e);
  }
};

var getObject = function(lib, objectName){
  if(!objectName){
    return lib;
  }
  var path = objectName.split('.');
  var o = lib;
  var step;
  while(o && path.length){
    step = path.shift();
    o = o[step];
  }
  return o;
};

var addEmitHook = function _addEmitHook(hooks, unit, object, event, emitter, wrapper){
  try{
    var asPrototype = !!emitter.prototype.emit;
    var id = unit+'::'+object;
    var isNew = !hooks[id];
    var hook = hooks[id] || (hooks[id] = {
      id: id,
      type: 'event',
      asPrototype: asPrototype,
      emitter: asPrototype?emitter.prototype.emit:emitter.emit,
      source: emitter,
      listeners: {}
    });
    var wrapEmit = function _wrapEmit(hook){
      return function _emitterWrapper(event){
        var self = this, args = Array.prototype.slice.call(arguments);
        try{
          var listeners = (hook.listeners[event] || []).concat(hook.listeners['*'] || []);
          listeners.forEach(function(listener){
            try{
              listener.apply(self, args);
            }catch(e){
              console.error('ERROR: addEmitHook.wrapEmit._emitterWrapper.listeners.forEach');
              try{
                console.error(listener.toString());
                trace_error(e);
              }catch(e){
                trace_error(e);
              }
            }
          });
        }catch(e){
          console.error('ERROR: ERROR: addEmitHook.wrapEmit._emitterWrapper');
          console.error(hook);
          trace_error(e);
        }
        hook.emitter.apply(self, arguments);
      };
    };
    var listeners = hook.listeners[event||'*'] || (hook.listeners[event||'*'] = []);

    if(isNew){
      if(asPrototype){
        emitter.prototype.emit = wrapEmit(hook);
      }else{
        emitter.emit = wrapEmit(hook);
      }
    }
    listeners.push(wrapper);
  }catch(e){
    trace_error(e);
  }
};

var addMethodWrapper = function _addEmitHook(hooks, unit, object, methodName, source, wrapper){
  try{
    var asPrototype = !!(source.prototype||{})[methodName]; // some source types might not have a prototype
    var id = unit+'::'+object;
    var isNew = !hooks[id];
    var hook = hooks[id] || (hooks[id] = {
      id: id,
      type: 'method',
      methodName: methodName,
      asPrototype: asPrototype,
      _super: asPrototype?source.prototype[methodName]:source[methodName],
      source: source,
      wrappers: []
    });
    var wrapSuper = function _wrapEmit(hook){
      return function _superWrapper(){
        var self = this, args = Array.prototype.slice.call(arguments);
        var _super = hook._super;
        var wrappers = hook.wrappers || [];
        try{
          args.unshift(_super);
          wrappers.forEach(function(wrapper){
            try{
              wrapper.apply(self, args);
            }catch(e){
              console.error('ERROR: addMethodWrapper.wrapSuper._wrapEmit.wrappers.forEach');
              try{
                console.error(wrapper.toString());
                trace_error(e);
              }catch(e){
                trace_error(e);
              }
            }
          });
        }catch(e){
          console.error('ERROR: ERROR: addMethodWrapper.wrapSuper._wrapEmit');
          console.error(hook);
          trace_error(e);
        }
        _super.apply(self, arguments);
      };
    };
    var wrappers = hook.wrappers || (hook.wrappers = []);

    if(isNew){
      if(asPrototype){
        source.prototype[methodName] = wrapSuper(hook);
      }else{
        source[methodName] = wrapSuper(hook);
      }
    }
    wrappers.push(wrapper);
  }catch(e){
    trace_error(e);
  }
};

var WRAPPER_GENERATORS = {
  event_trigger: function(hook, hooks){
    var self = this;
    var lib = require(hook.unit);
    var emitter = getObject(lib, hook.object);
    var wrapper = hook.callback;
    var event = hook.event;
    addEmitHook.call(self, hooks, hook.unit, hook.object, event, emitter, wrapper);
  },
  /*
  event_timer: function(hook, hooks){
    WRAPPER_GENERATORS.event_trigger(hook.start, hooks);
    WRAPPER_GENERATORS.event_trigger(hook.complete, hooks);
  }
  */
  method_override: function(hook, hooks){
    var self = this;
    var lib = require(hook.unit);
    var source = getObject(lib, hook.object);
    var wrapper = hook.callback;
    var methodName = hook.methodName;
    addMethodWrapper.call(self, hooks, hook.unit, hook.object, methodName, source, wrapper);
  }
};

var console_log = function(data){
  if(data instanceof Array || (typeof(data)!=='string'&&data.length)){
    return console.log.apply(console, Array.prototype.slice.call(data));
  }
  console.log(data);
};

var Hyjack = function Hyjack(opts){
  var self = this;
  var options = opts||{};
  var configFile = typeof(options)==='string'?options:options.configFile||'./hyjack.config';
  events.EventEmitter.apply(self, arguments);
  self.on('console::log', console_log);
  self.reloadConfig(configFile);
  try{
    if(options.hooks){
      self.registerHooks(options.hooks);
    }else if(!options.noWatcher){
      fs.watchFile(configFile, (function(self){
        return function(curr, prev){
          self.reloadConfig();
        };
      })(self));
      self._fileWatcher=true;
    }
  }catch(e){
    console.error('ERROR: Hyjack->fs.watchFile');
    trace_error(e);
  }
};
util.inherits(Hyjack, events.EventEmitter);

Hyjack.counter = counter;

Hyjack.prototype.removeHook = function Hyjack_removeHook(hook){
  var self = this;
  var hooks = self._hooks || {};
  // TODO: Completely rewrite this so it doesn't destroy all other listeners
  if(hook){
    try{
      if(hook.type==='event'){
        if(hook.asPrototype){
          hook.source.prototype.emit = hook.emitter;
        }else{
          hook.source.emit = hook.emitter;
        }
      }else if(hook.type==='method'){
        if(hook.asPrototype){
          hook.source.prototype[hook.methodName] = hook._super;
        }else{
          hook.source[hook.methodName] = hook._super;
        }
      }
    }catch(e){
    }
    delete hooks[hook.id];
  }
};

Hyjack.prototype.clearHooks = function Hyjack_clearHooks(){
  var self = this;
  var hooks = Object.keys(self._hooks || {});
  hooks.forEach(function(key){
    self.removeHook(self._hooks[key]);
  });
};

Hyjack.prototype.registerHook = function Hyjack_registerHook(hook){
  var self = this;
  var hooks = self._hooks = self._hooks || {};
  var lib, wrapper;
  try{
    wrapper = WRAPPER_GENERATORS[hook.type+'_'+hook.method];
    if(wrapper){
      wrapper.call(self, hook, hooks);
    }else{
      console.error('ERROR: Hyjack.prototype.registerHook!wrapper');
      console.error(new Error('No wrapper generator for '+hook.type+'_'+hook.method));
    }
  }catch(e){
    console.error('ERROR: Hyjack.prototype.registerHook');
    trace_error(e);
  }
};

Hyjack.prototype.registerHooks = function Hyjack_registerHooks(newHooks){
  var self = this;
  var keys;
  if(newHooks instanceof Array){
    newHooks.forEach(function(hook){
      self.registerHook(hook);
    });
  }else{
    keys = Object.keys(newHooks);
    keys.forEach(function(key){
      self.registerHook(newHooks[key]);
    });
  }
};

Hyjack.prototype.reloadConfig = function Hyjack_reloadConfig(configFile){
  var self = this;
  var config, sandbox = {
    uuid: uuid,
    hyjack: self,
    counter: counter
  };
  try{
    self.clearHooks();
    if(configFile){
      self._configFile = configFile;
    }
    config = 'config = '+fs.readFileSync(self._configFile).toString().trim()+';';
    vm.runInNewContext(config, sandbox);
    self.registerHooks(sandbox.config);
  }catch(e){
    console.error('ERROR: Hyjack.prototype.reloadConfig');
    console.error(sandbox.config || config);
    trace_error(e);
  }
};

module.exports = Hyjack;

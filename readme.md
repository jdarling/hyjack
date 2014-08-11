Hyjack.js
=========

Hyjack.js lets you tie into existing EventEmitter based objects and hyjack their
events for things like logging, monitoring, or whatever.  It does this by
overriding the objects default .emit event and introducing its own emitter
function that does something and then calls back to the original.

Why???
======

Have you ever needed to do something like start logging request response times
in your running application?  Need to make sure that you are actually cleaning
up your connections that you are creating?  Want to do it all without restarting
your application?

That is why I wrote Hyjack.js.  It's goal is to provide you a method of tying
into existing event emitter based objects on the fly to change the way your
application logs or details information.  Combine it with something like statsd
and you have a really powerful reporting integration system.

One other think that Hyjack lets you do is intercept (but not repleace)
the default methods and prototype methods on existing libraries, and Objects.

It's Hijack!
------------

Yeah, I know, but there is already a Node module named Hijack
(https://www.npmjs.org/package/hijack) but it seems to be dead.  In fact it
did almost the same thing that Hyjack does.

Installation
============

```
npm install hyjack
```

Tests
=====

Tests are developed using Mocha.  If you want to test make sure you have
development dependencies installed and that you have Mocha installed globally.

```
mocha test
```

or

```
npm test
```

Important Notes
===============

  * Hyjack makes changes directly to the global object's!
  * Hyjack only makes changes to the module specified, so if you have other
    copies of the same module in other modules Hyjack will not modify them.
  * Make sure you have a hyjack.config file in your project directory before
    you start your application.  Not having one will not stop your application
    from starting, but it will stop Hyjack from detecting when it is created
    and thus reloading changes.  If nothing else just create an empty file.
  * Errors in your hyjack.config will NOT cause the application to halt or exit.
    Instead an error will be logged to stderr and file monitoring will continue.
  * Hyjack uses Node's built in require method, so anything you can require
    in your project you can Hyjack just the same.  To hyjack a specific instance
    of a sub module then set the unit to something like
    './node_modules/main/node_modules/other'
  * Yes, you can hyjack Hyjack, NO, it's NOT a good idea!  This could result
    in a pretty bad recursive loop that could (eventually) crash your
    application.  You have been warned.

Example Usage
=============

Below are some examples of how you could use Hyjack within your projects.
This is not the only things you can do with Hyjack, but they are a good
starting point.

Setup
-----

Make sure that you require('hyjack') in your code some place then create a new
instance of Hyjack.  Ideally this would be the first piece of code within your
project.  Then start using hyjack.  Yep, its that easy.

```
var Hyjack = require('./index');
new Hyjack();
```

Find what events are available
------------------------------

Setup your hyjack.config file as follows:

```
{
  'Find what events are available': {
    type: 'event',
    method: 'trigger',
    unit: 'http',
    object: 'ClientRequest',
    callback: function(event){
      hyjack.emit('console::log', [event, arguments.length]);
    }
  }
}
```

Then watch the messages start appearing.

Log when an event happens
-------------------------

Setup your hyjack.config file as follows:

```
{
  'Log when a socket is connected': {
    type: 'event',
    method: 'trigger',
    unit: 'net',
    object: 'Socket',
    event: 'connect',
    callback: function(){
      hyjack.emit('console::log', 'Socket connected');
    }
  },
  'Log when a socket is disconnected': {
    type: 'event',
    method: 'trigger',
    unit: 'net',
    object: 'Socket',
    event: 'close',
    callback: function(){
      hyjack.emit('console::log', 'Socket disconnected');
    }
  }
}
```

Then watch the messages start appearing.

Logging outgoing HTTP requests
------------------------------

Setup your hyjack.config file as follows:

```
{
  'Init a conversation object to track round trip': {
    type: 'event',
    method: 'trigger',
    unit: 'http',
    object: 'ClientRequest',
    event: 'socket',
    callback: function(event, socket){
      socket._httpMessage._conversation = {
        id: uuid(),
        start: counter(),
        started: new Date()
      };
    }
  },
  'Complete conversation object and log round trip': {
    type: 'event',
    method: 'trigger',
    unit: 'http',
    object: 'Agent',
    event: 'free',
    callback: function(event, socket){
      var conversation = socket._httpMessage._conversation;
      conversation.complete = counter();
      conversation.duration = conversation.complete - conversation.start;
      conversation.completed = new Date();
      try{ // capture the uri component of the req object if it exists
        conversation.uri = socket._httpMessage.res.request.uri;
      }catch(e){
      }
      hyjack.emit('console::log', ['HTTP Call Complete:', conversation]);
    }
  }
}
```

Then watch the messages start appearing.

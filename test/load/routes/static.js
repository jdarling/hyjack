var path = require('path');
var webconfig = require('../lib/config.js').section('web', {
    webroot: './webroot'
  });

module.exports = function(options, next){
	var config = options.hapi.config;
  var webroot = path.resolve(config.webroot || webconfig.webroot);
  console.log('Serving static content from: ', webroot);
	options.hapi.server.route({
		method: 'GET',
		path: '/{path*}',
    handler: {
				directory: { path: webroot, listing: false, index: true }
		}
	});
  next();
};

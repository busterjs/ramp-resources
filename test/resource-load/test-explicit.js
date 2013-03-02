var buster = require('buster'),
	resourceSet = require('../../lib/resource-set.js').create(process.cwd());


buster.testCase('Resource Set Test under Windows',{
	'load/cache': function(done){
		resourceSet.addGlobResource("**/*.js").then(function(){

			assert.defined(resourceSet.get('/letters/a/a.js'), 'resource is not in set');
			done();
		});
	}
});


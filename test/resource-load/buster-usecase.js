//var config = module.exports;

exports.Load = {
     env: "browser",
	 rootPath: "../",
     resources: [
			"resource-load/**/*.js"			
		],
	 tests: [
         "resource-load/test-usecase.js"
     ]
 };

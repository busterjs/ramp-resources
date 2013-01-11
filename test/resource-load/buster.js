var config = module.exports;

 config["Load"] = {
     env: "browser",
	 rootPath: "../",
     resources: [
			"resource-load/**/*.js"			
		],
	 tests: [
         "resource-load/test.js"
     ]
 };

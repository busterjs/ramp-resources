var buster = require("buster");

buster.testRunner.onCreate(function (runner) {
    runner.on("suite:end", function (results) {
        if (!results.ok) {
            setTimeout(function () {
                process.exit(1);
            }, 50);
        }
    });
});

require("./test/file-test");
require("./test/http-proxy-test");
require("./test/load-path-test");
require("./test/processors/iife-processor-test");
require("./test/resource-file-resolver-test");
require("./test/resource-middleware-test");
require("./test/resource-set-cache-test");
require("./test/resource-set-test");
require("./test/resource-test");

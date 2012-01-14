var http = require("http");

/**
 * Create middleware capable of serving a resource set over HTTP
 */
exports.create = function (contextPath) {
    var sets = [];

    function getResource(path) {
        return sets.map(function (rs) {
            return rs.get(path);
        }).filter(function (resource) {
            return resource != null;
        })[0];
    }

    function serveResource(resource, res) {
        res.writeHead(200);
        resource.content().then(function (body) {
            res.end(body);
        });
    }

    return {
        contextPath: "/",

        mount: function (resourceSet) {
            sets.push(resourceSet);
        },

        unmount: function (resourceSet) {},

        /**
         * Handle HTTP request. Returns true if request will be handled,
         * false otherwise (i.e. there is no matching resource in the resource
         * set).
         */
        respond: function (req, res) {
            if (req.url.indexOf(this.contextPath) !== 0) { return; }
            var resource = getResource(req.url);
            if (resource) {
                serveResource(resource, res);
            } else {
                res.writeHead(404);
                res.end();
            }
            return true;
        }
    };
};

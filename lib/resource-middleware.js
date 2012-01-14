var buster = require("buster-core");
var http = require("http");
var bind = require("buster-core").bind;
var when = require("when");
var url = require("url");
var path = require("path");

/**
 * Create middleware capable of serving a resource set over HTTP
 */
exports.create = function (contextPath) {
    var sets = [], ctxRegexp;

    function getResource(path) {
        return buster.flatten(sets.map(function (rs) {
            return rs.filter(function (resource) {
                return resource.respondsTo(path);
            });
        }))[0];
    }

    function serveResource(resource, req, res) {
        res.writeHead(200, resource.headers());
        resource.content().then(bind(res, "end"));
    }

    function serveBackendResource(resource, req, res) {
        var proxy = resource.content();
        proxy.setProxyPath(contextPath);
        proxy.respond(req, res);
    }

    function setContextPath(path) {
        contextPath = path;
        ctxRegexp = new RegExp("^" + (path || "").replace(/\/?$/, ""));
    }

    function handle(reqUrl) {
        return ctxRegexp.test(reqUrl);
    }

    function pathName(reqUrl) {
        return url.parse(reqUrl).pathname.replace(ctxRegexp, "");
    }

    setContextPath(contextPath);

    return {
        setContextPath: setContextPath,

        mount: function (resourceSet) {
            sets.push(resourceSet);
        },

        unmount: function (resourceSet) {
            var index = sets.indexOf(resourceSet);
            if (index >= 0) {
                sets.splice(index, 1);
            }
        },

        /**
         * Handle HTTP request. Returns true if request will be handled,
         * false otherwise (i.e. there is no matching resource in the resource
         * set).
         */
        respond: function (req, res) {
            if (!handle(req.url)) { return; }
            var resource = getResource(pathName(req.url));
            if (resource) {
                if (resource.backend) {
                    serveBackendResource(resource, req, res);
                } else {
                    serveResource(resource, req, res);
                }
            } else {
                res.writeHead(404);
                res.end();
            }
            return true;
        }
    };
};

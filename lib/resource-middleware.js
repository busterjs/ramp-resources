var buster = require("buster-core");
var resource = require("./resource");
var http = require("http");
var bind = require("buster-core").bind;
var when = require("when");
var url = require("url");
var path = require("path");

/**
 * Create middleware capable of serving a resource set over HTTP
 */
exports.create = function (contextPath) {
    var currentSet, ctxRegexp;

    var defaultResource = resource.create("/", {
        content: "<!DOCTYPE html><html lang=\"en\"><head>" +
            "<meta charset=\"utf-8\"><title>Buster.JS</title>" +
            "</head><body></body></html>"
    });

    function getResource(path) {
        var resource = (currentSet || []).filter(function (resource) {
            return resource.respondsTo(path);
        })[0];
        return resource || (path === "/" && defaultResource);
    }

    // TODO
    // The script injection may be replaced with a more generalized
    // load path loader. This would be plugged into the middleware, and
    // would allow different implementations to do different things -
    // script tags is one, loading scripts in svg another, AMD yet
    // another.
    //
    function prepare(resource, content) {
        var paths = (currentSet && currentSet.loadPath.paths()) || [];
        if (resource.path !== "/" || paths.length === 0) { return content; }

        var resolvePaths = buster.bind(path, "join", contextPath);
        var scripts = paths.map(resolvePaths).map(function (p) {
            return "<script src=\"" + p + "\"></script>";
        }).join("");
        if (/<\/body>/.test(content)) {
            return content.replace("</body>", scripts + "</body>");
        }
        if (/<\/html>/.test(content)) {
            return content.replace("</html>", scripts + "</html>");
        }
        return content + scripts;
    }

    function ok(res, headers, content) {
        res.writeHead(200, headers);
        res.end(content);
    }

    function resourceFailed(res, err) {
        res.writeHead(500);
        var errStr = err instanceof Error ? err.stack : err.toString();
        res.end("Failed serving resource: " + errStr);
    }

    function serveResource(resource, req, res) {
        try {
            resource.content().then(function (content) {
                ok(res, resource.headers(), prepare(resource, content));
            }, function (err) {
                resourceFailed(res, err);
            });
        } catch (err) {
            resourceFailed(res, err);
        }
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
        return url.parse(reqUrl).pathname.replace(ctxRegexp, "") || "/";
    }

    setContextPath(contextPath);

    return {
        setContextPath: setContextPath,

        mount: function (resourceSet) {
            currentSet = resourceSet;
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

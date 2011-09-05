var url = require("url");
var fs = require("fs");
var http = require("http");
var resource = require("./resource");
var scriptInjectionProcessor = require("./processors/script-injector");
var proxyMiddleware = require("./http-proxy");
var busterPromise = require("buster-promise");

module.exports = {
    create: function (data, resourceMiddleware) {
        var resourceSet = Object.create(this);

        resourceSet.resourceMiddleware = resourceMiddleware;
        resourceSet.resources = {};
        resourceSet.load = data.load || [];
        resourceSet.rootResource = data.rootResource;
        resourceSet.contextPath = data.contextPath || "";

        for (var key in data.resources) {
            resourceSet.addResource(key, data.resources[key]);
        }

        resourceSet.setUpRootResource();

        return resourceSet;
    },

    addResource: function (path, data) {
        var r = resource.create(path, data, this.resourceMiddleware);
        this.resources[path] = r;

        if (path == "/") {
            if (!("Content-Type" in r.headers)) {
                r.headers["Content-Type"] = "text/html";
            }

            var p = Object.create(scriptInjectionProcessor);
            p.scripts = this.rootResourceScripts();
            r.addProcessor(p);
        }
    },

    addFile: function (path) {
        this.addResource(path, {
            content: function (promise) {
                fs.readFile(path, function (err, data) {
                    if (err) {
                        promise.reject(err);
                    } else {
                        promise.resolve(data);
                    }
                });
            }
        });
    },

    setUpRootResource: function () {
        if (!("/" in this.resources)) {
            this.assignDefaultRootResource();
        }
    },

    assignDefaultRootResource: function () {
        this.addResource("/", {
            content: "<!DOCTYPE html><html><head></head><body></body></html>"
        });
    },

    /*
     * Takes the data for a resource set. Returns a string with an error message, or
     * nothing if there was no error.
     */
    validate: function (data) {

        if (!data.hasOwnProperty("resources")) {
            return "Missing property 'resources'.";
        }

        if (!data.hasOwnProperty("load")) {
            return "Missing property 'load'.";
        }

        for (var i = 0, ii = data.load.length; i < ii; i++) {
            var resourceFound = false;
            for (var resource in data.resources) {
                if (data.load[i] == resource) resourceFound = true;
            }

            if (!resourceFound) {
                return "'load' entry '" + data.load[i] + "' missing corresponding 'resources' entry.";
            }
        }

        for (var resource in data.resources) {
            if (typeof(data.resources[resource]) == "string") continue;

            if ("content" in data.resources[resource]) {
                if (data.resources[resource].content instanceof Buffer) {
                    continue;
                }

                if (typeof(data.resources[resource].content) == "string") {
                    continue;
                } else {
                    return "The resource '" + resource + "' was not a string."
                }
            }
        }
    },

    getResource: function (requestedPath, cb) {
        var path;
        for (path in this.resources) {
            var resource = this.resources[path];
            if (this.getBackendContent(resource, requestedPath, cb)) return true;
            if (this.contextPath + path != requestedPath) continue;

            if (resource.combine && !resource.content) {
                this.combineResources(resource, cb);
                return true;
            }

            if (this.getResourceContent(resource, cb)) {
                return true;
            }
              
        }
    },

    getResourceViaHttp: function (req, res) {
        var parsed = url.parse(req.url);
        var path;

        for (path in this.resources) {
            var resource = this.resources[path];
            if (this.contextPath + path != parsed.pathname) continue;

            if (this.getResourceContent(resource, function (err, resource) {
                if (err) {
                } else {
                    res.writeHead(200, resource.headers);
                    res.write(resource.content);
                    res.end();
                }
            })) {
                return true;
            }
        }
    },

    getResourceContent: function (resource, cb) {
        var self = this;

        resource.getContent().then(function (content) {
            cb(undefined, self.getReadOnlyResourceWithContent(resource, content));
        }, function (err) {
            cb(err);
        });

        return true;
    },

    getReadOnlyResourceWithContent: function (resource, content) {
        return {
            content: content,
            headers: resource.getHeaders()
        }
    },

    getBackendContent: function (resource, requestedPath, cb) {
        var self = this;
        var urlStartsWithResourcePath = requestedPath.slice(0, resource.path.length) == resource.path;
        if (resource.backend && urlStartsWithResourcePath) {
            var parsed = url.parse(resource.backend);

            var req = http.request({
                method: "GET", path: requestedPath,
                host: parsed.hostname, port: parsed.port
            }, function (res) {
                var content = new Buffer(0);
                res.on("data", function (data) {
                    var contentLength = content.length;
                    newContent = new Buffer(contentLength + data.length);
                    content.copy(newContent, 0);
                    data.copy(newContent, contentLength);
                    content = newContent;
                });
                res.on("end", function () {
                    cb(undefined, {
                        headers: res.headers,
                        content: content
                    });
                });
            });
            req.end();
            return true;
        }
    },

    rootResourceScripts: function () {
        var scripts = [];

        for (var i = 0, ii = this.load.length; i < ii; i++) {
            scripts.push(this.contextPath + this.load[i]);
        }

        return scripts;
    },

    // TODO: fetch resources in parallell and write fancy code to make sure
    // they're concatinated in the correct order. We want parallell since
    // one or more of the resources in the list may perform HTTP requests.
    combineResources: function (resource, cb, resourcePaths, content) {
        var self = this;
        if (arguments.length == 2) {
            resourcePaths = resource.combine.slice(0);
            content = "";
        }

        if (resourcePaths.length == 0) {
            resource.content = content;
            this.getResourceContent(resource, cb);
            return;
        }

        var path = resourcePaths.shift();
        this.getResource(path, function (err, readOnlyResource) {
            if (err) {
                cb(err);
            } else {
                content += readOnlyResource.content + "\n";
                self.combineResources(resource, cb, resourcePaths, content);
            }
        });
    }
};

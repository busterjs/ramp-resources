var url = require("url");
var fs = require("fs");
var http = require("http");
var resource = require("./resource");
var scriptInjectionProcessor = require("./processors/script-injector");
var proxyMiddleware = require("./http-proxy");
var busterPromise = require("buster-promise");

module.exports = {
    create: function (data, busterResources) {
        var error = module.exports.validate(data);
        if (error) throw new Error(error);
        var resourceSet = Object.create(this);

        resourceSet.busterResources = busterResources;
        resourceSet.resources = {};
        resourceSet.load = data.load || [];
        resourceSet.rootResource = data.rootResource;
        resourceSet.contextPath = data.contextPath || "";

        for (var key in data.resources) {
            resourceSet.addResource(key, data.resources[key]);
        }

        setUpRootResource.call(resourceSet);

        return resourceSet;
    },

    addResource: function (path, data) {
        var self = this;
        var r;

        if ("etag" in data && !("content" in data)) {
            r = this.busterResources.getResourceForPathWithEtag(path, data.etag);
        } else {
            r = resource.create(path, data);
        }

        this.resources[path] = r;

        if (path == "/") {
            if (!("Content-Type" in r.headers)) {
                r.headers["Content-Type"] = "text/html";
            }

            var p = Object.create(scriptInjectionProcessor);
            p.scripts = function () { return rootResourceScripts.call(self); };
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

    prependToLoad: function (toPrepend) {
        var msg = validators.loadRequiresResourceExistence({load: toPrepend, resources: this.resources})
        if (msg) throw new Error(msg);

        this.load = toPrepend.concat(this.load);
    },

    /*
     * Takes the data for a resource set. Returns a string with an error message, or
     * nothing if there was no error.
     */
    validate: function (data) {
        for (var validator in validators) {
            var msg = validators[validator](data);
            if (msg) return msg;
        }
    },

    getResource: function (requestedPath, cb) {
        var path;
        for (path in this.resources) {
            var resource = this.resources[path];

            if (backendCanHandlePath.call(this, resource, requestedPath)) {
                getBackendContent.call(this, resource, requestedPath, cb)
                return true;
            }

            if (this.contextPath + path != requestedPath) continue;

            if (resource.combine && !resource.content) {
                combineResources.call(this, resource, cb);
                return true;
            }

            if (getResourceContent.call(this, resource, cb)) {
                return true;
            }
              
        }
    },

    getResourceViaHttp: function (req, res) {
        var requestedPath = req.url;
        var path;

        for (path in this.resources) {
            var resource = this.resources[path];

            if (backendCanHandlePath.call(this, resource, requestedPath)) {
                if (!resource.proxy) {
                    var parsed = url.parse(resource.backend);
                    resource.proxy = proxyMiddleware.create(
                        parsed.hostname, parsed.port, parsed.path
                    );
                    resource.proxy.proxyPath = this.contextPath;
                }

                resource.proxy.respond(req, res);

                return true;
            }

            if (this.contextPath + path != requestedPath) continue;

            if (resource.combine && !resource.content) {
                combineResources.call(this, resource, function (err, resource) {
                    if (err) {
                        // TODO: implement me
                    } else {
                        res.writeHead(200, resource.headers);
                        res.write(resource.content);
                        res.end();
                    }
                });
                return true;
            }

            if (getResourceContent.call(this, resource, function (err, resource) {
                if (err) {
                    // TODO: implement me
                } else {
                    res.writeHead(200, resource.headers);
                    res.write(resource.content);
                    res.end();
                }
            })) {
                return true;
            }
        }
    }
};


function rootResourceScripts() {
    var scripts = [];

    for (var i = 0, ii = this.load.length; i < ii; i++) {
        scripts.push(this.contextPath + this.load[i]);
    }

    return scripts;
};

function setUpRootResource() {
    if (!("/" in this.resources)) {
        this.addResource("/", {
            content: "<!DOCTYPE html><html><head></head><body></body></html>"
        });
    }
};

function getReadOnlyResourceWithContent(resource, content) {
    return {
        content: content,
        headers: resource.getHeaders()
    }
};

function getResourceContent(resource, cb) {
    var self = this;

    resource.getContent().then(function (content) {
        cb(undefined, getReadOnlyResourceWithContent.call(self, resource, content));
    }, function (err) {
        cb(err);
    });

    return true;
};

function backendCanHandlePath(resource, requestedPath) {
    return resource.backend
        && requestedPath.slice(0, resource.path.length) == resource.path;
};

function getBackendContent(resource, requestedPath, cb) {
    var self = this;
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
};

// TODO: fetch resources in parallel and write fancy code to make sure
// they're concatinated in the correct order. We want parallel since
// one or more of the resources in the list may perform HTTP requests.
function combineResources(resource, cb, resourcePaths, content) {
    var self = this;
    if (arguments.length == 2) {
        resourcePaths = resource.combine.slice(0);
        content = "";
    }

    if (resourcePaths.length == 0) {
        resource.content = content;
        getResourceContent.call(this, resource, cb);
        return;
    }

    var path = resourcePaths.shift();
    this.getResource(path, function (err, readOnlyResource) {
        if (err) {
            cb(err);
        } else {
            content += readOnlyResource.content + "\n";
            combineResources.call(self, resource, cb, resourcePaths, content);
        }
    });
};

var validators = {
    resourceIsTruthy: function (data) {
        if (!data) return "Resource object is null or undefined.";
    },

    loadRequiresResourceExistence: function (data) {
        if (!("load" in data)) return;

        for (var i = 0, ii = data.load.length; i < ii; i++) {
            var resourceFound = false;
            for (var resource in data.resources) {
                if (data.load[i] == resource) resourceFound = true;
            }

            if (!resourceFound) {
                return "'load' entry '" + data.load[i] + "' missing corresponding 'resources' entry.";
            }
        }
    },

    resources: function (data) {
        if (!("resources" in data)) return;

        for (var path in data.resources) {
            var resource = data.resources[path];
            if (resource.content == null && !resource.backend &&
                !resource.combine && !resource.etag) {
                return "Received no resource etag, content, backend or combine";
            }

            if ("content" in resource && resource.backend ||
                "content" in resource && resource.combine ||
                resource.backend && resource.combine) {
                return "Can only have one of content, combine and backend";
            }

            if (resource.backend && !url.parse(resource.backend).host) {
                return "Proxy resource backend is invalid";
            }

            if (/^\./.test(path)) {
                return "Path can not be relative";
            }

            if ("content" in resource) {
                if (resource.content instanceof Buffer) {
                    continue;
                }

                if (typeof(resource.content) == "string") {
                    continue;
                } else {
                    return "The resource '" + path + "' was not a string."
                }
            }
        }
    }
}
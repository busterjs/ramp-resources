var url = require("url");
var fs = require("fs");
var http = require("http");
var resource = require("./resource");
var scriptInjectionProcessor = require("./processors/script-injector");
var proxyMiddleware = require("./http-proxy");
var busterPromise = require("buster-promise");

var isArray = function (arr) {
    return Object.prototype.toString.call(arr) == "[object Array]";
}

module.exports = {
    RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
    DEFAULT_ROOT_RESOURCE: "<!DOCTYPE html><html><head></head><body></body></html>",

    create: function (data) {
        data = data || {};
        var error = module.exports.validate(data);
        if (error) throw new Error(error);
        var resourceSet = Object.create(this);

        resourceSet.resources = {};
        resourceSet.load = data.load || [];
        resourceSet.contextPath = data.contextPath || "";

        for (var key in data.resources) {
            resourceSet.addResource(key, data.resources[key]);
        }

        return resourceSet;
    },

    addResource: function (path, data) {
        var r = resource.create(path, data);
        this.resources[path] = r;

        if (path == "/") {
            if (!("Content-Type" in r.headers)) {
                r.headers["Content-Type"] = "text/html";
            }
        }

        return r;
    },

    addFile: function (path, options) {
        options = options || {};

        var resourceName = options.path || path;
        delete options.path;

        options.content = function (promise) {
            fs.readFile(path, function (err, data) {
                if (err) {
                    promise.reject(err);
                } else {
                    promise.resolve(data);
                }
            });
        };

        return this.addResource(resourceName, options);
    },

    removeResource: function (path) {
        if (!(path in this.resources)) {
            throw new Error("Cannot remove none existing resource '" + path + "'.");
        }

        delete this.resources[path];

        for (var i = 0, ii = this.load.length; i < ii; i++) {
            if (this.load[i] == path) {
                this.load.splice(i, 1);
                break;
            }
        }
    },

    appendToLoad: function (resourcePaths) {
        var toAppend = ensureArrayOfExistingResources(resourcePaths, this.resources);
        var existing = findFirstDuplicateLoadEntry(toAppend, this.load);

        if (existing) {
            throw new Error("Can not append '" + existing +
                            "', already exists in 'load'.")
        }

        this.load = this.load.concat(toAppend);
    },

    prependToLoad: function (resourcePaths) {
        var toPrepend = ensureArrayOfExistingResources(resourcePaths, this.resources);
        var existing = findFirstDuplicateLoadEntry(toPrepend, this.load);

        if (existing) {
            throw new Error("Can not prepend '" + existing +
                            "', already exists in 'load'.")
        }

        this.load = toPrepend.concat(this.load);
    },

    /*
     * Takes the data for a resource set, or a full resource set. Returns a
     * string with an error msg or nothing if there was no error.
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

            if (this.getResourceContent(resource, null, cb)) {
                return true;
            }

        }

        cb(this.RESOURCE_NOT_FOUND);
        return false;
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
                        res.writeHead(500);
                        res.write(JSON.stringify(err));
                        res.end();
                    } else {
                        res.writeHead(200, resource.headers);
                        res.write(resource.content);
                        res.end();
                    }
                });
                return true;
            }

            if (this.getResourceContent(resource, req, function (err, resource) {
                if (err) {
                    res.writeHead(500);
                    res.write(JSON.stringify(err));
                    res.end();
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

    getResourceContent: function (resource, req, cb) {
        var self = this;

        if ("etag" in resource && !("content" in resource)) return false;

        resource.getContent(req).then(function (content) {
            cb(undefined, getReadOnlyResourceWithContent.call(self, resource, content));
        }, function (err) {
            cb(err);
        });

        return true;
    },

    getReadOnly: function (cb) {
        var result = {load:[],resources:{}};

        for (var i = 0, ii = this.load.length; i < ii; i++) {
            result.load.push(this.load[i] + "");
        }

        var promises = [];
        for (var path in this.resources) {
            (function (resource, path) {
                var promise = busterPromise.create();
                promises.push(promise);

                resource.getContent().then(function (content) {
                    var roResource = getReadOnlyResourceWithContent(resource, content);
                    if (roResource.content instanceof Buffer) {
                        roResource.content = roResource.content.toString("base64");
                        roResource.base64Encoded = true;
                    }
                    promise.resolve(path, roResource);
                }, function (err) {
                    promise.reject(err);
                })
            }(this.resources[path], path));
        }

        busterPromise.all(promises).then(function () {
            for (var i = 0, ii = arguments.length; i < ii; i++) {
                result.resources[arguments[i][0]] = arguments[i][1];
            }

            cb(undefined, result);
        }, function (err) {
            cb(err);
        });
    },

    createDefaultRootResourceIfNotExists: function() {
        if (!("/" in this.resources)) {
            this.addResource("/", {
                content: this.DEFAULT_ROOT_RESOURCE
            });
        }
    },

    addScriptLoadingToRootResource: function () {
        var self = this;
        var p = Object.create(scriptInjectionProcessor);
        p.scripts = function () { return rootResourceScripts.call(self); };
        this.resources["/"].addProcessor(p);
    }
};


function rootResourceScripts() {
    var scripts = [];

    for (var i = 0, ii = this.load.length; i < ii; i++) {
        scripts.push(this.contextPath + this.load[i]);
    }

    return scripts;
};

function getReadOnlyResourceWithContent(resource, content) {
    var result = {};

    if (content !== undefined) result.content = content;
    if ("etag" in resource) result.etag = resource.etag;
    if ("backend" in resource) result.backend = resource.backend;
    if ("combine" in resource) result.combine = resource.combine;

    result.headers = resource.getHeaders();

    return result;
};

function backendCanHandlePath(resource, requestedPath) {
    var relativePath = requestedPath.slice(this.contextPath.length);

    return resource.backend
        && relativePath.slice(0, resource.path.length) == resource.path;
};

function getBackendContent(resource, requestedPath, cb) {
    var self = this;
    var parsed = url.parse(resource.backend);
    var relativePath = requestedPath.slice(this.contextPath.length);

    var req = http.request({
        method: "GET", path: relativePath,
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
        this.getResourceContent(resource, null, cb);
        return;
    }

    var path = resourcePaths.shift();
    this.getResource(this.contextPath + path, function (err, readOnlyResource) {
        if (err) {
            cb(err);
        } else {
            content += readOnlyResource.content + "\n";
            combineResources.call(self, resource, cb, resourcePaths, content);
        }
    });
};

function ensureArrayOfExistingResources(resourcePaths, resources) {
    var loadPaths = isArray(resourcePaths) ? resourcePaths : [resourcePaths];

    var msg = validators.loadRequiresResourceExistence({
        load: loadPaths,
        resources: resources
    });

    if (msg) throw new Error(msg);
    return loadPaths;
}

function findFirstDuplicateLoadEntry(newEntries, load) {
    for (var i = 0, ii = load.length; i < ii; i++) {
        for (var j = 0, jj = newEntries.length; j < jj; j++) {
            if (load[i] == newEntries[j]) {
                return newEntries[j];
            }
        }
    }
}

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
            var msg = resource.validate(data.resources[path], path);
            if (msg) return msg;
        }
    }
}
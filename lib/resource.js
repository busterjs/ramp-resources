var url = require("url");
var mime = require("mime");
var busterPromise = require("buster-promise");
var minifyProcessor = require("./processors/minifier");

module.exports = {
    create: function (path, resource) {
        var instance = Object.create(this);
        instance.path = path;

        if (("content" in resource)) {
            if (resource.base64Encoded == true) {
                instance.content = new Buffer(resource.content, "base64");
            } else {
                instance.content = resource.content;
            }
        }
        instance.headers = resource.headers || {};
        if ("combine" in resource) {
            instance.combine = resource.combine;
        }
        if ("backend" in resource) {
            instance.backend = resource.backend;
        }
        if ("etag" in resource) {
            instance.etag = resource.etag;
        }

        instance.timestamp = new Date().getTime();
        instance.processors = [];

        if (resource.minify) {
            instance.processors.push(Object.create(minifyProcessor));
        }

        return instance;
    },

    validate: function (resource, path) {

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
            if (resource.content instanceof Buffer) return;
            if (typeof(resource.content) == "string") return;
            return "The resource '" + path + "' was not a string."
        }
    },

    getHeaders: function () {
        var headers = {};

        for (var header in this.headers) {
            headers[header] = this.headers[header];
        }

        if (!headers["Content-Type"]) {
            headers["Content-Type"] = mime.lookup(this.path);
        }

        return headers;
    },

    getContent: function (req) {
        var self = this;
        var promise = busterPromise.create();

        if (typeof(this.content) == "function") {
            var cPromise = busterPromise.create();
            this.content(cPromise, req);
            cPromise.then(function (content) {
                promise.resolve(self.applyFilters(content));
            }, function (err) {
                promise.reject(err);
            });
        } else {
            promise.resolve(this.applyFilters(this.content));
        }

        return promise;
    },

    applyFilters: function (content) {
        for (var i = 0, ii = this.processors.length; i < ii; i++) {
            content = this.processors[i].process(content);
        }

        return content;
    },

    addProcessor: function (processor) {
        this.processors.push(processor);
    }
};
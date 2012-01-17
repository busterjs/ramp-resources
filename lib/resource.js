var buster = require("buster-core");
var mime = require("mime");
var httpProxy = require("./http-proxy");
var url = require("url");
var invalid = require("./invalid-error");
var when = require("when");

function isText(mimeType) {
    return (/text|html|javascript/).test(mimeType);
}

function contentType(mimeType, encoding) {
    return mimeType + (isText(mimeType) ? "; charset=" + encoding : "");
}
function processedStringContent(rs, content) {
    return rs.process(content.toString(rs.encoding));
}

function processedFunctionContent(rs, fn) {
    var d = when.defer();
    when(fn.call(rs)).then(function (content) {
        d.resolver.resolve(processedStringContent(rs, content));
    }, buster.bind(d.resolver, "reject"));
    return d.promise;
}

function parseUrl(backend) {
    return url.parse(backend.replace(/^(?:http:\/\/)?/, "http://"));
}

function backendProxy(url) {
    var p = parseUrl(url);
    return httpProxy.create(p.hostname, p.port || 80, p.pathname);
}

/**
 * Create a new resource. Note that some properties can only be
 * set when creating resources through a resource set. See resourceSet
 * docs for information.
 *
 * Accepted properties:
 * - etag      Custom etag for resource (used for caching)
 * - headers   Object with headers
 * - encoding  Encoding of content, default utf-8
 * - content   Content as a string or buffer
 * - backend   A URL to a backend proxy that handles requests to
 *             {backend}/path/
 *
 * Only one of content and backend can be used in any given resource.
 */
exports.create = function (path, rs) {
    var err = exports.validate(rs);
    if (err) { throw err; }
    path = exports.normalizePath(path);
    var content = rs.content;
    var processors = [];
    var resourceHeaders = rs.headers;
    var resource;

    /**
     * Returns true if resource path has a file extension
     */
    function hasExtension() {
        return path.split("/").pop().indexOf(".") >= 0;
    }

    /**
     * Returns the mime type. Mime type is deferred from the path if
     * the path has a file extension. Otherwise, it defaults to text/html
     */
    function mimeType() {
        return hasExtension() ? mime.lookup(path) : "text/html";
    }

    function defaultEncoding() {
        return isText(mimeType()) ? "utf-8" : "base64";
    }

    function serialized(content) {
        var data = {content: content, path: path, encoding: resource.encoding};
        if (resource.etag) { data.etag = resource.etag; }
        if (resourceHeaders) { data.headers = resourceHeaders; }
        return data;
    }

    resource = {
        path: path,
        combine: rs.combine,
        etag: rs.etag,
        backend: rs.backend,
        encoding: rs.encoding || defaultEncoding(),

        /**
         * Get headers to serve resource with. Always returns an object,
         * even if empty. Content resources always have a default
         * Content-Type header, that can be overridden through the
         * headers object when creating the resource.
         */
        headers: function () {
            var headers = {};
            if (content) {
                var type = contentType(mimeType(), this.encoding);
                headers["Content-Type"] = type;
            }
            if (this.etag) {
                headers.ETag = this.etag;
            }
            return buster.extend(headers, resourceHeaders);
        },

        /**
         * Returns the value of the single named header.
         */
        header: function (header) {
            return this.headers()[header];
        },

        mimeType: mimeType,

        /**
         * Get resource contents. Returns a prmise if resource has 'content',
         * or an http proxy object if the resource has a backend.
         * Buffer contents will be converted to a string using the provided
         * encoding, utf-8 by default.
         */
        content: function () {
            if (typeof content === "function") {
                return processedFunctionContent(this, content);
            }
            if (!this.backend) {
                return when(processedStringContent(this, content));
            }
            return backendProxy(this.backend);
        },

        /**
         * Add resource processor
         */
        addProcessor: function (processor) {
            processors.push(processor);
            return this;
        },

        /**
         * Runs all processors on resource content.
         */
        process: function (content) {
            var resource = this;
            return processors.reduce(function (c, processor) {
                return processor(resource, c);
            }, content);
        },

        /**
         * Returns true if resource exists at path. For most resources,
         * this is a check of normalizedPath(path) === path, but for e.g.
         * proxy resources, this may be true for a whole range of paths.
         */
        respondsTo: function (reqPath) {
            var pattern = new RegExp("^" + path + (content ? "$" : ""));
            return pattern.test(exports.normalizePath(reqPath));
        },

        serialize: function () {
            if (this.backend) {
                return when({ path: this.path, backend: this.backend });
            }
            var d = when.defer();
            this.content().then(function (content) {
                d.resolver.resolve(serialized(content));
            });
            return d.promise;
        }
    };

    return resource;
};

exports.normalizePath = function (path) {
    return path.replace(/\/?$/, "").replace(/^\/?/, "/");
};

exports.isResource = function (resource) {
    return typeof resource.addProcessor === "function";
};

/**
 * Validates the combination of properties for a resource. Returns
 * an error object with the first error if any. Otherwise, returns
 * falsy.
 */
exports.validate = function (resource) {
    resource = resource || {};
    if (!resource.content && !resource.backend && !resource.etag) {
        return invalid("No content: Resource must have " +
                       "content, etag or backend");
    }
    if (resource.content && resource.backend) {
        return invalid("Resource cannot have both content and backend");
    }
    if (!resource.backend) { return; }
    if (resource.encoding) {
        return invalid("Proxy resource cannot have hard-coded encoding");
    }
    var parsed = parseUrl(resource.backend);
    if (!parsed.hostname) {
        return invalid("Invalid proxy backend '" + resource.backend + "'");
    }
};

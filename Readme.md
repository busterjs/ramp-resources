#ramp-resources

[![Build status](https://secure.travis-ci.org/busterjs/ramp-resources.png?branch=master)](http://travis-ci.org/busterjs/ramp-resources)

Files, proxies and inline "virtual files" over the air

**ramp-resources** is a "virtual file system" used to represent file sets on the
client and on the server in Buster.JS test runs.


## Changelog

**1.0.5** (08.08.2014)

* fix for issue [#347 - Failed creating session: EMFILE, open 'some/file/path.js'](https://github.com/busterjs/buster/issues/347)

**1.0.4** (12.05.2014)

* `resource-middleware.js->prepare` exported for `buster-static`

**1.0.3** (30.04.2014)

* feature [#397 - glob file excludes should work in buster config resources option](https://github.com/busterjs/buster/issues/397)

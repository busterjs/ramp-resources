#ramp-resources

[![Build status](https://secure.travis-ci.org/busterjs/ramp-resources.png?branch=master)](http://travis-ci.org/busterjs/ramp-resources)

Files, proxies and inline "virtual files" over the air

**ramp-resources** is a "virtual file system" used to represent file sets on the
client and on the server in Buster.JS test runs.


## Changelog

**2.0.2** (2015-Nov-26)

* Wait for all resources to be added fully before completing concat()

**2.0.1** (2015-Nov-26)

* BREAKING: upgraded to `when@3` from `when@1` - promises are now Common/A+ compliant and no longer release Zalgo
* BREAKING: node support: min 4.2 LTS (Argon) required
* BREAKING: concat() now returns a promise
* License field in package.json

**1.0.5** (2014-Aug-08)

* fix for issue [#347 - Failed creating session: EMFILE, open 'some/file/path.js'](https://github.com/busterjs/buster/issues/347)

**1.0.4** (2014-May-12)

* `resource-middleware.js->prepare` exported for `buster-static`

**1.0.3** (2014-Apr-30)

* feature [#397 - glob file excludes should work in buster config resources option](https://github.com/busterjs/buster/issues/397)

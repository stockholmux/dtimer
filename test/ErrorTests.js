'use strict';

var DTimer = require('..').DTimer;
var redis = require("redis");
var async = require('async');
var assert = require('assert');
var sinon = require('sinon');

describe('Error tests', function () {
    var pub = null;
    var sub = null;
    var dt  = null;
    var sandbox;

    before(function () {
        sandbox = sinon.sandbox.create();
    });

    beforeEach(function (done) {
        var conns = 0;
        pub = redis.createClient();
        pub.once('ready', function () { conns++; });
        sub = redis.createClient();
        sub.once('ready', function () { conns++; });
        async.whilst(
            function () { return (conns < 2); },
            function (next) {
                setTimeout(next, 100);
            },
            function (err) {
                if (err) {
                    return void(done(err));
                }
                async.series([
                    function (next) {
                        pub.select(9, next);
                    },
                    function (next) {
                        pub.flushdb(next);
                    }
                ], function (err) {
                    if (err) { return void(done(err)); }
                    dt = new DTimer('ch1', pub, sub);
                    done();
                });
            }
        );
    });

    afterEach(function () {
        dt.removeAllListeners();
        dt = null;
        pub.removeAllListeners();
        pub.end();
        pub = null;
        sub.removeAllListeners();
        sub.end();
        sub = null;
        sandbox.restore();
    });

    it('#join', function (done) {
        sandbox.stub(pub, 'time', function (cb) {
            cb(new Error('fail error'));
        });

        dt.join(function (err) {
            assert.ok(err);
            done();
        });
    });

    it('#leave', function (done) {
        sandbox.stub(pub, 'time', function (cb) {
            cb(new Error('fail error'));
        });

        dt.leave(function (err) {
            assert.ok(err);
            done();
        });
    });

    it('#post', function (done) {
        sandbox.stub(pub, 'time', function (cb) {
            cb(new Error('fail error'));
        });

        dt.post({}, 100, function (err) {
            assert.ok(err);
            done();
        });
    });

    it('#cancel', function (done) {
        sandbox.stub(pub, 'time', function (cb) {
            cb(new Error('fail error'));
        });

        dt.cancel(3, function (err) {
            assert.ok(err);
            done();
        });
    });

    it('#_onTimeout', function (done) {
        sandbox.stub(pub, 'time', function (cb) {
            cb(new Error('fail error'));
        });
        dt.on('error', function (err) {
            done();
        });
        dt._onTimeout();
    });

    it('#join - multi error', function (done) {
        sandbox.stub(pub, 'multi', function () {
            var m = {
                lrem:   function() { return this; },
                lpush:  function() { return this; },
                zadd:   function() { return this; },
                zrem:   function() { return this; },
                hset:   function() { return this; },
                hdel:   function() { return this; },
                evalsha:function() { return this; },
                exec: function(cb) {
                    process.nextTick(function () {
                        cb(new Error('fake err'));
                    });
                },
            };
            return m;
        });

        dt.join(function (err) {
            assert.ok(err);
            done();
        });
    });

    it('#post - hincrby error', function (done) {
        sandbox.stub(pub, 'hincrby', function (key, field, by, cb) {
            cb(new Error('fake error'));
        });

        dt.post({}, 200, function (err) {
            assert.ok(err);
            done();
        });
    });

    it('#post - multi error', function (done) {
        sandbox.stub(pub, 'multi', function () {
            var m = {
                lrem:   function() { return this; },
                lpush:  function() { return this; },
                zadd:   function() { return this; },
                zrem:   function() { return this; },
                hset:   function() { return this; },
                hdel:   function() { return this; },
                evalsha:function() { return this; },
                exec: function(cb) {
                    process.nextTick(function () {
                        cb(new Error('fake err'));
                    });
                },
            };
            return m;
        });

        dt.post({}, 200, function (err) {
            assert.ok(err);
            done();
        });
    });

    it('#_onTimeout - evalsha error', function (done) {
        sandbox.stub(global, 'setTimeout', function (fn, interval) {
            assert(typeof fn === 'function');
            assert.equal(interval, 3000);
            done();
        });
        sandbox.stub(pub, 'evalsha', function () {
            var cb = arguments[9];
            cb(new Error('fail error'));
        });

        dt._onTimeout();
    });

    it('#_onTimeout - evalsha error (2)', function (done) {
        sandbox.stub(global, 'setTimeout', function (fn, interval) {
            assert(typeof fn === 'function');
            assert.equal(interval, 1234);
            done();
        });
        sandbox.stub(pub, 'evalsha', function () {
            var cb = arguments[9];
            cb(null, [ ['{bad]'], 1234]);
        });

        dt._onTimeout();
    });
});

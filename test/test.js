var should = require("should");
var blpopPool = require("../index").RedisBlpopPool;
var redis = require("fakeredis").createClient();
var sinon = require("sinon");
require('should-sinon');

describe("Testing pool", function(){
    it("Should throw exception while creating without redis connection", function(){
        (function(){new blpopPool()}).should.throw();
    });

    it("Should create pool with default options", function(){
        var pool = new blpopPool(redis);

        (pool._options).should.have.properties(["maxClients", "clientOptions"]);
        (pool._options.clientOptions).should.have.properties(["maxKeys", "timeout"]);
    });

    it("Should create new client when key is registered", function(){
        var pool = new blpopPool(redis);

        (pool._clients).should.be.empty();

        pool.registerKey("test", function(err, msg){});

        (pool._clients).should.not.be.empty();
    });

    it ("Should create new client when one client's keys spaces are out", function(){
        var pool = new blpopPool(redis, {
            maxClients: 0,
            clientOptions: {
                maxKeys: 2
            }
        });

        pool.registerKey("test:1", function(err, msg){});
        (pool._clients.length).should.equal(1);
        pool.registerKey("test:2", function(err, msg){});
        (pool._clients.length).should.equal(1);

        pool.registerKey("test:3", function(err, msg){});
        (pool._clients.length).should.equal(2);
    });

    it ("Should throw error when maximum clients reached", function(){
        var pool = new blpopPool(redis, {
            maxClients: 2,
            clientOptions: {
                maxKeys: 2
            }
        });

        for (var i=0;i<4;i++){
            pool.registerKey("test:" + i, function(err, msg){});
        }

        (function(){ pool.registerKey("test:5", function(err, msg){}) }).should.throw();
    });

    it ("Should remove key from client", function(err, msg){
        var pool = new blpopPool(redis);

        pool.registerKey("test:1", function(err, msg){});
        pool.registerKey("test:2", function(err, msg){});

        (pool._clients[0]._keys.length).should.equal(2);
        (pool._clients[0]._callbacks.length).should.equal(2);

        pool.removeKey("test:1");

        (pool._clients[0]._keys.length).should.equal(1);
        (pool._clients[0]._callbacks.length).should.equal(1);
    });

    it ("Should add key to client with empty spaces", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 2
            }
        });

        // Create 3 clients each with 2 keys
        for (var i=0;i<6;i++){
            pool.registerKey("test:" + i, function(err, msg){});
        }

        (pool._clients.length).should.equal(3);

        (pool._clients[0]._keys.length).should.equal(2);
        (pool._clients[1]._keys.length).should.equal(2);
        (pool._clients[2]._keys.length).should.equal(2);

        // remove one key from the middle client
        pool.removeKey("test:2");

        (pool._clients[1]._keys.length).should.equal(1);

        // Add key to the pool
        pool.registerKey("test:99", function(err, msg){});

        (pool._clients.length).should.equal(3);

        (pool._clients[0]._keys.length).should.equal(2);
        (pool._clients[1]._keys.length).should.equal(2);
        (pool._clients[2]._keys.length).should.equal(2);
    });

    // Todo Handle duplicate keys?
});

describe("Testing pool client", function(){
    it("Should add key and callback if space available", function(){
        var pool = new blpopPool(redis);
        var client = pool.createClient();

        (client._keys.length).should.equal(0);
        (client._callbacks.length).should.equal(0);

        client.addKey("test", function(err, msg){});

        (client._keys.length).should.equal(1);
        (client._callbacks.length).should.equal(1);
    });

    it("Should not add key and callback if out of space", function(){
        var pool = new blpopPool(redis);
        var client = pool.createClient({maxKeys: 2});

        (client._keys.length).should.equal(0);
        (client._callbacks.length).should.equal(0);

        for (var i=0;i<3;i++){
            client.addKey("test:" + i, function(err, msg){});
        }

        (client._keys.length).should.equal(2);
        (client._callbacks.length).should.equal(2);
    });

    it ("Should remove key", function(){
        var pool = new blpopPool(redis);
        var client = pool.createClient();

        client.addKey("test", function(err, msg){});

        (client._keys.length).should.equal(1);
        (client._callbacks.length).should.equal(1);

        client.removeKey("test");

        (client._keys.length).should.equal(0);
        (client._callbacks.length).should.equal(0);
    });

    it ("Should rotate keys and callbacks - first to last", function(){
        var pool = new blpopPool(redis);
        var client = pool.createClient();

        var keys = [];
        var callbacks = [];

        for (var i=0;i<3;i++){
            callbacks.push(function(err, msg){console.log(i)});
            keys.push("test:" + i);

            client.addKey(keys[i], callbacks[i]);
        }

        (client._keys[0]).should.equal(keys[0]);
        (client._callbacks[0]).should.equal(callbacks[0]);

        client.rotateKeys();

        (client._keys[0]).should.equal(keys[1]);
        (client._callbacks[0]).should.equal(callbacks[1]);

        (client._keys[2]).should.equal(keys[0]);
        (client._callbacks[2]).should.equal(callbacks[0]);
    });

    it ("Should rotate keys and callbacks - any position to last", function(){
        var pool = new blpopPool(redis);
        var client = pool.createClient();

        var keys = [];
        var callbacks = [];

        for (var i=0;i<3;i++){
            callbacks.push(function(err, msg){console.log(i)});
            keys.push("test:" + i);

            client.addKey(keys[i], callbacks[i]);
        }

        (client._keys[0]).should.equal(keys[0]);
        (client._callbacks[0]).should.equal(callbacks[0]);

        client.rotateKeys(1);

        (client._keys[0]).should.equal(keys[0]);
        (client._callbacks[0]).should.equal(callbacks[0]);

        (client._keys[1]).should.equal(keys[2]);
        (client._callbacks[1]).should.equal(callbacks[2]);

        (client._keys[2]).should.equal(keys[1]);
        (client._callbacks[2]).should.equal(callbacks[1]);
    });

    it ("Should call right callback on receiving message", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        for (var i=0;i<4;i++){
            pool.registerKey("test:" + i, function(err, msg){});
        }

        var callback = sinon.spy();

        pool.registerKey("test:99", callback);

        pool._clients[0].rotateKeys();
        pool._clients[0].rotateKeys();
        pool._clients[0].rotateKeys();

        redis.lpush("test:99");

        setTimeout(function(){
            callback.should.be.calledOnce();
        }, 1500);
    });

    it ("Should rotate key that received message at the end of the queue", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        for (var i=0;i<5;i++){
            pool.registerKey("test:" + i, function(err, msg){});
        }

        redis.lpush("test:3", "a");

        setTimeout(function(){
            should(pool._clients[0]._keys[pool._clients[0]._keys.length-1]).equal("test:3");
        }, 100);
    });

    it ("Should rotate keys correctly on timing out", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        for (var i=0;i<5;i++){
            pool.registerKey("test:" + i, function(err, msg){});
        }

        setTimeout(function(){
            should(pool._clients[0]._keys[pool._clients[0]._keys.length-1]).equal("test:0");
        }, 1500);
    });

    it ("Should listen to all keys after timeout/new message", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 2
            }
        });

        var callback = sinon.spy();

        pool.registerKey("test:1", function(err, msg){});

        pool.registerKey("test:2", callback);

        redis.lpush("test:2", "a");

        callback.should.not.be.called();

        setTimeout(function(){
            callback.should.be.calledOnce();
        }, 2500);
    });

    it ("Should restart blpop after receiving message", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        var callback1 = sinon.spy();
        var callback2 = sinon.spy();

        pool.registerKey("test:1", callback1);
        pool.registerKey("test:2", callback2);

        redis.lpush("test:1", "a");
        redis.lpush("test:2", "b");

        setTimeout(function(){
            callback1.should.be.calledOnce();
            callback2.should.be.calledOnce();
        },2500);
    });

    it ("Should restart blpop after timing out", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        var callback1 = sinon.spy();

        pool.registerKey("test:1", callback1);

        setTimeout(function(){
            callback1.should.not.be.called();

            redis.lpush("test:1", "a");

            setTimeout(function(){
                callback1.should.be.calledOnce();
            }, 100);
        },1500);
    });

    it ("Should increment message count on receiving message", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        pool.registerKey("test:1", function(err, msg){});

        (pool._clients[0].messageCount).should.equal(0);

        redis.lpush("test:1", "a");

        setTimeout(function(){
            (pool._clients[0].messageCount).should.equal(1);
        },1500);
    });

    it ("Should not increment message count on timing out", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        pool.registerKey("test:1", function(err, msg){});

        (pool._clients[0].messageCount).should.equal(0);

        setTimeout(function(){
            (pool._clients[0].messageCount).should.equal(0);
        },1500);
    });

    // @todo finish testcase
    it ("Should log warning when receiving message for unknown key", function(){});

    // @todo finish testcase
    it ("Should throw error if received redis error and have no callback", function(){});
});
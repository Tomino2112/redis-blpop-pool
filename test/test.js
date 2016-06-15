var should = require("should");
var blpopPool = require("../index").RedisBlpopPool;
var sinon = require("sinon");
var Redis = require("ioredis");
require("should-sinon");

// @todo Using real redis, because fakeredis cannot handle it
var redis = new Redis({
    port: 6379,
    host: "127.0.0.1"
});

function random(min, max){
    return Math.floor(Math.random() * (max - min)) + min;
}

function randomKey(){
    return "test:" + random(0,100) + ":" + new Date().getTime().toString().substr(-4) + ":" + random(0,100);
}

describe("Testing pool", function(){
    beforeEach(function(done){
        redis.flushdb(function(){
            done();
        })
    });

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

        pool.registerKey(randomKey(), function(err, msg){});
        (pool._clients.length).should.equal(1);
        pool.registerKey(randomKey(), function(err, msg){});
        (pool._clients.length).should.equal(1);

        pool.registerKey(randomKey(), function(err, msg){});
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
            pool.registerKey(randomKey(), function(err, msg){});
        }

        (function(){ pool.registerKey(randomKey(), function(err, msg){}) }).should.throw();
    });

    it ("Should remove key from client", function(){
        var pool = new blpopPool(redis);

        var key = randomKey();

        pool.registerKey(randomKey(), function(err, msg){});
        pool.registerKey(key, function(err, msg){});

        (pool._clients[0]._keys.length).should.equal(2);
        (pool._clients[0]._callbacks.length).should.equal(2);

        pool.removeKey(key);

        (pool._clients[0]._keys.length).should.equal(1);
        (pool._clients[0]._callbacks.length).should.equal(1);
    });

    it ("Should add key to client with empty spaces", function(){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 2
            }
        });

        var key = randomKey();

        // Create 3 clients each with 2 keys
        for (var i=0;i<5;i++){
            pool.registerKey(randomKey(), function(err, msg){});
            // Add key in the middle (...)
            if (i === 2){
                pool.registerKey(key, function(err, msg){});
            }
        }

        (pool._clients.length).should.equal(3);

        (pool._clients[0]._keys.length).should.equal(2);
        (pool._clients[1]._keys.length).should.equal(2);
        (pool._clients[2]._keys.length).should.equal(2);

        // remove one key from the client
        pool.removeKey(key);

        (pool._clients[1]._keys.length).should.equal(1);

        // Add key to the pool
        pool.registerKey(randomKey(), function(err, msg){});

        (pool._clients.length).should.equal(3);

        (pool._clients[0]._keys.length).should.equal(2);
        (pool._clients[1]._keys.length).should.equal(2);
        (pool._clients[2]._keys.length).should.equal(2);
    });

    // Todo Handle duplicate keys?
});

describe("Testing pool client", function(){
    beforeEach(function(done){
        redis.flushdb(function(){
            done();
        })
    });

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
            client.addKey(randomKey(), function(err, msg){});
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
            callbacks.push(function(err, msg){return i;});
            keys.push(randomKey());

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
            callbacks.push(function(err, msg){return i});
            keys.push(randomKey());

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

    it ("Should call right callback on receiving message", function(done){
        this.timeout(3000);

        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        for (var i=0;i<4;i++){
            pool.registerKey(randomKey(), function(err, msg){});
        }

        var callback = sinon.spy();
        var key = randomKey();

        pool.registerKey(key, callback);

        pool._clients[0].rotateKeys();
        pool._clients[0].rotateKeys();

        setTimeout(function(){
            redis.lpush(key, "a");

            setTimeout(function(){
                callback.should.be.calledOnce();
                done();
            }, 100);
        }, 2000);
    });

    it ("Should do key rotation on blpop callback", function(done){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        var key = randomKey();

        pool.registerKey(key, function(err, msg){});

        setTimeout(function(){
            pool._clients[0].rotateKeys = sinon.spy();
            redis.lpush(key, "a");

            setTimeout(function () {
                pool._clients[0].rotateKeys.should.be.calledOnce();
                done();
            }, 500);
        },500);
    });

    it ("Should rotate key that received message at the end of the queue", function(done){
        this.timeout(3000);

        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        var key = randomKey();

        for (var i=0;i<5;i++){
            pool.registerKey(randomKey(), function(err, msg){});

            if (i === 2){
                pool.registerKey(key, function(err, msg){});
            }
        }

        setTimeout(function(){
            redis.lpush(key, "a");

            setTimeout(function(){
                should(pool._clients[0]._keys[pool._clients[0]._keys.length-1]).equal(key);
                done();
            }, 100);
        }, 2000);
    });

    it ("Should rotate keys correctly on timing out", function(done){
        this.timeout(3000);

        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        var key = randomKey();

        pool.registerKey(key, function(err, msg){});

        for (var i=0;i<5;i++){
            pool.registerKey(randomKey(), function(err, msg){});
        }

        setTimeout(function(){
            should(pool._clients[0]._keys[pool._clients[0]._keys.length-1]).equal(key);
            done();
        }, 2000);
    });

    it ("Should listen to all keys after timeout/new message", function(done){
        this.timeout(3000);

        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        var callback = sinon.spy();
        var key = randomKey();

        pool.registerKey(randomKey(), function(err, msg){});
        pool.registerKey(key, callback);

        callback.should.not.be.called();

        setTimeout(function(){
            redis.lpush(key, "a");

            setTimeout(function(){
                callback.should.be.calledOnce();
                done();
            }, 100);
        }, 2000);
    });

    it ("Should restart blpop after receiving message", function(done){
        this.timeout(3000);

        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        pool.registerKey(randomKey(), function(err, msg){});

        pool._clients[0].startBlpop = sinon.spy();

        setTimeout(function(){
            redis.lpush(randomKey(), "a");

            setTimeout(function () {
                pool._clients[0].startBlpop.should.be.calledOnce();
                done();
            }, 100);
        },2000);
    });

    it ("Should restart blpop after timing out", function(done){
        this.timeout(3000);

        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        pool.registerKey(randomKey(), function(err, msg){});

        pool._clients[0].startBlpop = sinon.spy();

        setTimeout(function(){
            pool._clients[0].startBlpop.should.be.calledOnce();
            done();
        },2000);
    });

    it ("Should increment message count on receiving message", function(done){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        var key = randomKey();

        pool.registerKey(key, function(err, msg){});

        (pool._clients[0].messageCount).should.equal(0);

        setTimeout(function(){
            redis.lpush(key, "a");
            setTimeout(function(){
                (pool._clients[0].messageCount).should.equal(1);
                done();
            }, 100);
        },100);
    });

    it ("Should not increment message count on timing out", function(done){
        var pool = new blpopPool(redis, {
            clientOptions: {
                maxKeys: 10,
                timeout: 1
            }
        });

        pool.registerKey(randomKey(), function(err, msg){});

        (pool._clients[0].messageCount).should.equal(0);

        setTimeout(function(){
            (pool._clients[0].messageCount).should.equal(0);
            done();
        },1500);
    });

    // @todo finish testcase
    it ("Should log warning when receiving message for unknown key", function(){
        // true.should.be.false();
    });

    // @todo finish testcase
    it ("Should throw error if received redis error and have no callback", function(){
        // true.should.be.false();
    });

    it ("Should not start blpop if there are no keys in the queue", function(done){
        var pool = new blpopPool(redis);

        var client = pool.createClient({timeout: 1});

        client.onMessage = sinon.spy();

        client.startBlpop();

        setTimeout(function(){
            client.onMessage.should.not.be.called();
            done();
        }, 1500);
    });
});

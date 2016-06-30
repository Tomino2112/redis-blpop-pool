"use strict";
var merge = require("merge");
var RedisBlpopPool = (function () {
    function RedisBlpopPool(redisClient, options) {
        if (options === void 0) { options = {}; }
        this._options = {
            maxClients: 0,
            clientOptions: {
                maxKeys: 100,
                timeout: 1,
            },
        };
        this._clients = [];
        if (!redisClient) {
            throw new Error("Pool cannot be initialized without redis connection");
        }
        this._redis = redisClient;
        this._options = merge.recursive(true, this._options, options);
    }
    RedisBlpopPool.prototype.registerKey = function (key, callback) {
        var keyAdded = false;
        for (var i = 0; i < this._clients.length; i++) {
            if (this._clients[i].addKey(key, callback)) {
                keyAdded = true;
                break;
            }
        }
        if (!keyAdded) {
            if (this._clients.length < this._options.maxClients || this._options.maxClients === 0) {
                var newClient = this.createClient(this._options.clientOptions);
                newClient.addKey(key, callback);
            }
            else {
                throw new Error("Maximum blpop pool clients (" + this._options.maxClients + ") reached");
            }
        }
    };
    RedisBlpopPool.prototype.removeKey = function (key) {
        for (var i = 0; i < this._clients.length; i++) {
            if (this._clients[i].removeKey(key)) {
                break;
            }
        }
    };
    RedisBlpopPool.prototype.stats = function () {
        var stats = {
            options: this._options,
            clients: [],
            keys_count: 0,
        };
        for (var i = 0; i < this._clients.length; i++) {
            stats.clients.push({
                keys: this._clients[i].keys,
                message_count: this._clients[i].messageCount,
            });
            stats.keys_count += this._clients[i].keys.length;
        }
        return stats;
    };
    RedisBlpopPool.prototype.createClient = function (clientOptions) {
        var client = new RedisBlpopPoolClient(this._redis.duplicate(), clientOptions);
        this._clients.push(client);
        return client;
    };
    return RedisBlpopPool;
}());
exports.RedisBlpopPool = RedisBlpopPool;
var RedisBlpopPoolClient = (function () {
    function RedisBlpopPoolClient(ioRedisClient, options) {
        var _this = this;
        if (options === void 0) { options = {}; }
        this._options = {
            maxKeys: 100,
            timeout: 1,
        };
        this._keys = [];
        this._callbacks = [];
        this._messageCount = 0;
        this._running = false;
        this.onMessage = function (err, msg) {
            var index;
            if (msg && msg[0] && msg[1]) {
                _this._messageCount++;
                index = _this._keys.indexOf(msg[0]);
                if (index < 0) {
                    console.log("Warning: Got signal for key that doesnt exist anymore");
                }
                else {
                    _this._callbacks[index](err, msg[1]);
                }
            }
            else {
                if (err) {
                    throw new Error(err);
                }
            }
            _this.rotateKeys(index);
            _this.startBlpop();
        };
        this._r = ioRedisClient;
        this._options = merge.recursive(true, this._options, options);
    }
    Object.defineProperty(RedisBlpopPoolClient.prototype, "keys", {
        get: function () { return this._keys; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(RedisBlpopPoolClient.prototype, "messageCount", {
        get: function () { return this._messageCount; },
        enumerable: true,
        configurable: true
    });
    RedisBlpopPoolClient.prototype.addKey = function (key, callback) {
        if (this._keys.length >= this._options.maxKeys) {
            return false;
        }
        this._keys.push(key);
        this._callbacks.push(callback);
        if (!this._running) {
            this._running = true;
            this.startBlpop();
        }
        return true;
    };
    RedisBlpopPoolClient.prototype.removeKey = function (key) {
        var index = this._keys.indexOf(key);
        if (index < 0) {
            return false;
        }
        this._keys.splice(index, 1);
        this._callbacks.splice(index, 1);
        if (typeof this._keys === "undefined") {
            this._keys = [];
        }
        if (typeof this._callbacks === "undefined") {
            this._callbacks = [];
        }
        if (!this._keys.length) {
            this._running = false;
        }
        return true;
    };
    RedisBlpopPoolClient.prototype.startBlpop = function () {
        if (!this._running) {
            return;
        }
        this._r.blpop(this._keys, this._options.timeout, this.onMessage);
    };
    RedisBlpopPoolClient.prototype.rotateKeys = function (index) {
        if (index === void 0) { index = 0; }
        this._keys.push(this._keys.splice(index, 1)[0]);
        this._callbacks.push(this._callbacks.splice(index, 1)[0]);
    };
    return RedisBlpopPoolClient;
}());

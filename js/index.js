"use strict";
var merge = require("merge");
var RedisBlpopPool = (function () {
    function RedisBlpopPool(ioRedisClient, options) {
        this._options = {
            maxClients: 100,
        };
        this._clients = [];
        this._redis = ioRedisClient;
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
            if (this._clients.length < this._options.maxClients) {
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
        this._options = {
            maxKeys: 100,
            timeout: 1,
        };
        this._keys = [];
        this._callbacks = [];
        this.onMessage = function (err, msg) {
            if (err) {
                throw new Error("Redis error:", err);
            }
            var index;
            if (msg && msg[0] && msg[1]) {
                index = _this._keys.indexOf(msg[0]);
                if (index < 0) {
                    console.log("Warning: Got signal for key that doesnt exist anymore");
                }
                else {
                    _this._callbacks[index](msg[1]);
                }
            }
            _this.rotateKeys(index);
            _this.startBlpop();
        };
        this._r = ioRedisClient;
        this._options = merge.recursive(true, this._options, options);
        this.startBlpop();
    }
    RedisBlpopPoolClient.prototype.addKey = function (key, callback) {
        if (this._keys.length >= this._options.maxKeys) {
            return false;
        }
        this._keys.push(key);
        this._callbacks.push(callback);
        return true;
    };
    RedisBlpopPoolClient.prototype.removeKey = function (key) {
        var index = this._keys.indexOf(key);
        if (index < 0) {
            return false;
        }
        this._keys.splice(index, 1);
        this._callbacks.splice(index, 1);
        return true;
    };
    RedisBlpopPoolClient.prototype.startBlpop = function () {
        this._r.blpop(this._keys, this._options.timeout, this.onMessage);
    };
    RedisBlpopPoolClient.prototype.rotateKeys = function (index) {
        if (index === void 0) { index = 0; }
        this._keys.push(this._keys.splice(index, 1)[0]);
        this._callbacks.push(this._callbacks.splice(index, 1)[0]);
    };
    return RedisBlpopPoolClient;
}());

# Pool for Redis BLPOP command

[![Build Status][travis-badge]][travis-url]
[![Dependency Status][david-badge]][david-url]

## Why
In certain cases you might need to use extensively blpop command on very large number of keys. You will end up with a dilemma of either using single connection with BLPOP blocking on XXXXX keys or creating XXXXX connections for each key.
 
This package tries to solve this problem with compromising between the two.

## How it works
When you start the pool, you will specify how many connections to use and how many keys to listen in each. Script then automatically creates new connections and allocate keys to whichever connection has some free space.

New keys are added on blpop next-tick. That means you **should never** have blpop timeout 0. The shorter the blpop timeout is, the sooner new keys get into the queue.

Keys are automatically rotated to optimize the queue. 
* If blpop hits timeout without any key triggering, first key of the list moves to the end of the list.
* When blpop triggers on any key, that key is then moved to the end of the list. 

## Installation
`npm install git://github.com/Tomino2112/redis-blpop-pool --save`

When published to NPM:
`npm install redis-blpop-pool --save`

## Usage
Create blpop pool by running
`var blpopPool = new RedisBlpopPool(redisConnection, params);`

**redisConnection** 
Is either [ioredis](https://github.com/luin/ioredis) or [node_redis](https://github.com/NodeRedis/node_redis) library connection.

**parameters** 
```
{
    maxClients: 0, // Maximum redis connections (0 = unlimited)
    clientOptions: {
        maxKeys: 100, // Maximum keys in each blpop
        timeout: 1 // Timeout of blpop
    }
}
```

Add key to the pool

```
blpopPool.registerKey("hello:world", function(err, msg){
    console.log(err, msg);
});
```

## Testing 
Testing uses mocha package. Local redis must be installed as `fakeredis` package cannot handle tests for this package.

Test using: `npm test`

## Roadmap
* Cleaning up of unused connections
* Add debug messages throughout
* Better error handling
* Support both redisConnection and redis connection params on init
* Remove `merge` dependency

* Whatever other issues arise

## License
See `LICENSE` file

[travis-badge]: https://api.travis-ci.org/Tomino2112/redis-blpop-pool.svg
[travis-url]: https://travis-ci.org/Tomino2112/redis-blpop-pool
[david-badge]: https://david-dm.org/Tomino2112/redis-blpop-pool.svg
[david-url]: https://david-dm.org/Tomino2112/redis-blpop-pool
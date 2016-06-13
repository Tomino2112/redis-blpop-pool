import * as merge from "merge";

export interface IRedisBlpopPoolOptions {
    maxClients?: number;
    clientOptions?: IRedisBlpopPoolClientOptions;
}

export interface IRedisBlpopPool {
    registerKey: (key: string, callback: (value: any) => any) => void; // @todo what would be useful to return?
    removeKey: (key: string) => void;
    stats: () => IRedisBlpopPoolStats;
}

export interface IRedisBlpopPoolStats {
    options: IRedisBlpopPoolOptions;
    clients: any[];
    keys_count: number; // @todo Do we need this or client should do that?
}

export interface IRedisBlpopPoolClientOptions {
    maxKeys?: number;
    timeout?: number;
}

export interface IRedisBlpopPoolClient {
    addKey: (key: string, callback: (value: any) => any) => void; // @todo what would be useful to return?
    removeKey: (key: string) => void;

    keys: string[];
    messageCount: number;
}

export class RedisBlpopPool implements IRedisBlpopPool {
    private _redis: any;
    private _options: IRedisBlpopPoolOptions = {
        maxClients: 0,
    };
    private _clients: IRedisBlpopPoolClient[] = [];

    /**
     * Create the object with redis connection and options
     *
     * @param redisClient
     * @param options
     */
    constructor(redisClient: any, options: IRedisBlpopPoolOptions = {}) {
        this._redis = redisClient;
        this._options = merge.recursive(true, this._options, options);
    }

    /**
     * Adds key to next available client, if no client is available it creates new one.
     * If max clients is reached it raises exception
     *
     * @param key
     * @param callback
     */
    public registerKey(key: string, callback: (value: any) => any): void {
        let keyAdded: boolean = false;

        for (let i: number = 0; i < this._clients.length; i++) {
            if (this._clients[i].addKey(key, callback)) {
                keyAdded = true;
                break;
            }
        }

        if (!keyAdded) {
            if (this._clients.length < this._options.maxClients || this._options.maxClients === 0) {
                let newClient: IRedisBlpopPoolClient = this.createClient(this._options.clientOptions);

                newClient.addKey(key, callback);
            } else {
                // @todo Obviously not gonna be throwing exception but gonna handle it better
                throw new Error("Maximum blpop pool clients (" + this._options.maxClients + ") reached");
            }
        }
    }

    /**
     * Removes key from client that holds it
     *
     * @param key
     */
    public removeKey(key: string): void {
        for (let i: number = 0; i < this._clients.length; i++) {
            if (this._clients[i].removeKey(key)) {
                break;
            }
        }
    }

    public stats(): IRedisBlpopPoolStats {
        let stats: IRedisBlpopPoolStats = {
            options: this._options,
            clients: [],
            keys_count: 0,
        };

        for (let i: number = 0; i < this._clients.length; i++) {
            stats.clients.push({
                keys: this._clients[i].keys,
                message_count: this._clients[i].messageCount,
            });

            stats.keys_count += this._clients[i].keys.length;
        }

        return stats;
    }

    /**
     * Creates new client
     *
     * @param clientOptions
     * @returns {IRedisBlpopPoolClient}
     */
    private createClient(clientOptions: IRedisBlpopPoolClientOptions): IRedisBlpopPoolClient {
        let client: IRedisBlpopPoolClient = new RedisBlpopPoolClient(this._redis.duplicate(), clientOptions);

        this._clients.push(client);

        // @todo Wait when ready?
        return client;
    }
}

class RedisBlpopPoolClient implements IRedisBlpopPoolClient {
    private _r: any;
    private _options: IRedisBlpopPoolClientOptions = {
        maxKeys: 100,
        timeout: 1,
    };
    private _keys: string[] = [];
    private _callbacks: any[] = [];

    private _messageCount: number = 0;

    /**
     * Create the object with connection and options
     *
     * @param ioRedisClient
     * @param options
     */
    constructor(ioRedisClient: any, options: IRedisBlpopPoolClientOptions = {}) {
        this._r = ioRedisClient;
        this._options = merge.recursive(true, this._options, options);

        this.startBlpop();
    }

    public get keys(): string[] { return this._keys; }
    public get messageCount(): number { return this._messageCount; }

    /**
     * Add key and callback to the list
     *
     * @param key
     * @param callback
     * @returns {boolean}
     */
    public addKey(key: string, callback: (value: any) => any): boolean {
        if (this._keys.length >= this._options.maxKeys) {
            return false;
        }

        // Add the key
        this._keys.push(key);
        this._callbacks.push(callback);

        return true;
    }

    /**
     * Remove key and callback from the list
     *
     * @param key
     * @returns {boolean}
     */
    public removeKey(key: string): boolean {
        let index: number = this._keys.indexOf(key);
        if (index < 0) {
            return false;
        }

        // Remove key and callback
        // @todo Is there possibility of conflict with calling the callbacks?
        this._keys.splice(index, 1);
        this._callbacks.splice(index, 1);

        return true;
    }

    /**
     * Start the actual blocking/waiting for value
     * Blpop is using timeout to make sure that all keys added during runtime will be registered asap
     */
    private startBlpop(): void {
        this._r.blpop(this._keys, this._options.timeout, this.onMessage);
    }

    /**
     * Blpop callback
     * This function will process result of any message received and will call the callback that was saved.
     * Once message is processed, it rotates the keys and start new blpop
     *
     * @todo Handle error better
     *
     * @param msg
     */
    private onMessage: any = (err: any, msg: any) => {
        let index: number;

        if (msg && msg[0] && msg[1]) {
            this._messageCount++;

            // Find key
            index = this._keys.indexOf(msg[0]);

            if (index < 0) {
                console.log("Warning: Got signal for key that doesnt exist anymore");
            } else {
                // Run callback
                this._callbacks[index](err, msg[1]);
            }
        } else {
            // Last resort - throw error
            if (err) {
                throw new Error(err);
            }
        }

        // Rotate keys
        this.rotateKeys(index);

        // Start blpop
        this.startBlpop();
    };

    /**
     * Rotates keys to make sure all keys get their turn. Blpop is processing keys in order, so we need to make sure they rotate
     */
    private rotateKeys(index: number = 0): void {
        // Take first key and move it to the end
        this._keys.push(this._keys.splice(index, 1)[0]);
        this._callbacks.push(this._callbacks.splice(index, 1)[0]);
    }
}

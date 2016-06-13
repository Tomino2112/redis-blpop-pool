export interface IRedisBlpopPoolOptions {
    maxClients?: number;
    clientOptions?: IRedisBlpopPoolClientOptions;
}
export interface IRedisBlpopPool {
    registerKey: (key: string, callback: (value: any) => any) => void;
    removeKey: (key: string) => void;
}
export interface IRedisBlpopPoolStats {
    options: IRedisBlpopPoolOptions;
    clients: any[];
    keys_count: number;
}
export interface IRedisBlpopPoolClientOptions {
    maxKeys?: number;
    timeout?: number;
}
export interface IRedisBlpopPoolClient {
    addKey: (key: string, callback: (value: any) => any) => void;
    removeKey: (key: string) => void;
    keys: string[];
    messageCount: number;
}
export declare class RedisBlpopPool implements IRedisBlpopPool {
    private _redis;
    private _options;
    private _clients;
    constructor(redisClient: any, options?: IRedisBlpopPoolOptions);
    registerKey(key: string, callback: (value: any) => any): void;
    removeKey(key: string): void;
    stats(): IRedisBlpopPoolStats;
    private createClient(clientOptions);
}

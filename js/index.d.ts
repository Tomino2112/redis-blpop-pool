export interface IRedisBlpopPoolOptions {
    maxClients?: number;
    clientOptions?: IRedisBlpopPoolClientOptions;
}
export interface IRedisBlpopPool {
    registerKey: (key: string, callback: (value: any) => any) => void;
    removeKey: (key: string) => void;
}
export interface IRedisBlpopPoolClientOptions {
    maxKeys?: number;
    timeout?: number;
}
export interface IRedisBlpopPoolClient {
    addKey: (key: string, callback: (value: any) => any) => void;
    removeKey: (key: string) => void;
}
export declare class RedisBlpopPool implements IRedisBlpopPool {
    private _redis;
    private _options;
    private _clients;
    constructor(ioRedisClient: any, options: IRedisBlpopPoolOptions);
    registerKey(key: string, callback: (value: any) => any): void;
    removeKey(key: string): void;
    private createClient(clientOptions);
}

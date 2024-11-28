import { redisClient } from "./client";

class RedisStore {
	client: any;
	prefix: string;
	scanCount: number;
	serializer: any;
	ttl: number | ((sess: Record<string, any>) => number);
	disableTTL: boolean;
	disableTouch: boolean;

	constructor(opts: any) {
		this.client = redisClient;
		this.prefix = opts.prefix || "sess:";
		this.scanCount = opts.scanCount || 100;
		this.serializer = opts.serializer || {
			parse: JSON.parse,
			stringify: JSON.stringify,
		};
		this.ttl = opts.ttl || 86400; // 1 day TTL
		this.disableTTL = opts.disableTTL || false;
		this.disableTouch = opts.disableTouch || false;
	}

	async get(sid: string): Promise<Record<string, any> | null> {
		try {
			const data = await this.client.get(this.prefix + sid);
			return data ? this.serializer.parse(data) : null;
		} catch (err) {
			console.error("Error in RedisStore.get:", err);
			return null;
		}
	}

	async set(sid: string, sess: Record<string, any>): Promise<void> {
		try {
			const value = this.serializer.stringify(sess);
			await this.client.set(this.prefix + sid, value, {
				EX: this._getTTL(sess),
			});
		} catch (err) {
			console.error("Error in RedisStore.set:", err);
		}
	}

	async touch(sid: string, sess: Record<string, any>): Promise<void> {
		if (this.disableTouch) return;
		try {
			const ttl = this._getTTL(sess);
			await this.client.expire(this.prefix + sid, ttl);
		} catch (err) {
			console.error("Error in RedisStore.touch:", err);
		}
	}

	async destroy(sid: string): Promise<void> {
		try {
			await this.client.del(this.prefix + sid);
		} catch (err) {
			console.error("Error in RedisStore.destroy:", err);
		}
	}

	private _getTTL(sess: Record<string, any>): number {
		return typeof this.ttl === "function" ? this.ttl(sess) : this.ttl;
	}
}

export default RedisStore;

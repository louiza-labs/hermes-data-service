import { CacheEntry } from "../../../types/emails";

export class EmailCache {
	private cache = new Map<string, CacheEntry>();
	private readonly cacheDuration: number;

	constructor(cacheDuration: number) {
		this.cacheDuration = cacheDuration;
	}

	get(key: string, type: "jobRole" | "status"): string | null {
		const cached = this.cache.get(key);
		if (cached && cached[type] && Date.now() - cached.timestamp < this.cacheDuration) {
			return cached[type] || null;
		}
		return null;
	}

	set(key: string, type: "jobRole" | "status", value: string): void {
		const existing = this.cache.get(key) || { timestamp: Date.now() };
		this.cache.set(key, { ...existing, [type]: value, timestamp: Date.now() });
	}
}

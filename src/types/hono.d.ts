import "hono";

declare module "hono" {
	interface HonoRequest {
		locals: {
			cacheKey?: string;
			[key: string]: any;
		};
	}
}

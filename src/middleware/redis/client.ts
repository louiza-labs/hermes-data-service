import { createClient } from "redis";

export const redisClient = createClient({
	password: process.env.REDIS_PASSWORD ?? "Ynp0jyQmvhtQrZ8U5Rq12rPGe1BzEQMR",
	username: process.env.REDIS_USERNAME ?? "default",
	socket: {
		host: process.env.REDIS_HOST ?? "redis-14707.c9.us-east-1-2.ec2.redns.redis-cloud.com",
		port: parseInt(process.env.REDIS_PORT ?? "14707"),
	},
});

export async function initializeRedis() {
	try {
		await redisClient.connect();
		console.log("Connected to Redis");
	} catch (err) {
		console.error("Error connecting to Redis:", err);
	}
}

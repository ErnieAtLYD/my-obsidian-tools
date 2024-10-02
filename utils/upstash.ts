import { Client, Receiver } from "@upstash/qstash";
import type { NextRequest } from "next/server";
import pako from "pako";
import getByteLength from "string-byte-length";

import type { RouteMessageMap, UpstashRoute } from "@/types/upstash";

export { getByteLength, pako };

const gzip = async (input: string): Promise<Buffer> => {
	return Buffer.from(pako.gzip(input));
};
const token = process.env.QSTASH_TOKEN;
if (!token) throw new Error("QSTASH_TOKEN is not defined");

const client = new Client({ token });

const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

if (!currentKey || !nextKey) {
	throw new Error("Missing QStash signing keys");
}

const r = new Receiver({
	currentSigningKey: currentKey,
	nextSigningKey: nextKey,
});

type UpstashHeaders = {
	"Content-Type": string;
	Authorization: string;
	"Upstash-Delay"?: string;
	"Upstash-Not-Before"?: string;
	"Upstash-Method"?: string;
	"Content-Encoding"?: string;
	"Upstash-Forward-Delay-Applied"?: string;
};
export const upstashHeaders: UpstashHeaders = {
	Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
	"Content-Type": "application/json",
};

export async function verifyUpstashSignature(req: NextRequest) {
	const body = await req.text();
	const signature = req.headers.get("Upstash-Signature") ?? "";
	let isValid = false;
	try {
		isValid = await r.verify({ body, signature });
		if (!isValid) {
			console.log("Invalid signature");
			throw new Error("Invalid signature");
		}
	} catch (err) {
		console.log("Caught Error: ", err);
		throw new Error("Invalid signature");
	}
	return JSON.parse(body);
}

export async function getUpstashQueue(queueName: string) {
	const queue = client.queue({ queueName });
	const queueInfo = await queue.get();
	return queueInfo;
}

export async function publishToUpstash<Route extends UpstashRoute>(
	url: Route,
	message: RouteMessageMap[Route],
	options?: {
		queue?: string;
		queueParallelism?: number;
		delay?: number;
		absoluteDelay?: string;
		upstashMethod?: "GET" | "PUT" | "POST" | "DELETE" | "PATCH";
	},
) {
	console.log("Starting publishToUpstash function");
	// console.log('Publishing to Upstash')
	// console.log('URL: ', url)
	const urlPath = `${process.env.NEXT_PUBLIC_SITE_URL}${url}`;
	console.log("Full URL Path:", urlPath);
	console.log("QSTASH_URL:", process.env.QSTASH_URL);
	console.log("QSTASH_TOKEN:", process.env.QSTASH_TOKEN ? "Set" : "Not Set");
	try {
		console.log("Checking queue options");
		if (options?.queue) {
			console.log("Queue option detected, enqueueing JSON");
			const queue = client.queue({ queueName: options.queue });
			if (options.queueParallelism) {
				queue.upsert({ parallelism: options.queueParallelism });
			}
			await queue.enqueueJSON({
				url: urlPath,
				body: message,
			});
			console.log("JSON enqueued successfully");
			return;
		}
		if (options?.absoluteDelay) {
			// figure out seconds of absolute delay
			const secondsFromNow =
				Number(options.absoluteDelay) - Math.floor(Date.now() / 1000);
			console.log("Absolute Delay: ", secondsFromNow);
		}

		console.log("Preparing headers");
		const headers: UpstashHeaders = upstashHeaders;
		if (options?.delay) {
			headers["Upstash-Delay"] = `${options.delay}s`;
			console.log("Delay: ", options.delay);
			headers["Upstash-Forward-Delay-Applied"] = `${options.delay}`;
		}
		if (options?.absoluteDelay) {
			headers["Upstash-Not-Before"] = options.absoluteDelay;
		}
		if (options?.upstashMethod) {
			headers["Upstash-Method"] = options.upstashMethod;
		}

		console.log("Preparing message");
		let messageToSend: string | Buffer = JSON.stringify(message);
		const size = getByteLength(messageToSend);
		console.log("Size: ", size);

		if (size > 1000000) {
			console.log("Message too large, compressing...");
			headers["Content-Type"] = "application/octet-stream";
			headers["Content-Encoding"] = "gzip";
			messageToSend = await gzip(messageToSend);
		}
		console.log(`${process.env.QSTASH_URL}${urlPath}`);

		console.log("Preparing to send POST request to Upstash");
		console.log(`URL: ${process.env.QSTASH_URL}${urlPath}`);
		console.log("Headers:", JSON.stringify(headers, null, 2));

		const response = await fetch(`${process.env.QSTASH_URL}${urlPath}`, {
			method: "POST",
			headers,
			body: messageToSend,
		});
		console.log("Received response from Upstash");
		console.log("Status:", response.status);

		if (response.ok) {
			const responseData = await response.json();
			console.log("Successfully published to Upstash");
			console.log("Response data:", JSON.stringify(responseData, null, 2));
			return await responseData;
		}
		console.log("Error publishing to Upstash");
		console.log("Status: ", await response.text());
		throw new Error(
			`Error publishing to Upstash: ${response.status} ${response.statusText}`,
		);
	} catch (error) {
		console.error("Error in publishToUpstash:", error);
		throw error;
	}
}

import protobuf from "protobufjs";
import { Fields } from "../Fields";

export function decodeFullMessage(message: protobuf.Message): Fields {
	const result: Fields = {};

	for (const [name] of Object.entries(message.$type.fields)) {
		const value = (message as any)[name];

		if (value === undefined || value === null) {
			continue;
		}

		if (Array.isArray(value)) {
			result[name] = value.map(v =>
				isMessage(v)
					? decodeFullMessage(v)
					: v
			);
		} else if (isMessage(value)) {
			result[name] = decodeFullMessage(value);
		} else {
			result[name] = value;
		}
	}

	for (const [name] of Object.entries(message.$type.oneofs ?? {})) {
		result[name] = (message as any)[name];
	}

	return result;
}

function isMessage(value: unknown): value is protobuf.Message {
	return (
		typeof value === "object" &&
		value !== null &&
		"$type" in value &&
		(value as any).$type instanceof protobuf.Type
	);
}
export async function readTextStream(stream: ReadableStream) {
	const decoder = new TextDecoder();
	const reader = stream.getReader();

	while (true) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		return decoder.decode(value);
	}
}

export async function readJsonStream(stream: ReadableStream) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let accumulatedText = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		accumulatedText += decoder.decode(value, { stream: true });
	}
	return JSON.parse(accumulatedText);
}

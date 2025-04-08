export async function readTextStream(readableStream) {
  const decoder = new TextDecoder();
  const reader = readableStream.getReader();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    return decoder.decode(value);
  }
}

export async function readJsonStream(readableStream) {
  const reader = readableStream.getReader();
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

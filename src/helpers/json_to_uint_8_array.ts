export function jsonToUint8Array<T>(data: T): Promise<Uint8Array> {
  const blob = new Blob([JSON.stringify(data)]);

  return blob.arrayBuffer()
    .then((buffer) => new Uint8Array(buffer));
}

export interface StorageProvider {
  delete(uuid: string): Promise<void>;
  write(uuid: string, file: File): Promise<void>;
  read(uuid: string): Promise<File>;
}

import { UuidGenerator } from "../../domain/providers/uuid_generator.ts";

export class DefaultUuidGenerator implements UuidGenerator {
  private readonly charTable;

  constructor() {
    this.charTable = this.buildCharactersArray();
  }

  generate(lenght = 8): string {
    if (lenght === 0) return "";

    const char = Math.floor(Math.random() * this.charTable.length);

    return this.charTable[char].concat(this.generate(lenght - 1));
  }

  private buildCharactersArray() {
    return [
      ...this.buildSmallCasesArray(),
      ...this.buildUpperCasesArray(),
      ...this.buildNumbersArray(),
    ];
  }

  private buildSmallCasesArray() {
    return this.generateUnicodeArrayFromCodePoint("a", 25);
  }

  private buildUpperCasesArray() {
    return this.generateUnicodeArrayFromCodePoint("A", 25);
  }

  private buildNumbersArray() {
    return this.generateUnicodeArrayFromCodePoint("0", 9);
  }

  private generateUnicodeArrayFromCodePoint(char: string, lenght: number) {
    const initialPosition = char.codePointAt(0) as number;
    return this.generateUnicodeArray(initialPosition, initialPosition + lenght);
  }

  private generateUnicodeArray(from: number, to: number): string[] {
    if (to < from) return [];
    return [String.fromCodePoint(from)].concat(
      this.generateUnicodeArray(from + 1, to)
    );
  }
}

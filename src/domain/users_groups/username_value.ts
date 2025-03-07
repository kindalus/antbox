import { left, right, type Either } from "shared/either";
import { InvalidUsernameFormatError } from "./invalid_username_format_error";

export class UsernameValue {
    readonly #username: string;

    constructor(username: string) {
        this.#username = username;
    }

    static fromString(username: string): Either<InvalidUsernameFormatError, UsernameValue> {
        const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_.]{2,19}$/;

        if(!username.trim().match(usernameRegex)) {
            return left(new InvalidUsernameFormatError(username));
        }

        return right(new UsernameValue(username));
    }

    get value(): string {
        return this.#username;
    }
}
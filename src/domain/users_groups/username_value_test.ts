import { describe, test, expect } from "bun:test"
import { UsernameValue } from "./username_value"
import { InvalidUsernameFormatError } from "./invalid_username_format_error";

describe("UsernameValue", () => {
    test("should return a valid username", () => {
        const usernameOrErr = UsernameValue.fromString("username");
        expect(usernameOrErr.isRight()).toBeTruthy();
        expect(usernameOrErr.right.value).toBe("username");
    });

    test("should throw error if username is invalid", () => {
        const invalidUsernames = [
            "js", 
            "john doe", 
            "123john", 
            "user@name", 
            "user!name",
            "this_is_a_very_long_username123456"
        ];
        
        invalidUsernames.forEach((username) => {
            const usernameOrErr = UsernameValue.fromString(username)
            expect(usernameOrErr.isLeft()).toBeTruthy()
            expect(usernameOrErr.value).toBeInstanceOf(InvalidUsernameFormatError)
        });
    });
});
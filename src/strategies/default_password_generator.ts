import DefaultUuidGenerator from "/strategies/default_uuid_generator.ts";
import PasswordGenerator from "/domain/auth/password_generator.ts";

export default class DefaultPasswordGenerator implements PasswordGenerator {
	readonly uuidGenerator = new DefaultUuidGenerator();

	constructor() {}

	generate(): string {
		return this.uuidGenerator.generate();
	}
}

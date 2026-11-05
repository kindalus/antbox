import { describe, it } from "bdd";
import { expect } from "expect";
import { stub } from "./stub.ts";

class Greeter {
	prefix = "hi";
	greet(name: string) {
		return `${this.prefix} ${name}`;
	}
}

describe("stub", () => {
	it("replaces an object method, records calls and restores", () => {
		const target = { double: (n: number) => n * 2 };
		const original = target.double;
		const s = stub(target, "double", () => 0);
		expect(target.double(4)).toBe(0);
		expect(s.calls).toHaveLength(1);
		expect(s.calls[0].args).toEqual([4]);
		s.restore();
		expect(target.double).toBe(original);
		expect(target.double(4)).toBe(8);
	});

	it("defaults to a no-op and supports using", () => {
		const target = { run: () => "real" };
		{
			using s = stub(target, "run");
			expect(target.run()).toBeUndefined();
			expect(s.calls).toHaveLength(1);
		}
		expect(target.run()).toBe("real");
	});

	it("stubs prototype methods with the receiver and restores inheritance", () => {
		const s = stub(Greeter.prototype, "greet", function (this: Greeter, name: string) {
			return `${this.prefix}! ${name}`;
		});
		const greeter = new Greeter();
		expect(greeter.greet("a")).toBe("hi! a");
		expect(s.calls[0].self).toBe(greeter);
		s.restore();
		expect(Object.hasOwn(Greeter.prototype, "greet")).toBe(true);
		expect(greeter.greet("a")).toBe("hi a");
	});

	it("removes the own property when the method was inherited", () => {
		const child = new Greeter();
		const s = stub(child, "greet", () => "x");
		expect(child.greet("a")).toBe("x");
		s.restore();
		expect(Object.hasOwn(child, "greet")).toBe(false);
		expect(child.greet("a")).toBe("hi a");
	});

	it("passes through async replacements and ignores double restore", async () => {
		const target = { load: () => Promise.resolve(1) };
		const s = stub(target, "load", () => Promise.resolve(2));
		expect(await target.load()).toBe(2);
		s.restore();
		s.restore();
		expect(await target.load()).toBe(1);
	});
});

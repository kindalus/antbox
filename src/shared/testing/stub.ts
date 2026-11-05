// deno-lint-ignore no-explicit-any
type AnyFunction = (...args: any[]) => any;

export interface StubCall {
	args: unknown[];
	self: unknown;
}

export interface Stub {
	readonly calls: StubCall[];
	restore(): void;
	[Symbol.dispose](): void;
}

export function stub<T extends object, K extends keyof T>(
	target: T,
	method: K,
	replacement?: T[K] extends AnyFunction ? T[K] : never,
): Stub {
	const original = Object.getOwnPropertyDescriptor(target, method);
	const calls: StubCall[] = [];
	const implementation = replacement as AnyFunction | undefined;
	let restored = false;

	Object.defineProperty(target, method, {
		configurable: true,
		enumerable: original?.enumerable ?? true,
		writable: true,
		value: function (this: unknown, ...args: unknown[]) {
			calls.push({ args, self: this });
			return implementation?.apply(this, args);
		},
	});

	const restore = () => {
		if (restored) return;
		restored = true;
		if (original) Object.defineProperty(target, method, original);
		else Reflect.deleteProperty(target, method);
	};

	return { calls, restore, [Symbol.dispose]: restore };
}

// deno-lint-ignore-file no-explicit-any
function fn<T>(v: T): T & BelikerFn {
	const calls: any[] = [];
	const lastCall: { value: any } = { value: undefined };

	const mock = Object.assign((...args: unknown[]) => {
		calls.push(args);
		lastCall.value = args;

		return (v as any)(args);
	}, {
		called: (): boolean => calls.length > 0,
		calledTimes: (v: number) => calls.length === v,
		calledWith: (...args: any[]) => {
			return areEqual(lastCall.value ?? "", args ?? "");
		},
	});

	return mock as unknown as (T & BelikerFn);
}

export interface BelikerFn {
	called(): boolean;
	calledTimes(v: number): boolean;
	calledWith(...args: any[]): boolean;
}

export { fn };

function areEqual(a: any[], b: any[]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

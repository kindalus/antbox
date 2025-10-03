export function errToMsg(err: unknown) {
	const v = err as Error;
	return (v?.message ? v.message : JSON.stringify(err));
}

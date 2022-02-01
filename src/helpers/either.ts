export default interface Either<S, E> {
	success?: S;
	alt?: S;
	error?: E;
}

export function success<S, E>(success: S): Either<S, E> {
	return {
		success,
	};
}

export function error<S, E>(error: E, alt?: S): Either<S, E> {
	return {
		error,
		alt,
	};
}

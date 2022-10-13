export interface Event {
  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: unknown;
}

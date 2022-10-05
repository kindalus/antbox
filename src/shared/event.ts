export interface Event {
  readonly eventId: string;
  readonly occurredOn: Date;
  readonly payload: Record<string, unknown>;
}

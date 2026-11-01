export type EconomyErrorCode =
  | 'insufficient_funds'
  | 'already_owned'
  | 'already_claimed'
  | 'not_found'
  | 'not_eligible'
  | 'duplicate_event'
  | 'locked'
  | 'limit_reached'
  | 'invalid'
  | 'clock_tampered';

export class EconomyError extends Error {
  constructor(
    readonly code: EconomyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EconomyError';
  }
}

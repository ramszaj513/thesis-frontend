import type { BackendErrorCode } from '../../shared/protocol';

export class BackendError extends Error {
  constructor(
    readonly code: BackendErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

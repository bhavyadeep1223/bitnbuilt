/** Base for errors that should surface as a specific HTTP status + message, never a generic 500. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class NotVisibleError extends Error {
  readonly clientMessage: string;

  constructor(message: string, clientMessage: string = message) {
    super(message);
    this.clientMessage = clientMessage;
  }
}

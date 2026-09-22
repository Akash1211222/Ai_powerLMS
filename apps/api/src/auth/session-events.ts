import { Injectable, Logger } from '@nestjs/common';

type LogoutListener = (userId: string) => Promise<void> | void;

/**
 * Lets features that hold their own credentials — the IDE's workspace cookie —
 * drop them when a user signs out, without the auth module importing them.
 */
@Injectable()
export class SessionEvents {
  private readonly logger = new Logger(SessionEvents.name);
  private readonly logoutListeners: LogoutListener[] = [];

  onLogout(listener: LogoutListener): void {
    this.logoutListeners.push(listener);
  }

  /** Never throws: a listener failing must not fail the logout itself. */
  async loggedOut(userId: string): Promise<void> {
    for (const listener of this.logoutListeners) {
      try {
        await listener(userId);
      } catch (err) {
        this.logger.error(
          `logout listener failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

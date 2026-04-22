import type { App } from "@slack/bolt";
import { logger } from "../util/logger.js";

/**
 * Registers the Approve / Request Revision button handlers. Both are stubs
 * for now; the real wiring will call handlers/approve.ts and handlers/revise.ts.
 */
export function registerSlackActions(app: App): void {
  app.action("approve_flyer", async ({ ack, body }) => {
    await ack();
    logger.info({ body }, "TODO: approve_flyer — call approve handler");
    // TODO: extract recordId from action.value, call approve handler,
    //       update the Slack message to a read-only approved state.
  });

  app.action("request_revision", async ({ ack, body }) => {
    await ack();
    logger.info({ body }, "TODO: request_revision — open modal for notes");
    // TODO: open a modal to collect revision notes, then call revise handler
    //       on modal submit and update this message with the new draft.
  });
}

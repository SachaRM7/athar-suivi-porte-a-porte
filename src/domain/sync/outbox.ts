import type { DoorSnapshot, OutboxEntry, RejectionCategory, VisitIntent } from '../doors/contracts';

export interface Outbox {
  add(intent: VisitIntent): Promise<void>;
  pending(): Promise<OutboxEntry[]>;
  all(): Promise<OutboxEntry[]>;
  markSynced(commandId: string): Promise<void>;
  markConflict(commandId: string, serverDoor: DoorSnapshot): Promise<void>;
  markRejected(commandId: string, category: RejectionCategory): Promise<void>;
  reapplyConflict(commandId: string): Promise<void>;
  abandonConflict(commandId: string): Promise<void>;
}

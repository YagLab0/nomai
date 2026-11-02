'use client';

import { Modal } from '@heroui/react';

import { ChatThread } from '@/components/chat/chat-thread';

/**
 * The Booking's chat as a dialog (ADR-0009) — same shell as ReviewModal:
 * header with the counterpart's name, body with the thread. ChatThread only
 * mounts while the modal is open, so its polling stops the moment it closes.
 */
export function ChatModal({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  endpoint,
  bookingId,
  emptyHint,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Usually the counterpart's name or the Lodging's title. */
  title: string;
  subtitle?: string;
  /** Proxy base the thread GETs/POSTs — e.g. `/api/bookings/<id>/messages`. */
  endpoint: string;
  /** The Booking the thread hangs off — scopes the Realtime subscription. */
  bookingId: string;
  emptyHint?: string;
}) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog className="bg-paper">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="font-brand text-2xl font-medium text-ink">
                {title}
              </Modal.Heading>
              {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            </Modal.Header>
            <Modal.Body className="flex min-h-0 flex-col">
              {isOpen ? <ChatThread endpoint={endpoint} bookingId={bookingId} emptyHint={emptyHint} /> : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

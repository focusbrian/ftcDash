import { useEffect, useId, useRef, useState } from 'react';
import { InfoIcon } from './InfoIcon';
import { eventTypeLabel, fmtDateRange } from '../lib/format';
import type { EventData } from '../types';

interface Props {
  event: EventData | null;
}

function directionsUrl(event: EventData, address: string | null): string | null {
  const parts = [
    event.location.venue,
    address,
    event.location.city,
    event.location.state,
    event.location.country,
  ].filter((part): part is string => Boolean(part && part.trim()));
  if (parts.length === 0) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(parts.join(', '))}`;
}

/** Info button beside the event picker: where the event is, when it runs, and links out. */
export function EventInfo({ event }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // A new event means the open panel would describe the wrong one.
  useEffect(() => {
    setOpen(false);
  }, [event?.code]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (pointerEvent: PointerEvent) => {
      if (!wrapRef.current?.contains(pointerEvent.target as Node)) setOpen(false);
    };
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const where = event
    ? [event.location.city, event.location.state, event.location.country].filter(Boolean).join(', ')
    : '';
  // FIRST addresses sometimes end in a dangling comma, which reads badly and muddies a maps query.
  const address = event?.address ? event.address.replace(/[\s,]+$/, '') : null;
  const maps = event ? directionsUrl(event, address) : null;
  const scoutUrl = event ? `https://ftcscout.org/events/${event.season}/${event.code}` : null;

  return (
    <div className="eventinfo" ref={wrapRef}>
      <button
        type="button"
        className="iconbutton"
        aria-label="Event information"
        title="Event information"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={!event}
        onClick={() => setOpen((current) => !current)}
      >
        <InfoIcon />
      </button>

      {open && event ? (
        <div className="eventinfo__panel" id={panelId} role="dialog" aria-label="Event information">
          <p className="eventinfo__kicker">
            {event.code} · {eventTypeLabel(event.type)}
            {event.fieldCount
              ? ` · ${event.fieldCount} field${event.fieldCount === 1 ? '' : 's'}`
              : ''}
          </p>
          <h2 className="eventinfo__name">{event.name}</h2>

          <dl className="eventinfo__rows">
            <div className="eventinfo__row">
              <dt>Dates</dt>
              <dd>{fmtDateRange(event.start, event.end)}</dd>
            </div>
            {event.location.venue ? (
              <div className="eventinfo__row">
                <dt>Venue</dt>
                <dd>{event.location.venue}</dd>
              </div>
            ) : null}
            {address ? (
              <div className="eventinfo__row">
                <dt>Address</dt>
                <dd>{address}</dd>
              </div>
            ) : null}
            {where ? (
              <div className="eventinfo__row">
                <dt>City</dt>
                <dd>{where}</dd>
              </div>
            ) : null}
            <div className="eventinfo__row">
              <dt>Time zone</dt>
              <dd>{event.timezone}</dd>
            </div>
          </dl>

          <div className="eventinfo__actions">
            {maps ? (
              <a
                className="button button--small"
                href={maps}
                target="_blank"
                rel="noreferrer noopener"
              >
                Directions
              </a>
            ) : null}
            {scoutUrl ? (
              <a
                className="button button--small button--ghost"
                href={scoutUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                FTC Scout
              </a>
            ) : null}
            {event.website ? (
              <a
                className="button button--small button--ghost"
                href={event.website}
                target="_blank"
                rel="noreferrer noopener"
              >
                Event site
              </a>
            ) : null}
            {event.liveStreamUrl ? (
              <a
                className="button button--small button--ghost"
                href={event.liveStreamUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Livestream
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

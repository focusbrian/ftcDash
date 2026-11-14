import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { MatchView } from '../lib/model';

interface EventCharts {
  season: number;
  /** Every match of the loaded event, used to plot a team's in-event OPR trend. */
  views: MatchView[];
}

const EventChartsContext = createContext<EventCharts | null>(null);

/** Shares the loaded event with hover cards, so they can chart a team without prop drilling. */
export function EventChartsProvider({ value, children }: { value: EventCharts; children: ReactNode }) {
  return <EventChartsContext.Provider value={value}>{children}</EventChartsContext.Provider>;
}

export function useEventCharts(): EventCharts | null {
  return useContext(EventChartsContext);
}

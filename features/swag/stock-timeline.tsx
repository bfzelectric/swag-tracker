'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { groupStockChanges, type StockChange } from '@/lib/stock-history';
import { getSupabaseBrowserClient } from '@/lib/supabase';

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

export function StockTimeline({
  revision,
  demoEvents,
}: {
  revision: number;
  demoEvents: StockChange[];
}) {
  const [events, setEvents] = useState<StockChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(
    async (olderThan?: StockChange) => {
      const client = getSupabaseBrowserClient();
      if (!client) {
        setEvents(demoEvents);
        setLoading(false);
        return;
      }
      const request = ++requestId.current;
      setLoading(true);
      setError('');
      try {
        let query = client
          .from('swag_stock_changes')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(200);
        if (olderThan)
          query = query.or(
            `created_at.lt.${olderThan.created_at},and(created_at.eq.${olderThan.created_at},id.lt.${olderThan.id})`,
          );
        const result = await query;
        if (request !== requestId.current) return;
        if (result.error) throw result.error;
        const rows = (result.data ?? []) as StockChange[];
        setEvents((previous) => (olderThan ? [...previous, ...rows] : rows));
        setHasMore(rows.length === 200);
      } catch {
        if (request === requestId.current)
          setError('Stock history could not be loaded. Try refreshing it.');
      } finally {
        if (request === requestId.current) setLoading(false);
      }
    },
    [demoEvents],
  );
  const cancelLoad = useCallback(() => {
    requestId.current++;
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      cancelLoad();
    };
  }, [revision, load, cancelLoad]);
  const [query, setQuery] = useState('');
  const groups = groupStockChanges(events).filter((group) =>
    `${group.actor} ${group.lines.map((line) => `${line.name} ${line.category} ${line.color} ${line.size}`).join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <aside className="stock-timeline" aria-label="Stock history">
      <header>
        <div>
          <h2>
            <History /> Stock history
          </h2>
          <p>Changes by the same person are grouped until a 5-minute pause.</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh stock history"
          disabled={loading}
          onClick={() => void load()}
        >
          <RotateCcw />
        </Button>
      </header>
      <input
        className="text-input"
        aria-label="Search stock history"
        placeholder="Search item, size, or person…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="stock-timeline-scroll" aria-busy={loading}>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {!groups.length && !error && (
          <p className="empty-state">
            {loading
              ? 'Loading stock history…'
              : events.length
                ? 'No loaded changes match this search.'
                : 'No stock changes recorded yet. Add or remove stock to start the timeline.'}
          </p>
        )}
        {groups.map((group) => (
          <article className="stock-change-card" key={group.id}>
            <header>
              <time dateTime={group.endedAt}>{formatTime(group.endedAt)}</time>
              <small>
                {group.count} change{group.count === 1 ? '' : 's'}
              </small>
            </header>
            <p className="stock-change-actor">{group.actor}</p>
            {group.startedAt !== group.endedAt && (
              <small className="stock-change-range">
                Started {formatTime(group.startedAt)}
              </small>
            )}
            <ul>
              {group.lines.map((line) => (
                <li key={line.key}>
                  <strong>{line.name}</strong>
                  <small>
                    {[line.size || 'One size', line.color]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  <div className="stock-change-totals">
                    {line.removed > 0 && (
                      <span className="stock-removed">
                        −{line.removed} removed
                      </span>
                    )}
                    {line.added > 0 && (
                      <span className="stock-added">+{line.added} added</span>
                    )}
                  </div>
                  <small>
                    On hand: {line.before} → {line.after}
                    {line.actions.includes('removed')
                      ? ' · Item removed'
                      : line.actions.includes('restored')
                        ? ' · Item restored'
                        : line.actions.includes('created')
                          ? ' · New item'
                          : ''}
                  </small>
                </li>
              ))}
            </ul>
          </article>
        ))}
        {hasMore && (
          <>
            <p className="stock-history-note">
              Load older changes to complete earlier groups.
            </p>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void load(events.at(-1))}
            >
              {loading ? 'Loading…' : 'Load older changes'}
            </Button>
          </>
        )}
      </div>
      <p className="stock-history-note">
        Includes saved adjustments and fulfillment deductions. Older history is
        limited to changes previously recorded.
      </p>
    </aside>
  );
}

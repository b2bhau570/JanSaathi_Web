import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNotifications, acknowledgeNotification } from '../../api/doctorApi';

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const fetchNotes = async () => {
    setIsLoading(true);
    try {
      const data = await getNotifications();
      setNotifications(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void fetchNotes();
    });
    return () => {
      active = false;
    };
  }, []);

  const handleAcknowledge = async (id: string) => {
    setAcknowledgingId(id);
    try {
      await acknowledgeNotification(id);
      await fetchNotes();
    } catch (err) {
      console.error(err);
      alert('Failed to acknowledge alert.');
    } finally {
      setAcknowledgingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif opsz-96 font-medium text-2xl md:text-3xl text-ink">Priority Alerts & Notifications</h1>
        <p className="text-xs text-inkmute mt-1">
          Urgent clinical case alerts and system notifications requiring doctor acknowledgment.
        </p>
      </div>

      <div className="bg-creamdeep rounded-2xl border border-ink/8 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-inkmute">Loading alerts...</div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-xs text-inkmute">
            No active alerts or notifications.
          </div>
        ) : (
          <div className="divide-y divide-ink/8">
            {notifications.map((n) => {
              const isUrgent =
                n.notification_type?.includes('emergency') ||
                n.notification_type?.includes('urgent');
              return (
                <div
                  key={n.id}
                  className={`p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${!n.is_read ? 'bg-cream/70' : 'bg-transparent'
                    }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUrgent ? 'bg-magenta/15 text-magenta' : 'bg-ink/8 text-inkmute'
                      }`}>
                      <iconify-icon
                        icon={isUrgent ? 'ph:warning-circle-fill' : 'ph:bell-simple-fill'}
                        width="18"
                        height="18"
                      ></iconify-icon>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-semibold text-ink">{n.title}</strong>
                        {!n.is_read && (
                          <span className="bg-magenta text-cream text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase">
                            Unread
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-inkmute leading-relaxed">{n.message}</p>
                      <span className="text-[10px] text-inkmute/70 flex items-center gap-1.5 pt-0.5">
                        <iconify-icon icon="ph:clock-bold" width="11" height="11"></iconify-icon>
                        {new Date(n.created_at).toLocaleString()}
                        {n.acknowledged_at && (
                          <span> • Acknowledged {new Date(n.acknowledged_at).toLocaleTimeString()}</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
                    {n.case_id && (
                      <Link
                        to={`/doctor/cases/${n.case_id}`}
                        className="text-xs text-magenta hover:underline font-medium flex items-center gap-1"
                      >
                        <span>View Case</span>
                        <iconify-icon icon="ph:arrow-right-bold" width="12" height="12"></iconify-icon>
                      </Link>
                    )}

                    {!n.is_read && (
                      <button
                        onClick={() => handleAcknowledge(n.id)}
                        disabled={acknowledgingId === n.id}
                        className="pill pill-ink px-3 py-1.5 text-[11px]"
                      >
                        {acknowledgingId === n.id ? 'Saving...' : 'Acknowledge'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

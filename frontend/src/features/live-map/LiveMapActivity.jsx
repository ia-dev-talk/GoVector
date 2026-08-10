import { memo } from 'react';
import {
  ActivityIcon,
  ChevronIcon,
} from './LiveMapIcons';


const LiveMapActivity = memo(function LiveMapActivity({
  open,
  onToggle,
  activities,
}) {
  return (
    <section
      className={[
        'lm-activity',
        open ? 'lm-activity--open' : '',
      ].join(' ')}
    >
      <button
        type="button"
        className="lm-activity-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>
          <ActivityIcon />
          Activité temps réel
        </span>

        <span className="lm-activity-count">
          {activities.length}
        </span>

        <ChevronIcon
          direction={open ? 'down' : 'up'}
        />
      </button>

      {open && (
        <div
          className="lm-activity-list"
          role="log"
          aria-live="polite"
        >
          {activities.length === 0 ? (
            <div className="lm-activity-empty">
              Aucun événement reçu pendant cette session.
            </div>
          ) : (
            activities.map((activity) => (
              <div
                key={activity.id}
                className={`lm-activity-item lm-activity-item--${activity.tone}`}
              >
                <time>{activity.time}</time>
                <span>{activity.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
});


export default LiveMapActivity;

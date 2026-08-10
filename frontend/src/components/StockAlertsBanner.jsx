import { useState, useEffect } from 'react';
import { api } from '../api/client';

function notify(text) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Stock Bas', { body: text, tag: 'stock-alert' });
    }
  } catch {
    // Browser notification support is optional.
  }
}

export default function StockAlertsBanner() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.getStockAlerts();
      setItems(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!items.length) return;
    const last = items[0];
    const text = `Stock bas : ${last.equipment_type} (${last.current_stock}/${last.min_stock_threshold}) — ${last.operator}`;
    notify(text);
  }, [items]);

  if (loading || items.length === 0) return null;
  return (
    <div className="stock-alerts-banner">
      {items.map((a, i) => (
        <span key={i} className="stock-alert-dot">
          {a.equipment_type} : {a.current_stock} / {a.min_stock_threshold} ({a.operator})
        </span>
      ))}
    </div>
  );
}

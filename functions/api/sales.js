const J = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequest({ request, env }) {
  if (!env.DB) return J({ error: 'database not connected' }, 500);

  const db = env.DB;
  const method = request.method;
  const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const setSetting = (k, v) =>
    db
      .prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind(k, String(v))
      .run();

  if (method === 'GET') {
    const s = await db.prepare('SELECT id,date,amount,mode,created FROM sales ORDER BY created DESC').all();
    const d = await db.prepare("SELECT value FROM settings WHERE key='day1'").first();
    const t = await db.prepare("SELECT value FROM settings WHERE key='target'").first();
    return J({ sales: s.results, day1: d ? d.value : null, target: t ? Number(t.value) : null });
  }

  if (method === 'POST') {
    const b = await request.json().catch(() => ({}));

    if (b.day1 !== undefined) {
      if (!isDate(b.day1)) return J({ error: 'bad date' }, 400);
      await setSetting('day1', b.day1);
      return J({ ok: true });
    }

    if (b.target !== undefined) {
      const n = Number(b.target);
      if (!(n > 0) || n > 100000000) return J({ error: 'bad target' }, 400);
      await setSetting('target', n);
      return J({ ok: true });
    }

    const amount = Number(b.amount);
    if (!(amount > 0) || amount > 10000000) return J({ error: 'bad amount' }, 400);
    if (b.mode !== 'cash' && b.mode !== 'phonepe') return J({ error: 'bad mode' }, 400);
    if (!isDate(b.date)) return J({ error: 'bad date' }, 400);

    await db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('day1',?)").bind(b.date).run();
    await db
      .prepare('INSERT INTO sales(date,amount,mode,created) VALUES(?,?,?,?)')
      .bind(b.date, amount, b.mode, Date.now())
      .run();
    return J({ ok: true });
  }

  if (method === 'DELETE') {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!id) return J({ error: 'bad id' }, 400);
    await db.prepare('DELETE FROM sales WHERE id=?').bind(id).run();
    return J({ ok: true });
  }

  return J({ error: 'method' }, 405);
}

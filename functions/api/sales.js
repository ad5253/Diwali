const J = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const okAmt = (n) => n > 0 && n <= 10000000;

export async function onRequest({ request, env }) {
  const db = env.DB;
  if (!db) return J({ error: 'database not connected' }, 500);
  try {
    const m = request.method;

    if (m === 'GET') {
      const s = await db.prepare('SELECT id,date,amount,mode,kind,n,created FROM sales ORDER BY date DESC, created DESC').all();
      const st = await db.prepare('SELECT key,value FROM settings').all();
      const settings = {};
      st.results.forEach((r) => (settings[r.key] = r.value));
      return J({ sales: s.results, settings });
    }

    if (m === 'POST') {
      const b = await request.json().catch(() => ({}));

      if (b.set) {
        const k = String(b.set.key), v = String(b.set.value);
        if (/^dt:\d{4}-\d{2}-\d{2}$/.test(k)) {
          if (v === '') { await db.prepare('DELETE FROM settings WHERE key=?').bind(k).run(); return J({ ok: true }); }
          if (!okAmt(Number(v))) return J({ error: 'bad target' }, 400);
        } else if (/^(day1|diwali):\d{4}$/.test(k)) { if (!isDate(v)) return J({ error: 'bad date' }, 400); }
        else if (/^target:\d{4}$/.test(k)) { if (!okAmt(Number(v))) return J({ error: 'bad target' }, 400); }
        else return J({ error: 'bad key' }, 400);
        await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, v).run();
        return J({ ok: true });
      }

      // Historical import: [{date, mode, amount, kind, n}] — replaces everything on those dates
      if (Array.isArray(b.import)) {
        if (!b.import.length || b.import.length > 5000) return J({ error: 'bad import size' }, 400);
        const dates = new Set();
        for (const r of b.import) {
          if (!isDate(r.date)) return J({ error: 'bad date: ' + r.date }, 400);
          if (!['cash', 'phonepe', 'total'].includes(r.mode)) return J({ error: 'bad mode' }, 400);
          if (!okAmt(Number(r.amount))) return J({ error: 'bad amount on ' + r.date }, 400);
          dates.add(r.date);
        }
        const del = db.prepare('DELETE FROM sales WHERE date=?');
        const ins = db.prepare('INSERT INTO sales(date,amount,mode,kind,n,created) VALUES(?,?,?,?,?,?)');
        const q = [...dates].map((d) => del.bind(d));
        for (const r of b.import) {
          const kind = r.kind === 'past' ? 'past' : 'bulk';
          const n = kind === 'past' ? 1 : Math.max(0, Math.min(5000, parseInt(r.n) || 0));
          q.push(ins.bind(r.date, Number(r.amount), r.mode, kind, n, new Date(r.date + 'T12:00:00Z').getTime()));
        }
        for (let i = 0; i < q.length; i += 90) await db.batch(q.slice(i, i + 90));
        return J({ ok: true, days: dates.size });
      }

      const amount = Number(b.amount);
      if (!okAmt(amount)) return J({ error: 'bad amount' }, 400);
      if (b.mode !== 'cash' && b.mode !== 'phonepe') return J({ error: 'bad mode' }, 400);
      if (!isDate(b.date)) return J({ error: 'bad date' }, 400);
      const kind = b.kind === 'bulk' ? 'bulk' : 'sale';
      const n = kind === 'sale' ? 1 : Math.max(0, Math.min(5000, parseInt(b.n) || 0));
      await db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind('day1:' + b.date.slice(0, 4), b.date).run();
      const r = await db.prepare('INSERT INTO sales(date,amount,mode,kind,n,created) VALUES(?,?,?,?,?,?)').bind(b.date, amount, b.mode, kind, n, Date.now()).run();
      return J({ ok: true, id: r.meta && r.meta.last_row_id });
    }

    if (m === 'PATCH') {
      const b = await request.json().catch(() => ({}));
      const id = Number(b.id), amount = Number(b.amount);
      if (!id || !okAmt(amount)) return J({ error: 'bad edit' }, 400);
      const kind = b.kind === 'bulk' ? 'bulk' : 'sale';
      const n = kind === 'sale' ? 1 : Math.max(0, Math.min(5000, parseInt(b.n) || 0));
      await db.prepare('UPDATE sales SET amount=?,kind=?,n=? WHERE id=?').bind(amount, kind, n, id).run();
      return J({ ok: true });
    }

    if (m === 'DELETE') {
      const id = Number(new URL(request.url).searchParams.get('id'));
      if (!id) return J({ error: 'bad id' }, 400);
      await db.prepare('DELETE FROM sales WHERE id=?').bind(id).run();
      return J({ ok: true });
    }
    return J({ error: 'method' }, 405);
  } catch (e) {
    return J({ error: String(e && e.message || e) }, 500);
  }
}

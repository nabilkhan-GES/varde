import { handler } from '../src/server/routes/incidents';

export default async function (req: any, res: any) {
  try {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const data = await handler(params);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.setHeader('content-type', 'application/json');
    res.status(200).send(JSON.stringify(data));
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

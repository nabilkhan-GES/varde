import { handler } from '../src/server/routes/markets';

export default async function (_req: any, res: any) {
  try {
    const data = await handler();
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    res.setHeader('content-type', 'application/json');
    res.status(200).send(JSON.stringify(data));
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

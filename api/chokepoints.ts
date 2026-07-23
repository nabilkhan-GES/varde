import { handler } from '../src/server/routes/chokepoints';

export default async function (_req: any, res: any) {
  try {
    const data = await handler();
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.setHeader('content-type', 'application/json');
    res.status(200).send(JSON.stringify(data));
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

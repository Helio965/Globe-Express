import { success } from '@/lib/http';
export const dynamic = 'force-dynamic';
export function GET() { return success({ status: 'ok', application: 'World Explorer' }); }

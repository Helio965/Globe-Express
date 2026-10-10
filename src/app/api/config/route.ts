import { getExplorerConfig } from '@/lib/config';
import { success } from '@/lib/http';
export const dynamic = 'force-dynamic';
export function GET() { return success(getExplorerConfig()); }

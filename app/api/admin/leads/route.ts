import { NextResponse } from 'next/server';
import { getCapturedLeads, type CapturedLead } from '@/lib/redis-store';

function isAdmin(request: Request): boolean {
    return request.headers.get('x-admin-key') === process.env.ADMIN_PASSWORD;
}

function toCsv(rows: CapturedLead[]): string {
    const header = ['email', 'first_name', 'last_name', 'phone', 'source', 'kartra_synced', 'joined_at'];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = rows.map((r) => {
        const created = r.createdAt ?? (r as unknown as { timestamp?: number }).timestamp ?? 0;
        return [
            r.email,
            r.firstName || '',
            r.lastName || '',
            r.phone || '',
            r.source || '',
            r.kartraSynced ? 'yes' : 'no',
            created ? new Date(created).toISOString() : '',
        ].map((v) => escape(String(v))).join(',');
    });
    return [header.join(','), ...lines].join('\n');
}

function leadTime(r: CapturedLead): number {
    return r.createdAt ?? (r as unknown as { timestamp?: number }).timestamp ?? 0;
}

// Optional date filtering. `from`/`to` are yyyy-mm-dd (local-ish); `from` is
// inclusive from the start of that day, `to` inclusive through the end of it.
function filterByDate(leads: CapturedLead[], from: string | null, to: string | null): CapturedLead[] {
    let fromTs = -Infinity;
    let toTs = Infinity;
    if (from) {
        const t = new Date(`${from}T00:00:00`).getTime();
        if (!Number.isNaN(t)) fromTs = t;
    }
    if (to) {
        const t = new Date(`${to}T23:59:59.999`).getTime();
        if (!Number.isNaN(t)) toTs = t;
    }
    if (fromTs === -Infinity && toTs === Infinity) return leads;
    return leads.filter((r) => {
        const t = leadTime(r);
        return t >= fromTs && t <= toTs;
    });
}

// GET /api/admin/leads                          -> JSON list of real captured leads
// GET /api/admin/leads?format=csv               -> downloadable CSV of the real mailing list
// GET /api/admin/leads?from=2026-01-01&to=...    -> filter by signup date (works for JSON + CSV)
export async function GET(request: Request) {
    if (!isAdmin(request)) {
        return NextResponse.json(
            { error: 'Admin access required. Please check your admin password.' },
            { status: 401 }
        );
    }

    try {
        const params = new URL(request.url).searchParams;
        const format = params.get('format');
        const from = params.get('from');
        const to = params.get('to');

        const leads = filterByDate(await getCapturedLeads(), from, to);

        if (format === 'csv') {
            const rangeTag = from || to ? `-${from || 'start'}_to_${to || 'now'}` : '';
            const filename = `crate-leads${rangeTag}-${new Date().toISOString().slice(0, 10)}.csv`;
            return new NextResponse(toCsv(leads), {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                },
            });
        }

        return NextResponse.json({ success: true, count: leads.length, leads });
    } catch (error) {
        console.error('Get captured leads error:', error);
        return NextResponse.json(
            { error: 'Could not load leads. Please try again.' },
            { status: 500 }
        );
    }
}

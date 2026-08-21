import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { LeadStore, ActivityLogStore, LoginSessionStore } from '@/lib/store';

export async function GET(req) {
  try {
    const user = await verifyAuth(req);
    if (!user || !['salesperson', 'manager', 'owner', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized access.' },
        { status: 401 }
      );
    }

    const metrics = await LeadStore.getManagerMetrics(user._id);
    const stats = await ActivityLogStore.getUserStats(user._id);
    const sessionStats = await LoginSessionStore.getUserStats(user._id);
    
    const activeHours = (sessionStats.activeTimeSeconds || 0) / 3600;
    const callsPerHour = activeHours > 0 ? (stats.callsToday / activeHours).toFixed(1) : (stats.callsToday || 0);
    const bookingRate = metrics.contacted > 0 ? ((metrics.booked / metrics.contacted) * 100).toFixed(1) + '%' : '0%';

    return NextResponse.json({
      success: true,
      data: {
        ...metrics,
        ...stats,
        ...sessionStats,
        callsPerHour,
        bookingRate
      }
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err.message || 'Server error occurred.' },
      { status: 500 }
    );
  }
}

'use client';

import React, { useEffect, useState } from 'react';
import {
  DawgNavSection,
  KPIMetric,
  AppointmentItem,
  StaffScheduleItem,
  FunnelStage,
  GroomingRecord,
  AlertNotification,
} from '@/lib/types';
import {
  Calendar,
  DollarSign,
  UserPlus,
  PawPrint,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  ChevronDown,
  Plus,
  ShieldAlert,
  FileText,
  Cake,
  Package,
  BellRing,
  Users,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
  LabelList,
} from 'recharts';

interface DashboardViewProps {
  metrics: KPIMetric[];
  appointments: AppointmentItem[];
  staffSchedules: StaffScheduleItem[];
  bookingFunnel: FunnelStage[];
  groomingRecords: GroomingRecord[];
  alerts: AlertNotification[];
  onNavigateSection: (section: DawgNavSection) => void;
  onOpenQuickAction: (
    actionType: 'appointment' | 'customer' | 'pet' | 'intake' | 'payment' | 'invoice'
  ) => void;
  onSelectAppointment?: (appt: AppointmentItem) => void;
  onToggleAppointmentStatus?: (id: string) => void;
}

type KpiIconName = KPIMetric['iconName'];

const KPI_ICON_MAP: Partial<Record<KpiIconName, React.ComponentType<{ className?: string }>>> = {
  calendar: Calendar,
  'currency-dollar': DollarSign,
  'user-plus': UserPlus,
  'paw-print': PawPrint,
  'arrows-clockwise': RefreshCw,
};

const APPT_STATUS_STYLES: Record<
  string,
  { dot: string; badge: string }
> = {
  Scheduled: {
    dot: 'bg-info',
    badge: 'border-info/20 bg-info/10 text-info',
  },
  Confirmed: {
    dot: 'bg-info',
    badge: 'border-info/20 bg-info/10 text-info',
  },
  'Checked In': {
    dot: 'bg-warning',
    badge: 'border-warning/20 bg-warning/10 text-warning-foreground',
  },
  'In Progress': {
    dot: 'bg-primary',
    badge: 'border-primary/20 text-primary',
  },
  Completed: {
    dot: 'bg-success',
    badge: 'border-success/20 bg-success/10 text-success',
  },
  Canceled: {
    dot: 'bg-destructive',
    badge: 'border-destructive/20 bg-destructive/10 text-destructive',
  },
  Cancelled: {
    dot: 'bg-destructive',
    badge: 'border-destructive/20 bg-destructive/10 text-destructive',
  },
  'No Show': {
    dot: 'bg-muted-foreground',
    badge: 'border-border bg-muted text-muted-foreground',
  },
  Waitlisted: {
    dot: 'bg-muted-foreground',
    badge: 'border-border bg-muted text-muted-foreground',
  },
};

const ALERT_STYLES: Record<
  AlertNotification['type'],
  {
    Icon: React.ComponentType<{ className?: string }>;
    tile: string;
    iconColor: string;
    badge: string;
  }
> = {
  vaccination: {
    Icon: ShieldAlert,
    tile: 'bg-warning/10',
    iconColor: 'text-warning-foreground',
    badge: 'border-warning/20 bg-warning/10 text-warning-foreground',
  },
  document: {
    Icon: FileText,
    tile: 'bg-info/10',
    iconColor: 'text-info',
    badge: 'border-info/20 bg-info/10 text-info',
  },
  birthday: {
    Icon: Cake,
    tile: 'bg-success/10',
    iconColor: 'text-success',
    badge: 'border-success/20 bg-success/10 text-success',
  },
  inventory: {
    Icon: Package,
    tile: 'bg-destructive/10',
    iconColor: 'text-destructive',
    badge: 'border-destructive/20 bg-destructive/10 text-destructive',
  },
};

const STAFF_SLOT_STYLES: Record<string, string> = {
  booked: 'bg-primary',
  available: 'bg-border',
  break: 'bg-warning/60',
  blocked: 'bg-muted-foreground',
};

// Revenue figures come from /api/admin/reports/revenue (real
// commerce_payments aggregates). The previous hardcoded series
// (Mon $4,200 … total $34,341, +16.4%) was invented demo data and has
// been removed — the card now renders only what the API returns.
const REVENUE_PERIODS = ['This Week', 'This Month', 'Quarter'] as const;
type RevenuePeriod = (typeof REVENUE_PERIODS)[number];
const REVENUE_PERIOD_DAYS: Record<RevenuePeriod, number> = {
  'This Week': 7,
  'This Month': 30,
  Quarter: 90,
};

interface RevenueCardData {
  series: { day: string; amount: number }[];
  total: number;
  changePct: number | null;
  services: number;
  products: number;
  servicesShare: number;
  productsShare: number;
}

const FUNNEL_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function getAppointmentStyles(status: string) {
  return (
    APPT_STATUS_STYLES[status] ?? {
      dot: 'bg-muted-foreground',
      badge: 'border-border bg-muted text-muted-foreground',
    }
  );
}

function getStaffInitials(appt: AppointmentItem): string {
  if (appt.staffInitials) return appt.staffInitials;
  if (appt.staffName) {
    const parts = appt.staffName.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || '?';
  }
  return '?';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  metrics,
  appointments,
  staffSchedules,
  bookingFunnel,
  groomingRecords,
  alerts,
  onNavigateSection,
  onOpenQuickAction,
  onToggleAppointmentStatus,
}) => {
  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>('This Week');
  const [revenue, setRevenue] = useState<RevenueCardData | null>(null);

  const cycleRevenuePeriod = () => {
    const idx = REVENUE_PERIODS.indexOf(revenuePeriod);
    const next = REVENUE_PERIODS[(idx + 1) % REVENUE_PERIODS.length];
    setRevenuePeriod(next);
  };

  // Real revenue for the selected window: daily payment series for the
  // chart, window total + change vs the previous window, and the
  // operational services/products mix. Fetch failures leave the card in
  // its "No data yet" state rather than showing invented numbers.
  useEffect(() => {
    const days = REVENUE_PERIOD_DAYS[revenuePeriod];
    let cancelled = false;
    fetch(`/api/admin/reports/revenue?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        const series = (j.daily || []).map((d: any) => {
          const dt = new Date(d.day);
          return {
            day: days <= 7
              ? dt.toLocaleDateString('en-US', { weekday: 'short' })
              : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            amount: Number(d.revenue || 0),
          };
        });
        setRevenue({
          series,
          total: Number(j.window?.revenue ?? 0),
          changePct: j.window?.changePct ?? null,
          services: Number(j.breakdown?.services ?? 0),
          products: Number(j.breakdown?.products ?? 0),
          servicesShare: Number(j.breakdown?.servicesShare ?? 0),
          productsShare: Number(j.breakdown?.productsShare ?? 0),
        });
      })
      .catch(() => { /* keep "No data yet" */ });
    return () => { cancelled = true; };
  }, [revenuePeriod]);

  const visibleKpis = metrics.slice(0, 8);
  const visibleAppointments = appointments.slice(0, 5);
  const visibleRecords = groomingRecords.slice(0, 4);
  const visibleAlerts = alerts.slice(0, 4);

  const funnelTotal = bookingFunnel[0]?.count ?? 0;
  const funnelCompleted =
    bookingFunnel[bookingFunnel.length - 1]?.count ?? 0;
  const overallConversion =
    funnelTotal > 0
      ? ((funnelCompleted / funnelTotal) * 100).toFixed(1)
      : '0.0';
  const funnelHasData = bookingFunnel.some((s) => s.count > 0);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 bg-background p-6 text-foreground md:p-8">
      {/* 1. PAGE HEADER */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Today&apos;s Overview
          </h1>
          <p className="text-[13px] text-muted-foreground">
            A snapshot of daily operations, revenue, and alerts across your
            facility.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onNavigateSection('reports')}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onOpenQuickAction('appointment')}
          >
            <Plus className="size-4" />
            New Appointment
          </Button>
        </div>
      </header>

      {/* 2. KPI METRIC CARDS */}
      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        data-purpose="kpi-metrics-grid"
      >
        {visibleKpis.map((kpi) => {
          const Icon = KPI_ICON_MAP[kpi.iconName] ?? Calendar;
          const isRate = /rate|no show/i.test(kpi.label);
          const showUp = kpi.isPositive ? !isRate : isRate;
          const TrendIcon = showUp ? ArrowUpRight : ArrowDownRight;
          const trendBadgeClass = kpi.isPositive
            ? 'border-success/20 bg-success/10 text-success'
            : 'border-destructive/20 bg-destructive/10 text-destructive';

          return (
            <Card
              key={kpi.id}
              onClick={() => {
                // Navigate to a related section based on the metric's icon
                if (kpi.iconName === 'calendar') onNavigateSection('appointments');
                else if (kpi.iconName === 'currency-dollar')
                  onNavigateSection('payments');
                else if (kpi.iconName === 'user-plus')
                  onNavigateSection('customers');
                else onNavigateSection('reports');
              }}
              role="button"
              tabIndex={0}
              className="group cursor-pointer gap-3 px-5 py-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <CardHeader className="grid-rows-1 gap-0 px-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-primary text-primary">
                      <Icon className="size-4" />
                    </span>
                    <CardTitle className="text-[13px] font-medium text-muted-foreground">
                      {kpi.label}
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('gap-0.5 px-1.5 py-0 text-[10px] font-medium', trendBadgeClass)}
                  >
                    <TrendIcon className="size-3" />
                    {kpi.change}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <p className="font-display text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {kpi.value}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {kpi.period}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* 3. MID SECTION: APPOINTMENTS + REVENUE TREND */}
      <section
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
        data-purpose="primary-operations-grid"
      >
        {/* Today's Appointments */}
        <Card className="shadow-card lg:col-span-5">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-[15px] font-semibold tracking-tight">
                  Today&apos;s Appointments
                </CardTitle>
                <CardDescription className="text-[12px]">
                  {appointments.length} scheduled across the day
                </CardDescription>
              </div>
              <CardAction>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-7 px-2 text-[12px] text-primary"
                  onClick={() => onNavigateSection('calendar')}
                >
                  View Calendar
                  <ArrowRight className="size-3.5" />
                </Button>
              </CardAction>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {visibleAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Calendar className="size-5 text-muted-foreground/60" />
                <p className="text-[12px] text-muted-foreground">
                  No appointments today
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visibleAppointments.map((appt) => {
                  const styles = getAppointmentStyles(appt.status);
                  const initials = getStaffInitials(appt);
                  return (
                    <li key={appt.id}>
                      <button
                        type="button"
                        onClick={() =>
                          onToggleAppointmentStatus?.(appt.id)
                        }
                        className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/40 -mx-2 px-2 rounded-lg"
                      >
                        <span
                          className={cn(
                            'size-1.5 shrink-0 rounded-full',
                            styles.dot
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-foreground">
                              {appt.petName}
                            </span>
                            <span className="truncate text-[11px] text-muted-foreground">
                              {appt.breed}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {appt.serviceName}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[12px] tabular-nums text-muted-foreground">
                            {appt.time ?? '—'}
                          </span>
                          <Avatar className="size-5 ring-1 ring-border">
                            <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'shrink-0 px-1.5 py-0 text-[10px] font-medium',
                            styles.badge
                          )}
                        >
                          {appt.status}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Separator className="my-3" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px] text-primary hover:bg-primary/5"
              onClick={() => onNavigateSection('appointments')}
            >
              View all appointments
              <ArrowRight className="size-3.5" />
            </Button>
          </CardContent>
        </Card>

        {/* Revenue Overview */}
        <Card className="shadow-card lg:col-span-7">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-[15px] font-semibold tracking-tight">
                  Revenue Overview
                </CardTitle>
                <CardDescription className="text-[12px]">
                  {revenuePeriod === 'This Week'
                    ? 'Last 7 days'
                    : revenuePeriod === 'This Month'
                      ? 'Last 30 days'
                      : 'Last 90 days'}
                </CardDescription>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-xl font-semibold tracking-tight tabular-nums text-foreground">
                  {revenue ? formatCurrency(revenue.total) : '—'}
                </span>
                {revenue?.changePct != null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'gap-0.5 px-1.5 py-0 text-[10px] font-medium',
                      revenue.changePct >= 0
                        ? 'border-success/20 bg-success/10 text-success'
                        : 'border-destructive/20 bg-destructive/10 text-destructive'
                    )}
                  >
                    {revenue.changePct >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                    {Math.abs(revenue.changePct)}% vs prior
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px] font-medium"
                  onClick={cycleRevenuePeriod}
                >
                  {revenuePeriod}
                  <ChevronDown className="size-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenue?.series ?? []}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="revenueGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    tickFormatter={(v) => `$${Number(v) / 1000}K`}
                  />
                  <RechartsTooltip
                    cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                    contentStyle={{
                      backgroundColor: 'var(--popover)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 8px -2px rgb(15 23 42 / 0.06)',
                      color: 'var(--popover-foreground)',
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                    labelStyle={{
                      color: 'var(--muted-foreground)',
                      marginBottom: '2px',
                    }}
                    formatter={(value) => [
                      formatCurrency(Number(value)),
                      'Revenue',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: 'var(--chart-1)',
                      stroke: 'var(--background)',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <Separator className="my-4" />
            {revenue && (revenue.services > 0 || revenue.products > 0) ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Services', amount: revenue.services, share: revenue.servicesShare },
                    { label: 'Products', amount: revenue.products, share: revenue.productsShare },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="font-display text-[15px] font-semibold tabular-nums text-foreground">
                        {formatCurrency(item.amount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.share}% of mix
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Operational mix — completed appointments vs shop orders in this window.
                </p>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                No data yet — no completed appointments or shop orders in this window.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 4. LOWER SECTION: FUNNEL + RECORDS + ALERTS */}
      <section
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
        data-purpose="funnel-records-alerts-grid"
      >
        {/* Bookings Funnel */}
        <Card className="shadow-card lg:col-span-4">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-[15px] font-semibold tracking-tight">
              Bookings Funnel
            </CardTitle>
            <CardDescription className="text-[12px]">
              Last 30 days · visit to completed
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {funnelHasData ? (
            <>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bookingFunnel}
                  layout="vertical"
                  margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                  barCategoryGap={8}
                >
                  <CartesianGrid
                    horizontal={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    type="number"
                    hide
                  />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tickLine={false}
                    axisLine={false}
                    width={108}
                    tick={{
                      fill: 'var(--muted-foreground)',
                      fontSize: 11,
                    }}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'var(--accent)', opacity: 0.3 }}
                    contentStyle={{
                      backgroundColor: 'var(--popover)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 8px -2px rgb(15 23 42 / 0.06)',
                      color: 'var(--popover-foreground)',
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                    formatter={(value, name, item) => {
                      const conversion = (item?.payload as FunnelStage | undefined)
                        ?.conversionPercent;
                      return [
                        `${Number(value).toLocaleString()} · ${conversion ?? '—'}`,
                        'Count',
                      ];
                    }}
                  />
                  <Bar dataKey="count" radius={4} barSize={18}>
                    {bookingFunnel.map((_, idx) => (
                      <Cell
                        key={`funnel-cell-${idx}`}
                        fill={FUNNEL_COLORS[idx % FUNNEL_COLORS.length]}
                      />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      style={{
                        fill: 'var(--muted-foreground)',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Separator className="my-3" />
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Overall conversion</span>
              <span className="font-semibold tabular-nums text-foreground">
                {overallConversion}%
              </span>
            </div>
            </>
            ) : (
              <p className="py-6 text-[12px] text-muted-foreground">
                No data yet — no booking funnel events recorded in the last 30 days.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Grooming Records */}
        <Card className="shadow-card lg:col-span-4">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-[15px] font-semibold tracking-tight">
                Recent Service Records
              </CardTitle>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-7 px-2 text-[12px] text-primary"
                onClick={() => onNavigateSection('grooming-records')}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {visibleRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <PawPrint className="size-5 text-muted-foreground/60" />
                <p className="text-[12px] text-muted-foreground">
                  No recent grooming records
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visibleRecords.map((rec) => (
                  <li
                    key={rec.id}
                    className="flex items-center gap-3 py-3"
                  >
                    <span className="flex size-5 items-center justify-center">
                      <span aria-hidden>{rec.petEmoji}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {rec.petName}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {rec.breed} · {rec.groomer}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-foreground">
                        ${rec.amount.toFixed(2)}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          'mt-0.5 px-1.5 py-0 text-[9px] font-medium',
                          rec.status === 'Paid'
                            ? 'border-success/20 bg-success/10 text-success'
                            : rec.status === 'Pending'
                              ? 'border-warning/20 bg-warning/10 text-warning-foreground'
                              : 'border-destructive/20 bg-destructive/10 text-destructive'
                        )}
                      >
                        {rec.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Alerts & Reminders */}
        <Card className="shadow-card lg:col-span-4">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-5 items-center justify-center">
                  <BellRing className="size-4" />
                </span>
                <CardTitle className="text-[15px] font-semibold tracking-tight">
                  Alerts &amp; Reminders
                </CardTitle>
              </div>
              <Badge
                variant="outline"
                className="border-border bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
              >
                {alerts.length} active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {visibleAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <BellRing className="size-5 text-muted-foreground/60" />
                <p className="text-[12px] text-muted-foreground">
                  No active alerts
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {visibleAlerts.map((alert) => {
                  const style =
                    ALERT_STYLES[alert.type] ?? ALERT_STYLES.inventory;
                  const { Icon } = style;
                  const handleNavigate = () => {
                    if (alert.type === 'vaccination' || alert.type === 'birthday')
                      onNavigateSection('pets');
                    else if (alert.type === 'document')
                      onNavigateSection('documents');
                    else onNavigateSection('inventory');
                  };
                  return (
                    <li key={alert.id}>
                      <button
                        type="button"
                        onClick={handleNavigate}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:opacity-90',
                          style.tile
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-lg bg-card shadow-card',
                            style.iconColor
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-foreground">
                            {alert.title}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {alert.description}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'shrink-0 tabular-nums px-1.5 py-0 text-[10px] font-semibold',
                            style.badge
                          )}
                        >
                          {alert.count}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Separator className="my-3" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px] text-primary hover:bg-primary/5"
              onClick={() => onNavigateSection('appointments')}
            >
              View all alerts
              <ArrowRight className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* 5. STAFF SCHEDULE + QUICK ACTIONS */}
      <section
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
        data-purpose="staff-and-quick-actions"
      >
        {/* Staff Schedule */}
        <Card className="shadow-card lg:col-span-8">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-primary text-primary">
                  <Users className="size-4" />
                </span>
                <CardTitle className="text-[15px] font-semibold tracking-tight">
                  Today&apos;s Schedule
                </CardTitle>
              </div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-7 px-2 text-[12px] text-primary"
                onClick={() => onNavigateSection('schedule')}
              >
                View Full Schedule
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="space-y-3">
              {staffSchedules.map((staff) => (
                <li
                  key={staff.id}
                  className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
                >
                  <Avatar className="size-8 ring-1 ring-border">
                    <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                      {staff.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 w-32 shrink-0">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {staff.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {staff.role}
                    </p>
                  </div>
                  <div className="flex flex-1 items-center gap-1">
                    {staff.slots.map((slot, idx) => (
                      <span
                        key={`${staff.id}-slot-${idx}`}
                        title={`${staff.name} · Slot ${idx + 1}: ${slot}`}
                        className={cn(
                          'h-5 flex-1 rounded-sm transition-colors',
                          STAFF_SLOT_STYLES[slot] ?? 'bg-border'
                        )}
                      />
                    ))}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[14px] font-semibold tabular-nums text-foreground">
                      {staff.appointmentsCount}
                    </span>
                    <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      appts
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Separator className="my-3" />
            <div className="flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
              {[
                { label: 'Booked', cls: 'bg-primary' },
                { label: 'Available', cls: 'bg-border' },
                { label: 'Break', cls: 'bg-warning/60' },
                { label: 'Blocked', cls: 'bg-muted-foreground' },
              ].map((item) => (
                <span
                  key={item.label}
                  className="flex items-center gap-1.5"
                >
                  <span
                    className={cn('size-2 rounded-sm', item.cls)}
                    aria-hidden
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="shadow-card lg:col-span-4">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-primary text-primary">
                <Plus className="size-4" />
              </span>
              <CardTitle className="text-[15px] font-semibold tracking-tight">
                Quick Actions
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                size="sm"
                className="h-9 justify-start px-3 text-[12px] font-medium shadow-card bg-brand text-brand-foreground hover:bg-brand/90"
                onClick={() => onOpenQuickAction('appointment')}
              >
                <Calendar className="size-4" />
                New Appointment
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 justify-start px-3 text-[12px] font-medium shadow-card bg-brand text-brand-foreground hover:bg-brand/90"
                onClick={() => onOpenQuickAction('customer')}
              >
                <UserPlus className="size-4" />
                Add Customer
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 justify-start px-3 text-[12px] font-medium shadow-card bg-brand text-brand-foreground hover:bg-brand/90"
                onClick={() => onOpenQuickAction('pet')}
              >
                <PawPrint className="size-4" />
                Add Pet
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 justify-start px-3 text-[12px] font-medium shadow-card bg-quick text-quick-foreground hover:bg-quick/90"
                onClick={() => onOpenQuickAction('intake')}
              >
                <FileText className="size-4" />
                Intake Form
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 justify-start px-3 text-[12px] font-medium shadow-card bg-quick text-quick-foreground hover:bg-quick/90"
                onClick={() => onOpenQuickAction('payment')}
              >
                <DollarSign className="size-4" />
                Take Payment
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 justify-start px-3 text-[12px] font-medium shadow-card bg-quick text-quick-foreground hover:bg-quick/90"
                onClick={() => onOpenQuickAction('invoice')}
              >
                <FileText className="size-4" />
                New Invoice
              </Button>
            </div>
            <Separator className="my-3" />
            <Button
              type="button"
              size="sm"
              className="h-8 w-full justify-center px-2 text-[12px] font-medium bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => onNavigateSection('settings')}
            >
              <ArrowRight className="size-3.5" />
              More Actions
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

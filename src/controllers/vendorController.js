const User = require('../models/User');
const Customer = require('../models/Customer');
const Delivery = require('../models/Delivery');
const Bill = require('../models/Bill');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const RANGE_DAYS = {
  last7days: 7,
  last30days: 30,
  last90days: 90,
  last180days: 180,
  last365days: 365,
};

const toUtcStartOfDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

const toUtcEndOfDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

const formatDateKey = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatMonthKey = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getWeekStartUtc = (date) => {
  const dt = toUtcStartOfDay(new Date(date));
  const day = dt.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return toUtcStartOfDay(dt);
};

const getWeekdayShort = (date) => {
  const day = date.getUTCDay();
  return WEEKDAY_ORDER[(day + 6) % 7];
};

const parseDateRange = (range, startDateRaw, endDateRaw) => {
  const now = new Date();
  const fallbackEnd = toUtcEndOfDay(now);

  if (range === 'custom' && startDateRaw && endDateRaw) {
    const customStart = new Date(startDateRaw);
    const customEnd = new Date(endDateRaw);

    if (!Number.isNaN(customStart.getTime()) && !Number.isNaN(customEnd.getTime()) && customStart <= customEnd) {
      return {
        rangeKey: 'custom',
        startDate: toUtcStartOfDay(customStart),
        endDate: toUtcEndOfDay(customEnd),
      };
    }
  }

  const normalizedRange = RANGE_DAYS[range] ? range : 'last30days';
  const days = RANGE_DAYS[normalizedRange];
  const startDate = toUtcStartOfDay(new Date(fallbackEnd));
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

  return {
    rangeKey: normalizedRange,
    startDate,
    endDate: fallbackEnd,
  };
};

const getTrendGranularity = (startDate, endDate) => {
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.round((endDate - startDate) / msPerDay) + 1);

  if (totalDays <= 45) return 'daily';
  if (totalDays <= 180) return 'weekly';
  return 'monthly';
};

const createTrendBuckets = (startDate, endDate, granularity) => {
  const buckets = [];

  if (granularity === 'daily') {
    const cursor = toUtcStartOfDay(new Date(startDate));
    while (cursor <= endDate) {
      const key = formatDateKey(cursor);
      buckets.push({
        key,
        label: `${String(cursor.getUTCDate()).padStart(2, '0')} ${MONTHS[cursor.getUTCMonth()]}`,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return buckets;
  }

  if (granularity === 'weekly') {
    const cursor = getWeekStartUtc(startDate);
    while (cursor <= endDate) {
      const key = formatDateKey(cursor);
      buckets.push({
        key,
        label: `Week ${String(cursor.getUTCDate()).padStart(2, '0')} ${MONTHS[cursor.getUTCMonth()]}`,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return buckets;
  }

  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  while (cursor <= endDate) {
    const key = formatMonthKey(cursor);
    buckets.push({ key, label: `${MONTHS[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(-2)}` });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
};

const getBucketKeyForDate = (date, granularity) => {
  if (granularity === 'daily') return formatDateKey(date);
  if (granularity === 'weekly') return formatDateKey(getWeekStartUtc(date));
  return formatMonthKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
};

const getMonthIndex = (year, monthIndexBasedOne) => year * 12 + (monthIndexBasedOne - 1);

const getIstHour = (date) => {
  const parts = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).formatToParts(date);

  const hourPart = parts.find((part) => part.type === 'hour')?.value;
  const parsed = Number.parseInt(hourPart, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(23, parsed));
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    console.error('❌ GetProfile error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, businessName, logoUrl } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, businessName, logoUrl },
      { new: true, runValidators: true }
    ).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    console.error('❌ UpdateProfile error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

const getAdvancedAnalytics = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { range = 'last30days', startDate: startDateRaw, endDate: endDateRaw } = req.query;

    const { rangeKey, startDate, endDate } = parseDateRange(range, startDateRaw, endDateRaw);
    const granularity = getTrendGranularity(startDate, endDate);

    const startMonthIndex = getMonthIndex(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1);
    const endMonthIndex = getMonthIndex(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1);

    const [deliveries, billsRaw, totalActiveCustomers] = await Promise.all([
      Delivery.find({
        vendorId,
        date: { $gte: startDate, $lte: endDate },
      })
        .populate('customerId', 'name mobile')
        .lean(),
      Bill.find({
        vendorId,
        year: {
          $gte: startDate.getUTCFullYear(),
          $lte: endDate.getUTCFullYear(),
        },
      })
        .populate('customerId', 'name mobile')
        .lean(),
      Customer.countDocuments({ vendorId, isActive: true }),
    ]);

    const bills = billsRaw.filter((bill) => {
      const monthIndex = getMonthIndex(bill.year, bill.month);
      return monthIndex >= startMonthIndex && monthIndex <= endMonthIndex;
    });

    const trendBuckets = createTrendBuckets(startDate, endDate, granularity);
    const trendMap = new Map(
      trendBuckets.map((bucket) => [
        bucket.key,
        {
          period: bucket.label,
          deliveries: 0,
          uniqueCustomersSet: new Set(),
        },
      ])
    );

    const monthlyMap = new Map();
    const weekdayMap = new Map(WEEKDAY_ORDER.map((day) => [day, { day, deliveries: 0, occurrences: 0 }]));
    const hourlyMap = new Map(Array.from({ length: 24 }, (_, hour) => [hour, 0]));
    const customerMap = new Map();

    for (const delivery of deliveries) {
      const deliveryDate = new Date(delivery.date);
      const bucketKey = getBucketKeyForDate(deliveryDate, granularity);
      const quantity = Number(delivery.totalQuantity || 0);
      const customerId = delivery.customerId?._id?.toString() || delivery.customerId?.toString();

      if (trendMap.has(bucketKey)) {
        const trend = trendMap.get(bucketKey);
        trend.deliveries += quantity;
        if (customerId) {
          trend.uniqueCustomersSet.add(customerId);
        }
      }

      const weekday = getWeekdayShort(deliveryDate);
      if (weekdayMap.has(weekday)) {
        weekdayMap.get(weekday).deliveries += quantity;
      }

      if (Array.isArray(delivery.entries) && delivery.entries.length > 0) {
        for (const entry of delivery.entries) {
          const entryQty = Number(entry.quantity || 0);
          const entryTime = new Date(entry.time || delivery.createdAt || delivery.date);
          const entryHour = getIstHour(entryTime);
          hourlyMap.set(entryHour, (hourlyMap.get(entryHour) || 0) + entryQty);
        }
      } else {
        const fallbackHour = getIstHour(new Date(delivery.createdAt || delivery.date));
        hourlyMap.set(fallbackHour, (hourlyMap.get(fallbackHour) || 0) + quantity);
      }

      if (customerId) {
        const existing = customerMap.get(customerId) || {
          customerId,
          name: delivery.customerId?.name || 'Unknown',
          mobile: delivery.customerId?.mobile || '',
          deliveries: 0,
          revenue: 0,
          collected: 0,
          pending: 0,
          billCount: 0,
          lastDeliveryDate: null,
        };

        existing.deliveries += quantity;
        if (!existing.lastDeliveryDate || new Date(existing.lastDeliveryDate) < deliveryDate) {
          existing.lastDeliveryDate = deliveryDate;
        }

        customerMap.set(customerId, existing);
      }
    }

    let totalRevenue = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let paidAmount = 0;
    let partialAmount = 0;
    let unpaidAmount = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    const agingBuckets = {
      '0-30 days': { bucket: '0-30 days', amount: 0, count: 0, color: '#f59e0b' },
      '31-60 days': { bucket: '31-60 days', amount: 0, count: 0, color: '#f97316' },
      '61-90 days': { bucket: '61-90 days', amount: 0, count: 0, color: '#ef4444' },
      '90+ days': { bucket: '90+ days', amount: 0, count: 0, color: '#7f1d1d' },
    };

    for (const bill of bills) {
      const revenue = Number(bill.totalAmount || 0);
      const collected = Math.max(0, Math.min(revenue, Number(bill.paidAmount || 0)));
      const pending = Math.max(0, revenue - collected);

      const monthDate = new Date(Date.UTC(bill.year, bill.month - 1, 1));
      const monthKey = formatMonthKey(monthDate);

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          period: `${MONTHS[monthDate.getUTCMonth()]} ${String(monthDate.getUTCFullYear()).slice(-2)}`,
          revenue: 0,
          collected: 0,
          pending: 0,
          bills: 0,
        });
      }

      const monthItem = monthlyMap.get(monthKey);
      monthItem.revenue += revenue;
      monthItem.collected += collected;
      monthItem.pending += pending;
      monthItem.bills += 1;

      totalRevenue += revenue;
      totalCollected += collected;
      totalPending += pending;

      if (pending === 0) {
        paidAmount += revenue;
        paidCount += 1;
      } else if (collected > 0) {
        partialAmount += revenue;
        partialCount += 1;
      } else {
        unpaidAmount += revenue;
        unpaidCount += 1;
      }

      if (pending > 0) {
        const ageDays = Math.max(
          0,
          Math.floor((toUtcEndOfDay(endDate).getTime() - toUtcStartOfDay(monthDate).getTime()) / (1000 * 60 * 60 * 24))
        );

        if (ageDays <= 30) {
          agingBuckets['0-30 days'].amount += pending;
          agingBuckets['0-30 days'].count += 1;
        } else if (ageDays <= 60) {
          agingBuckets['31-60 days'].amount += pending;
          agingBuckets['31-60 days'].count += 1;
        } else if (ageDays <= 90) {
          agingBuckets['61-90 days'].amount += pending;
          agingBuckets['61-90 days'].count += 1;
        } else {
          agingBuckets['90+ days'].amount += pending;
          agingBuckets['90+ days'].count += 1;
        }
      }

      const customerId = bill.customerId?._id?.toString() || bill.customerId?.toString();
      if (customerId) {
        const existing = customerMap.get(customerId) || {
          customerId,
          name: bill.customerId?.name || 'Unknown',
          mobile: bill.customerId?.mobile || '',
          deliveries: 0,
          revenue: 0,
          collected: 0,
          pending: 0,
          billCount: 0,
          lastDeliveryDate: null,
        };

        existing.revenue += revenue;
        existing.collected += collected;
        existing.pending += pending;
        existing.billCount += 1;

        customerMap.set(customerId, existing);
      }
    }

    const weekdayOccurrences = new Map(WEEKDAY_ORDER.map((day) => [day, 0]));
    const weekdayCursor = toUtcStartOfDay(new Date(startDate));
    while (weekdayCursor <= endDate) {
      const day = getWeekdayShort(weekdayCursor);
      weekdayOccurrences.set(day, (weekdayOccurrences.get(day) || 0) + 1);
      weekdayCursor.setUTCDate(weekdayCursor.getUTCDate() + 1);
    }

    for (const day of WEEKDAY_ORDER) {
      const weekdayData = weekdayMap.get(day);
      weekdayData.occurrences = weekdayOccurrences.get(day) || 1;
      weekdayData.average = Number((weekdayData.deliveries / Math.max(1, weekdayData.occurrences)).toFixed(2));
      weekdayData.isWeekend = day === 'Sat' || day === 'Sun';
    }

    const deliveryTrend = trendBuckets.map((bucket) => {
      const bucketData = trendMap.get(bucket.key);
      return {
        period: bucketData.period,
        deliveries: bucketData.deliveries,
        activeCustomers: bucketData.uniqueCustomersSet.size,
      };
    });

    const billingTrend = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, value]) => value);

    const weekdayPattern = WEEKDAY_ORDER.map((day) => weekdayMap.get(day));

    const hourlyPattern = Array.from({ length: 24 }, (_, hour) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      deliveries: hourlyMap.get(hour) || 0,
    }));

    const paymentTotalAmount = paidAmount + partialAmount + unpaidAmount;
    const paymentMix = [
      {
        name: 'Paid',
        value: paidAmount,
        percentage: paymentTotalAmount ? Number(((paidAmount / paymentTotalAmount) * 100).toFixed(1)) : 0,
        count: paidCount,
        color: '#10b981',
      },
      {
        name: 'Partial',
        value: partialAmount,
        percentage: paymentTotalAmount ? Number(((partialAmount / paymentTotalAmount) * 100).toFixed(1)) : 0,
        count: partialCount,
        color: '#f59e0b',
      },
      {
        name: 'Unpaid',
        value: unpaidAmount,
        percentage: paymentTotalAmount ? Number(((unpaidAmount / paymentTotalAmount) * 100).toFixed(1)) : 0,
        count: unpaidCount,
        color: '#ef4444',
      },
    ];

    const topCustomers = Array.from(customerMap.values())
      .map((customer) => ({
        ...customer,
        avgBillValue: customer.billCount > 0 ? Number((customer.revenue / customer.billCount).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const topDefaulters = Array.from(customerMap.values())
      .filter((customer) => customer.pending > 0)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 5);

    const uniqueActiveCustomers = new Set(Array.from(customerMap.keys()));
    const totalDeliveries = deliveries.reduce((sum, delivery) => sum + Number(delivery.totalQuantity || 0), 0);
    const totalBills = bills.length;
    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays = Math.max(1, Math.round((endDate - startDate) / msPerDay) + 1);

    const kpis = {
      totalRevenue,
      totalCollected,
      totalPending,
      totalDeliveries,
      totalBills,
      activeCustomers: uniqueActiveCustomers.size,
      customerBase: totalActiveCustomers,
      collectionEfficiency: totalRevenue > 0 ? Number(((totalCollected / totalRevenue) * 100).toFixed(1)) : 0,
      avgRevenuePerCustomer: uniqueActiveCustomers.size > 0 ? Number((totalRevenue / uniqueActiveCustomers.size).toFixed(2)) : 0,
      avgDailyDeliveries: Number((totalDeliveries / totalDays).toFixed(2)),
    };

    const peakWeekday = weekdayPattern.reduce(
      (max, item) => (item.deliveries > max.deliveries ? item : max),
      { day: 'Mon', deliveries: 0 }
    );

    const alerts = {
      collectionGap: Math.max(0, totalRevenue - totalCollected),
      highRiskCustomers: topDefaulters.filter((customer) => customer.pending >= 2000).length,
      peakWeekday: peakWeekday.day,
      peakWeekdayDeliveries: peakWeekday.deliveries,
    };

    res.json({
      success: true,
      range: {
        key: rangeKey,
        granularity,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalDays,
      },
      kpis,
      deliveryTrend,
      billingTrend,
      weekdayPattern,
      hourlyPattern,
      paymentMix,
      receivablesAging: Object.values(agingBuckets),
      topCustomers,
      topDefaulters,
      alerts,
    });
  } catch (error) {
    console.error('❌ GetAdvancedAnalytics error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics dashboard.' });
  }
};

const getDashboard = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const now = new Date();
    // Use UTC dates to match how delivery dates are stored (UTC midnight)
    const todayUTC     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayStart   = todayUTC;
    const todayEnd     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
    const monthStart   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

    const [totalCustomers, todayDeliveries, monthlyBills, pendingBills] = await Promise.all([
      Customer.countDocuments({ vendorId, isActive: true }),
      Delivery.find({ vendorId, date: { $gte: todayStart, $lte: todayEnd } })
        .populate('customerId', 'name address'),
      Bill.find({ vendorId, month: now.getMonth() + 1, year: now.getFullYear() }),
      Bill.find({ vendorId, status: 'unpaid' }),
    ]);

    // NEW schema: each delivery day-doc has totalQuantity (sum of all entries)
    const todayCans = todayDeliveries.reduce((sum, d) => sum + (d.totalQuantity || 0), 0);
    const monthlyEarnings = monthlyBills.filter(b => b.status === 'paid').reduce((sum, b) => sum + b.totalAmount, 0);
    const pendingAmount   = pendingBills.reduce((sum, b) => sum + b.totalAmount, 0);

    res.json({
      success: true,
      stats: { totalCustomers, todayCans, monthlyEarnings, pendingAmount, pendingBillsCount: pendingBills.length },
      recentDeliveries: todayDeliveries,
    });
  } catch (error) {
    console.error('❌ GetDashboard error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard.' });
  }
};

module.exports = { getProfile, updateProfile, getDashboard, getAdvancedAnalytics };

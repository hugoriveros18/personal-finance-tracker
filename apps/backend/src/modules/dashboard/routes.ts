import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { monthRange, formatYYYYMM, yearRange } from '../../shared/dates.js';
import { monthSchema } from '../../shared/zod.js';

const dashboardQuerySchema = z.object({
  month: monthSchema.optional(),
  year: z.coerce.number().int().min(1900).max(3000).optional(),
});

const TOP_N = 5;
const RECENT_LIMIT = 10;

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', { schema: { querystring: dashboardQuerySchema } }, async (req) => {
    const now = new Date();
    const monthStr = req.query.month ?? formatYYYYMM(now);
    const yearNum = req.query.year ?? Number(monthStr.split('-')[0]);
    const { from: monthFrom, to: monthTo } = monthRange(monthStr);
    const { from: yearFrom, to: yearTo } = yearRange(yearNum);
    const userId = req.userId;

    const [
      accounts,
      txMonth,
      lpMonth,
      movMonth,
      txYear,
      lpYear,
      movYear,
      categoriesAll,
      recentTx,
      recentMov,
      recentLp,
    ] = await Promise.all([
      app.prisma.account.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      }),
      app.prisma.transaction.findMany({
        where: { userId, date: { gte: monthFrom, lte: monthTo } },
        select: { type: true, amount: true, accountId: true, categoryId: true },
      }),
      app.prisma.liabilityPayment.findMany({
        where: { userId, date: { gte: monthFrom, lte: monthTo } },
        select: { amount: true, accountId: true },
      }),
      app.prisma.movement.findMany({
        where: { userId, date: { gte: monthFrom, lte: monthTo } },
        select: { flow: true, amount: true },
      }),
      app.prisma.transaction.findMany({
        where: { userId, date: { gte: yearFrom, lte: yearTo } },
        select: { type: true, amount: true, date: true, categoryId: true },
      }),
      app.prisma.liabilityPayment.findMany({
        where: { userId, date: { gte: yearFrom, lte: yearTo } },
        select: { amount: true, date: true },
      }),
      app.prisma.movement.findMany({
        where: { userId, date: { gte: yearFrom, lte: yearTo } },
        select: { flow: true, amount: true, date: true },
      }),
      app.prisma.category.findMany({ where: { userId } }),
      app.prisma.transaction.findMany({
        where: { userId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: RECENT_LIMIT,
      }),
      app.prisma.movement.findMany({
        where: { userId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      app.prisma.liabilityPayment.findMany({
        where: { userId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
    ]);

    const catName = new Map(categoriesAll.map((c) => [c.id, c.name] as const));
    const categoryType = new Map(categoriesAll.map((c) => [c.id, c.type] as const));

    // Totals (today snapshot)
    const totals = accounts.reduce(
      (acc, a) => {
        acc.availableBalanceTotal += Number(a.availableBalance);
        acc.savingsBalanceTotal += Number(a.savingsBalance);
        acc.liabilitiesBalanceTotal += Number(a.liabilitiesBalance);
        return acc;
      },
      { availableBalanceTotal: 0, savingsBalanceTotal: 0, liabilitiesBalanceTotal: 0, netWorth: 0 },
    );
    totals.netWorth =
      totals.availableBalanceTotal + totals.savingsBalanceTotal - totals.liabilitiesBalanceTotal;

    // Month summary
    let income = 0;
    let expenses = 0;
    let newLiabilities = 0;
    for (const t of txMonth) {
      const v = Number(t.amount);
      if (t.type === 'income') income += v;
      else if (t.type === 'expense') expenses += v;
      else newLiabilities += v;
    }
    const liabilityPaymentsTotal = lpMonth.reduce((acc, p) => acc + Number(p.amount), 0);
    let savingsChange = 0;
    for (const m of movMonth) {
      const v = Number(m.amount);
      if (m.flow === 'INTRA_AVAILABLE_TO_SAVINGS') savingsChange += v;
      else if (m.flow === 'INTRA_SAVINGS_TO_AVAILABLE') savingsChange -= v;
    }
    const monthSummary = {
      income,
      expenses,
      newLiabilities,
      liabilityPayments: liabilityPaymentsTotal,
      movementsCount: movMonth.length,
      savingsChange,
      flow: income - expenses,
    };

    // By category for the month (expense + liability combined as "expenses")
    const incomeByCategory = new Map<string, number>();
    const expensesByCategory = new Map<string, number>();
    for (const t of txMonth) {
      const v = Number(t.amount);
      if (t.type === 'income') {
        incomeByCategory.set(t.categoryId, (incomeByCategory.get(t.categoryId) ?? 0) + v);
      } else {
        expensesByCategory.set(t.categoryId, (expensesByCategory.get(t.categoryId) ?? 0) + v);
      }
    }
    const toBreakdown = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([categoryId, total]) => ({
          categoryId,
          name: catName.get(categoryId) ?? '',
          type: categoryType.get(categoryId) ?? null,
          total,
        }))
        .sort((a, b) => b.total - a.total);

    const byCategoryMonth = {
      income: toBreakdown(incomeByCategory),
      expense: toBreakdown(expensesByCategory),
    };

    // Top categories (year)
    const incomeByCategoryYear = new Map<string, number>();
    const expensesByCategoryYear = new Map<string, number>();
    for (const t of txYear) {
      const v = Number(t.amount);
      if (t.type === 'income') {
        incomeByCategoryYear.set(t.categoryId, (incomeByCategoryYear.get(t.categoryId) ?? 0) + v);
      } else {
        expensesByCategoryYear.set(
          t.categoryId,
          (expensesByCategoryYear.get(t.categoryId) ?? 0) + v,
        );
      }
    }
    const topYear = (m: Map<string, number>) => toBreakdown(m).slice(0, TOP_N);
    const topCategoriesYear = {
      income: topYear(incomeByCategoryYear),
      expense: topYear(expensesByCategoryYear),
    };
    const topCategoriesMonth = {
      income: byCategoryMonth.income.slice(0, TOP_N),
      expense: byCategoryMonth.expense.slice(0, TOP_N),
    };

    // By account (month)
    const byAccountMap = new Map<
      string,
      { income: number; expenses: number; newLiabilities: number; liabilityPayments: number }
    >();
    for (const a of accounts) {
      byAccountMap.set(a.id, { income: 0, expenses: 0, newLiabilities: 0, liabilityPayments: 0 });
    }
    for (const t of txMonth) {
      const ent = byAccountMap.get(t.accountId);
      if (!ent) continue;
      const v = Number(t.amount);
      if (t.type === 'income') ent.income += v;
      else if (t.type === 'expense') ent.expenses += v;
      else ent.newLiabilities += v;
    }
    for (const p of lpMonth) {
      const ent = byAccountMap.get(p.accountId);
      if (!ent) continue;
      ent.liabilityPayments += Number(p.amount);
    }
    const byAccount = accounts.map((a) => ({
      accountId: a.id,
      name: a.name,
      ...byAccountMap.get(a.id)!,
    }));

    // Trend (year, monthly buckets)
    const months = Array.from(
      { length: 12 },
      (_, i) => `${yearNum}-${String(i + 1).padStart(2, '0')}`,
    );
    const incomeByMonth = new Array(12).fill(0);
    const expensesByMonth = new Array(12).fill(0);
    const newLiabilitiesByMonth = new Array(12).fill(0);
    const lpArr = new Array(12).fill(0);
    const savingsChangeByMonth = new Array(12).fill(0);
    for (const t of txYear) {
      const idx = t.date.getUTCMonth();
      const v = Number(t.amount);
      if (t.type === 'income') incomeByMonth[idx] += v;
      else if (t.type === 'expense') expensesByMonth[idx] += v;
      else newLiabilitiesByMonth[idx] += v;
    }
    for (const p of lpYear) {
      const idx = p.date.getUTCMonth();
      lpArr[idx] += Number(p.amount);
    }
    for (const m of movYear) {
      const idx = m.date.getUTCMonth();
      const v = Number(m.amount);
      if (m.flow === 'INTRA_AVAILABLE_TO_SAVINGS') savingsChangeByMonth[idx] += v;
      else if (m.flow === 'INTRA_SAVINGS_TO_AVAILABLE') savingsChangeByMonth[idx] -= v;
    }
    const trendYear = {
      months,
      income: incomeByMonth,
      expenses: expensesByMonth,
      newLiabilities: newLiabilitiesByMonth,
      liabilityPayments: lpArr,
      savingsChange: savingsChangeByMonth,
    };

    return {
      month: monthStr,
      year: yearNum,
      accounts,
      totals,
      monthSummary,
      byCategoryMonth,
      topCategoriesMonth,
      topCategoriesYear,
      byAccount,
      trendYear,
      recent: { transactions: recentTx, movements: recentMov, liabilityPayments: recentLp },
    };
  });

  // Category trend across months of a year
  app.get(
    '/category-trend/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          year: z.coerce.number().int().min(1900).max(3000),
        }),
      },
    },
    async (req) => {
      const { id } = req.params;
      const { year } = req.query;
      const cat = await app.prisma.category.findFirstOrThrow({
        where: { id, userId: req.userId },
      });
      const { from, to } = yearRange(year);
      const rows = await app.prisma.transaction.findMany({
        where: { userId: req.userId, categoryId: id, date: { gte: from, lte: to } },
        select: { amount: true, date: true },
      });
      const months = Array.from(
        { length: 12 },
        (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`,
      );
      const totals = new Array(12).fill(0);
      for (const r of rows) {
        totals[r.date.getUTCMonth()] += Number(r.amount);
      }
      return { category: cat, year, months, totals };
    },
  );
};

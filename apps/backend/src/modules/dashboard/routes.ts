import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { monthRange, formatYYYYMM, yearRange } from '../../shared/dates.js';
import { monthSchema } from '../../shared/zod.js';

const dashboardQuerySchema = z.object({
  month: monthSchema.optional(),
  year: z.coerce.number().int().min(1900).max(3000).optional(),
});

const TOP_N = 5;
const RECENT_LIMIT = 10;

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
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
        orderBy: { nombre: 'asc' },
      }),
      app.prisma.transaction.findMany({
        where: { userId, fecha: { gte: monthFrom, lte: monthTo } },
        select: { tipo: true, valor: true, accountId: true, categoryId: true },
      }),
      app.prisma.liabilityPayment.findMany({
        where: { userId, fecha: { gte: monthFrom, lte: monthTo } },
        select: { valor: true, accountId: true },
      }),
      app.prisma.movement.findMany({
        where: { userId, fecha: { gte: monthFrom, lte: monthTo } },
        select: { flujo: true, valor: true },
      }),
      app.prisma.transaction.findMany({
        where: { userId, fecha: { gte: yearFrom, lte: yearTo } },
        select: { tipo: true, valor: true, fecha: true, categoryId: true },
      }),
      app.prisma.liabilityPayment.findMany({
        where: { userId, fecha: { gte: yearFrom, lte: yearTo } },
        select: { valor: true, fecha: true },
      }),
      app.prisma.movement.findMany({
        where: { userId, fecha: { gte: yearFrom, lte: yearTo } },
        select: { flujo: true, valor: true, fecha: true },
      }),
      app.prisma.category.findMany({ where: { userId } }),
      app.prisma.transaction.findMany({
        where: { userId },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        take: RECENT_LIMIT,
      }),
      app.prisma.movement.findMany({
        where: { userId },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      app.prisma.liabilityPayment.findMany({
        where: { userId },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
    ]);

    const catName = new Map(categoriesAll.map((c) => [c.id, c.nombre] as const));
    const catTipo = new Map(categoriesAll.map((c) => [c.id, c.tipo] as const));

    // Totals (today snapshot)
    const totals = accounts.reduce(
      (acc, a) => {
        acc.disponibleTotal += Number(a.disponible);
        acc.ahorroTotal += Number(a.ahorro);
        acc.pasivosTotal += Number(a.pasivos);
        return acc;
      },
      { disponibleTotal: 0, ahorroTotal: 0, pasivosTotal: 0, netWorth: 0 },
    );
    totals.netWorth = totals.disponibleTotal + totals.ahorroTotal - totals.pasivosTotal;

    // Month summary
    let ingresos = 0;
    let egresos = 0;
    let pasivosNuevos = 0;
    for (const t of txMonth) {
      const v = Number(t.valor);
      if (t.tipo === 'ingreso') ingresos += v;
      else if (t.tipo === 'egreso') egresos += v;
      else pasivosNuevos += v;
    }
    const liabilityPaymentsTotal = lpMonth.reduce((acc, p) => acc + Number(p.valor), 0);
    let ahorroDelta = 0;
    for (const m of movMonth) {
      const v = Number(m.valor);
      if (m.flujo === 'INTRA_DISPONIBLE_TO_AHORRO') ahorroDelta += v;
      else if (m.flujo === 'INTRA_AHORRO_TO_DISPONIBLE') ahorroDelta -= v;
    }
    const monthSummary = {
      ingresos,
      egresos,
      pasivosNuevos,
      liabilityPayments: liabilityPaymentsTotal,
      movementsCount: movMonth.length,
      ahorroDelta,
      flow: ingresos - egresos,
    };

    // By category for the month (egreso + pasivo combined as "expenses")
    const ingresoByCat = new Map<string, number>();
    const egresoByCat = new Map<string, number>();
    for (const t of txMonth) {
      const v = Number(t.valor);
      if (t.tipo === 'ingreso') {
        ingresoByCat.set(t.categoryId, (ingresoByCat.get(t.categoryId) ?? 0) + v);
      } else {
        egresoByCat.set(t.categoryId, (egresoByCat.get(t.categoryId) ?? 0) + v);
      }
    }
    const toBreakdown = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([categoryId, total]) => ({
          categoryId,
          nombre: catName.get(categoryId) ?? '',
          tipo: catTipo.get(categoryId) ?? null,
          total,
        }))
        .sort((a, b) => b.total - a.total);

    const byCategoryMonth = {
      ingreso: toBreakdown(ingresoByCat),
      egreso: toBreakdown(egresoByCat),
    };

    // Top categories (year)
    const ingresoByCatYear = new Map<string, number>();
    const egresoByCatYear = new Map<string, number>();
    for (const t of txYear) {
      const v = Number(t.valor);
      if (t.tipo === 'ingreso') {
        ingresoByCatYear.set(t.categoryId, (ingresoByCatYear.get(t.categoryId) ?? 0) + v);
      } else {
        egresoByCatYear.set(t.categoryId, (egresoByCatYear.get(t.categoryId) ?? 0) + v);
      }
    }
    const topYear = (m: Map<string, number>) => toBreakdown(m).slice(0, TOP_N);
    const topCategoriesYear = {
      ingreso: topYear(ingresoByCatYear),
      egreso: topYear(egresoByCatYear),
    };
    const topCategoriesMonth = {
      ingreso: byCategoryMonth.ingreso.slice(0, TOP_N),
      egreso: byCategoryMonth.egreso.slice(0, TOP_N),
    };

    // By account (month)
    const byAccountMap = new Map<
      string,
      { ingresos: number; egresos: number; pasivosNuevos: number; liabilityPayments: number }
    >();
    for (const a of accounts) {
      byAccountMap.set(a.id, { ingresos: 0, egresos: 0, pasivosNuevos: 0, liabilityPayments: 0 });
    }
    for (const t of txMonth) {
      const ent = byAccountMap.get(t.accountId);
      if (!ent) continue;
      const v = Number(t.valor);
      if (t.tipo === 'ingreso') ent.ingresos += v;
      else if (t.tipo === 'egreso') ent.egresos += v;
      else ent.pasivosNuevos += v;
    }
    for (const p of lpMonth) {
      const ent = byAccountMap.get(p.accountId);
      if (!ent) continue;
      ent.liabilityPayments += Number(p.valor);
    }
    const byAccount = accounts.map((a) => ({
      accountId: a.id,
      nombre: a.nombre,
      ...byAccountMap.get(a.id)!,
    }));

    // Trend (year, monthly buckets)
    const months = Array.from({ length: 12 }, (_, i) => `${yearNum}-${String(i + 1).padStart(2, '0')}`);
    const ingresosArr = new Array(12).fill(0);
    const egresosArr = new Array(12).fill(0);
    const pasivosArr = new Array(12).fill(0);
    const lpArr = new Array(12).fill(0);
    const ahorroDeltaArr = new Array(12).fill(0);
    for (const t of txYear) {
      const idx = t.fecha.getUTCMonth();
      const v = Number(t.valor);
      if (t.tipo === 'ingreso') ingresosArr[idx] += v;
      else if (t.tipo === 'egreso') egresosArr[idx] += v;
      else pasivosArr[idx] += v;
    }
    for (const p of lpYear) {
      const idx = p.fecha.getUTCMonth();
      lpArr[idx] += Number(p.valor);
    }
    for (const m of movYear) {
      const idx = m.fecha.getUTCMonth();
      const v = Number(m.valor);
      if (m.flujo === 'INTRA_DISPONIBLE_TO_AHORRO') ahorroDeltaArr[idx] += v;
      else if (m.flujo === 'INTRA_AHORRO_TO_DISPONIBLE') ahorroDeltaArr[idx] -= v;
    }
    const trendYear = {
      months,
      ingresos: ingresosArr,
      egresos: egresosArr,
      pasivosNuevos: pasivosArr,
      liabilityPayments: lpArr,
      ahorroDelta: ahorroDeltaArr,
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
        where: { userId: req.userId, categoryId: id, fecha: { gte: from, lte: to } },
        select: { valor: true, fecha: true },
      });
      const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
      const totals = new Array(12).fill(0);
      for (const r of rows) {
        totals[r.fecha.getUTCMonth()] += Number(r.valor);
      }
      return { category: cat, year, months, totals };
    },
  );
};

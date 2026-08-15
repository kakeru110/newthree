// 総務省統計局 e-Stat 経由で厚生労働省「人口動態統計」の悪性新生物(がん)死亡データを取得し、
// src/data/cancer-mortality.json に書き出す。
// 必要な環境変数: ESTAT_APP_ID

import { writeFile } from 'node:fs/promises';

const CRUDE_TABLE = '0003411668'; // 悪性新生物 性・年次別 死亡数及び死亡率
const ADJUSTED_TABLE = '0003464098'; // 悪性新生物 性・年次別 年齢調整死亡率(平成27年モデル人口)
const AGE_TABLE = '0003411661'; // 死因順位別 性・年齢(5歳階級)別 死亡数・死亡率
const ALL_CANCER_CODE = '021002017';
const OUTPUT_PATH = new URL('../src/data/cancer-mortality.json', import.meta.url);

const AGE_BRACKETS = [
  ['00180', '5-9'], ['00200', '10-14'], ['00220', '15-19'], ['00230', '20-24'],
  ['00240', '25-29'], ['00250', '30-34'], ['00260', '35-39'], ['00280', '40-44'],
  ['00300', '45-49'], ['00320', '50-54'], ['00340', '55-59'], ['00350', '60-64'],
  ['00360', '65-69'], ['00370', '70-74'], ['00380', '75-79'], ['00400', '80-84'],
  ['00410', '85-89'],
];

async function fetchJson(params) {
  const appId = process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('ESTAT_APP_ID environment variable is required');
  const url = new URL('https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData');
  url.searchParams.set('appId', appId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`e-Stat API request failed: ${res.status}`);
  const json = await res.json();
  const result = json.GET_STATS_DATA.RESULT;
  if (result.STATUS !== 0) throw new Error(`e-Stat API error: ${result.ERROR_MSG}`);
  return json.GET_STATS_DATA.STATISTICAL_DATA;
}

function asArray(v) {
  return Array.isArray(v) ? v : [v];
}

async function main() {
  // 1. 粗死亡数・粗死亡率 (総数, 全年次)
  const crude = await fetchJson({
    statsDataId: CRUDE_TABLE,
    cdCat01: ALL_CANCER_CODE,
    cdCat02: '00100', // 総数(男女計)
  });
  const crudeValues = asArray(crude.DATA_INF.VALUE);
  const crudeByYear = new Map();
  for (const v of crudeValues) {
    const year = Number(v['@time'].slice(0, 4));
    if (!crudeByYear.has(year)) crudeByYear.set(year, {});
    crudeByYear.get(year)[v['@tab'] === '10100' ? 'deaths' : 'rate'] = Number(v['$']);
  }
  const crudeSeries = [...crudeByYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({ year, ...v }));

  // 2. 年齢調整死亡率 (男女別, 全年次)
  const adjusted = await fetchJson({
    statsDataId: ADJUSTED_TABLE,
    cdCat01: ALL_CANCER_CODE,
  });
  const adjustedValues = asArray(adjusted.DATA_INF.VALUE);
  const adjustedByYear = new Map();
  for (const v of adjustedValues) {
    const year = Number(v['@time'].slice(0, 4));
    if (!adjustedByYear.has(year)) adjustedByYear.set(year, {});
    adjustedByYear.get(year)[v['@cat02'] === '00110' ? 'male' : 'female'] = Number(v['$']);
  }
  const adjustedSeries = [...adjustedByYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({ year, ...v }));

  // 3. 年齢階級別死亡率 (最新年, 男女計)
  const latestYear = crudeSeries[crudeSeries.length - 1].year;
  const byAge = await fetchJson({
    statsDataId: AGE_TABLE,
    cdTab: '10110',
    cdCat01: '00160', // 悪性新生物<腫瘍>(このテーブル内のコード)
    cdCat04: '00100', // 総数(男女計)
    cdTime: `${latestYear}000000`,
  });
  const byAgeValues = asArray(byAge.DATA_INF.VALUE);
  const rateByAgeCode = new Map(byAgeValues.map((v) => [v['@cat03'], Number(v['$'])]));
  const ageSeries = AGE_BRACKETS
    .map(([code, label]) => ({ age: label, rate: rateByAgeCode.get(code) ?? null }))
    .filter((row) => row.rate !== null);

  const output = {
    sourceUrl: 'https://www.e-stat.go.jp/stat-search/database?statdisp_id=0003411668',
    fetchedAt: new Date().toISOString(),
    crude: crudeSeries, // 粗死亡数・粗死亡率(全国, 男女計, 年次)
    ageAdjusted: adjustedSeries, // 年齢調整死亡率(平成27年モデル人口, 男女別, 年次)
    byAge: { year: latestYear, rows: ageSeries }, // 年齢階級別死亡率(最新年, 男女計)
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote cancer mortality data (${crudeSeries.length} years) to ${OUTPUT_PATH.pathname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

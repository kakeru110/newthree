// 総務省「住宅・土地統計調査」から、
// (1) 全国の空き家率の長期推移(1998年〜2023年)
// (2) 2023年の空き家の内訳(賃貸用・売却用・二次的住宅・それ以外)
// (3) 都道府県別の空き家率(総数、および賃貸・売却用等を除いた「その他空き家」)
// を取得し、src/data/akiya.json に書き出す。
// 必要な環境変数: ESTAT_APP_ID

import { writeFile } from 'node:fs/promises';

const PREF_CODES = [
  ['01000', '北海道'], ['02000', '青森県'], ['03000', '岩手県'], ['04000', '宮城県'], ['05000', '秋田県'],
  ['06000', '山形県'], ['07000', '福島県'], ['08000', '茨城県'], ['09000', '栃木県'], ['10000', '群馬県'],
  ['11000', '埼玉県'], ['12000', '千葉県'], ['13000', '東京都'], ['14000', '神奈川県'], ['15000', '新潟県'],
  ['16000', '富山県'], ['17000', '石川県'], ['18000', '福井県'], ['19000', '山梨県'], ['20000', '長野県'],
  ['21000', '岐阜県'], ['22000', '静岡県'], ['23000', '愛知県'], ['24000', '三重県'], ['25000', '滋賀県'],
  ['26000', '京都府'], ['27000', '大阪府'], ['28000', '兵庫県'], ['29000', '奈良県'], ['30000', '和歌山県'],
  ['31000', '鳥取県'], ['32000', '島根県'], ['33000', '岡山県'], ['34000', '広島県'], ['35000', '山口県'],
  ['36000', '徳島県'], ['37000', '香川県'], ['38000', '愛媛県'], ['39000', '高知県'], ['40000', '福岡県'],
  ['41000', '佐賀県'], ['42000', '長崎県'], ['43000', '熊本県'], ['44000', '大分県'], ['45000', '宮崎県'],
  ['46000', '鹿児島県'], ['47000', '沖縄県'],
];

// 全国 空き家率の長期推移。表の作成年次ごとにテーブル・分類コードが異なるため個別に指定する。
const NATIONAL_TREND = [
  { year: 1998, statsDataId: '0000081355', catKey: 'cdCat02', extra: { cdCat01: '00700' }, totalCode: '001', vacantCode: '007' },
  { year: 2003, statsDataId: '0000082212', catKey: 'cdCat01', extra: {}, totalCode: '000', vacantCode: '006' },
  { year: 2008, statsDataId: '0003009571', catKey: 'cdCat01', extra: {}, totalCode: '00', vacantCode: '06' },
  { year: 2013, statsDataId: '0003095315', catKey: 'cdCat01', extra: {}, totalCode: '00000', vacantCode: '00008' },
  { year: 2018, statsDataId: '0003326560', catKey: 'cdCat01', extra: {}, totalCode: '0', vacantCode: '22' },
  { year: 2023, statsDataId: '0004015740', catKey: 'cdCat01', extra: {}, totalCode: '0', vacantCode: '22' },
];

const LATEST_TABLE = '0004015740'; // 令和5年(2023年)住宅・土地統計調査 住宅数概数集計
const LATEST_YEAR = 2023;
// 2023年表の内訳コード
const CAT_TOTAL = '0';
const CAT_VACANT_TOTAL = '22';
const CAT_VACANT_TRUE = '221'; // 賃貸・売却用及び二次的住宅を除く空き家(いわゆる「本当の空き家」)
const CAT_VACANT_RENT = '222'; // 賃貸用の空き家
const CAT_VACANT_SALE = '223'; // 売却用の空き家
const CAT_VACANT_SECOND = '224'; // 二次的住宅(別荘等)

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
  // 1. 全国 空き家率の推移
  const trend = [];
  for (const cfg of NATIONAL_TREND) {
    const data = await fetchJson({
      statsDataId: cfg.statsDataId,
      cdArea: '00000',
      [cfg.catKey]: `${cfg.totalCode},${cfg.vacantCode}`,
      ...cfg.extra,
    });
    const values = asArray(data.DATA_INF.VALUE).filter((v) => v['@area'] === '00000');
    const catField = cfg.catKey.replace('cd', '').toLowerCase(); // cdCat01 -> cat01
    const total = Number(values.find((v) => v[`@${catField}`] === cfg.totalCode)['$']);
    const vacant = Number(values.find((v) => v[`@${catField}`] === cfg.vacantCode)['$']);
    trend.push({ year: cfg.year, totalHouses: total, vacantHouses: vacant, vacancyRate: Math.round((vacant / total) * 1000) / 10 });
  }

  // 2. 2023年の空き家の内訳(全国)
  const breakdownCodes = [CAT_TOTAL, CAT_VACANT_TOTAL, CAT_VACANT_TRUE, CAT_VACANT_RENT, CAT_VACANT_SALE, CAT_VACANT_SECOND];
  const breakdownData = await fetchJson({
    statsDataId: LATEST_TABLE,
    cdArea: '00000',
    cdCat01: breakdownCodes.join(','),
  });
  const breakdownValues = asArray(breakdownData.DATA_INF.VALUE);
  const byCode = new Map(breakdownValues.map((v) => [v['@cat01'], Number(v['$'])]));
  const breakdown = {
    totalHouses: byCode.get(CAT_TOTAL),
    vacantTotal: byCode.get(CAT_VACANT_TOTAL),
    vacantTrue: byCode.get(CAT_VACANT_TRUE),
    vacantRent: byCode.get(CAT_VACANT_RENT),
    vacantSale: byCode.get(CAT_VACANT_SALE),
    vacantSecondary: byCode.get(CAT_VACANT_SECOND),
  };

  // 3. 都道府県別 空き家率(2023年度、総数・「その他空き家」)
  const prefData = await fetchJson({
    statsDataId: LATEST_TABLE,
    cdCat01: `${CAT_TOTAL},${CAT_VACANT_TOTAL},${CAT_VACANT_TRUE}`,
    cdArea: PREF_CODES.map(([code]) => code).join(','),
  });
  const prefValues = asArray(prefData.DATA_INF.VALUE);
  const byAreaCode = new Map();
  for (const v of prefValues) {
    if (!byAreaCode.has(v['@area'])) byAreaCode.set(v['@area'], {});
    byAreaCode.get(v['@area'])[v['@cat01']] = Number(v['$']);
  }
  const byPrefecture = PREF_CODES.map(([code, pref]) => {
    const row = byAreaCode.get(code) || {};
    const total = row[CAT_TOTAL];
    const vacantTotal = row[CAT_VACANT_TOTAL];
    const vacantTrue = row[CAT_VACANT_TRUE];
    return {
      pref,
      totalRate: Math.round((vacantTotal / total) * 1000) / 10,
      trueRate: Math.round((vacantTrue / total) * 1000) / 10,
    };
  });

  const output = {
    sourceUrl: 'https://www.e-stat.go.jp/stat-search/database?statdisp_id=0004015740',
    fetchedAt: new Date().toISOString(),
    trend, // 全国 空き家率の推移(1998-2023)
    breakdown, // 2023年 全国の空き家の内訳
    byPrefecture: { year: LATEST_YEAR, rows: byPrefecture }, // 都道府県別(2023年)
  };

  await writeFile(
    new URL('../src/data/akiya.json', import.meta.url),
    JSON.stringify(output, null, 2) + '\n',
    'utf-8'
  );
  console.log(`Wrote akiya data (${trend.length} trend points, ${byPrefecture.length} prefectures) to src/data/akiya.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

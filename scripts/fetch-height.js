// 文部科学省「学校保健統計調査」から、
// (1) 全国の17歳平均身長の長期推移(1900年〜)
// (2) 都道府県別17歳平均身長(最新年度)
// を取得し、src/data/height.json に書き出す。
// 必要な環境変数: ESTAT_APP_ID

import { writeFile } from 'node:fs/promises';

const LONG_RUN_TABLE = '0003147022'; // 年齢別 平均身長・平均体重・平均座高の推移(全国, 1900-2015)
const RECENT_TABLE = '0003146482'; // 都道府県別 身長・体重の平均値及び標準偏差 2015年度〜
const AGE_17_LONG_RUN = '130'; // 高等学校(17歳)
const AGE_17_RECENT = '130'; // 17(歳)

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
  // 1. 全国 17歳 平均身長の長期推移 (1900-2015, 男女別)
  const longRunMale = await fetchJson({ statsDataId: LONG_RUN_TABLE, cdCat01: '20', cdCat03: AGE_17_LONG_RUN });
  const longRunFemale = await fetchJson({ statsDataId: LONG_RUN_TABLE, cdCat01: '30', cdCat03: AGE_17_LONG_RUN });
  const toYearMap = (data) => new Map(asArray(data.DATA_INF.VALUE).map((v) => [Number(v['@time'].slice(0, 4)), Number(v['$'])]));
  const longRunMaleMap = toYearMap(longRunMale);
  const longRunFemaleMap = toYearMap(longRunFemale);

  // 2. 全国 17歳 平均身長 2015-2019 (長期推移データの延長)
  const recentNational = await fetchJson({
    statsDataId: RECENT_TABLE, cdTab: '0000010', cdCat01: AGE_17_RECENT, cdCat02: '0000010', cdCat03: '0000010', cdArea: '00000',
  });
  for (const v of asArray(recentNational.DATA_INF.VALUE)) {
    const year = Number(v['@time'].slice(0, 4));
    const map = v['@cat04'] === '20' ? longRunMaleMap : longRunFemaleMap;
    map.set(year, Number(v['$']));
  }

  const years = [...new Set([...longRunMaleMap.keys(), ...longRunFemaleMap.keys()])].sort((a, b) => a - b);
  const trend = years.map((year) => ({
    year,
    male: longRunMaleMap.get(year) ?? null,
    female: longRunFemaleMap.get(year) ?? null,
  }));

  // 3. 都道府県別 17歳 平均身長 (最新年度)
  const prefMale = await fetchJson({
    statsDataId: RECENT_TABLE, cdTab: '0000010', cdCat01: AGE_17_RECENT, cdCat02: '0000010', cdCat03: '0000010', cdCat04: '20',
  });
  const prefFemale = await fetchJson({
    statsDataId: RECENT_TABLE, cdTab: '0000010', cdCat01: AGE_17_RECENT, cdCat02: '0000010', cdCat03: '0000010', cdCat04: '30',
  });

  const latestTimeCode = asArray(prefMale.DATA_INF.VALUE)
    .map((v) => v['@time'])
    .sort()
    .pop();
  const latestYear = latestTimeCode.slice(0, 4);

  const maleByArea = new Map(
    asArray(prefMale.DATA_INF.VALUE).filter((v) => v['@time'] === latestTimeCode).map((v) => [v['@area'], Number(v['$'])])
  );
  const femaleByArea = new Map(
    asArray(prefFemale.DATA_INF.VALUE).filter((v) => v['@time'] === latestTimeCode).map((v) => [v['@area'], Number(v['$'])])
  );

  const prefectures = PREF_CODES.map(([code, pref]) => ({
    pref,
    male: maleByArea.get(code) ?? null,
    female: femaleByArea.get(code) ?? null,
  }));

  const output = {
    sourceUrl: 'https://www.e-stat.go.jp/stat-search/database?statdisp_id=0003146482',
    fetchedAt: new Date().toISOString(),
    ageGroup: '17歳(高等学校)',
    trend, // 全国平均身長の推移 1900年〜
    byPrefecture: { year: latestYear, rows: prefectures }, // 都道府県別(最新年度)
  };

  await writeFile(
    new URL('../src/data/height.json', import.meta.url),
    JSON.stringify(output, null, 2) + '\n',
    'utf-8'
  );
  console.log(`Wrote height data (${trend.length} years, ${prefectures.length} prefectures) to src/data/height.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

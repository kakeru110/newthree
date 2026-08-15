// 総務省統計局「人口推計」都道府県別総人口を e-Stat API から取得し、
// src/data/population.json に書き出す。
// 必要な環境変数: ESTAT_APP_ID (https://www.e-stat.go.jp/mypage/user/preregister で無料発行)

import { writeFile } from 'node:fs/promises';

const STATS_DATA_ID = '0004026264'; // 人口推計 各年10月1日現在人口 参考表 都道府県，男女別人口
const OUTPUT_PATH = new URL('../src/data/population.json', import.meta.url);

const PREF_CODES = [
  '01000', '02000', '03000', '04000', '05000', '06000', '07000', '08000', '09000', '10000',
  '11000', '12000', '13000', '14000', '15000', '16000', '17000', '18000', '19000', '20000',
  '21000', '22000', '23000', '24000', '25000', '26000', '27000', '28000', '29000', '30000',
  '31000', '32000', '33000', '34000', '35000', '36000', '37000', '38000', '39000', '40000',
  '41000', '42000', '43000', '44000', '45000', '46000', '47000',
];

async function main() {
  const appId = process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('ESTAT_APP_ID environment variable is required');

  const url = new URL('https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData');
  url.searchParams.set('appId', appId);
  url.searchParams.set('statsDataId', STATS_DATA_ID);
  url.searchParams.set('cdCat01', '204'); // 人口
  url.searchParams.set('cdCat02', '000'); // 男女計
  url.searchParams.set('cdCat03', '001'); // 総人口

  const res = await fetch(url);
  if (!res.ok) throw new Error(`e-Stat API request failed: ${res.status}`);
  const json = await res.json();

  const result = json.GET_STATS_DATA.RESULT;
  if (result.STATUS !== 0) throw new Error(`e-Stat API error: ${result.ERROR_MSG}`);

  const statData = json.GET_STATS_DATA.STATISTICAL_DATA;
  const classObjs = statData.CLASS_INF.CLASS_OBJ;
  const areaClasses = classObjs.find((c) => c['@id'] === 'area').CLASS;
  const timeClasses = classObjs.find((c) => c['@id'] === 'time').CLASS;
  const areaNames = Object.fromEntries(areaClasses.map((c) => [c['@code'], c['@name']]));

  // 時間軸のうち "現在" 表記の年次コードを新しい順に並べる(前年比の算出に使う)
  const pointInTimeCodes = timeClasses
    .filter((c) => c['@name'].includes('現在'))
    .map((c) => c['@code'])
    .sort()
    .reverse();
  const [latestTime, previousTime] = pointInTimeCodes;

  const values = statData.DATA_INF.VALUE;
  const byArea = new Map();
  for (const v of values) {
    if (!PREF_CODES.includes(v['@area'])) continue;
    if (!byArea.has(v['@area'])) byArea.set(v['@area'], {});
    byArea.get(v['@area'])[v['@time']] = Number(v['$']);
  }

  const prefectures = PREF_CODES.map((code) => {
    const times = byArea.get(code) ?? {};
    const population = times[latestTime];
    const previousPopulation = times[previousTime];
    const changeRate = previousPopulation
      ? ((population - previousPopulation) / previousPopulation) * 100
      : null;
    return {
      code,
      pref: areaNames[code],
      population,
      previousPopulation,
      changeRate,
    };
  });

  const output = {
    statsDataId: STATS_DATA_ID,
    asOf: timeClasses.find((c) => c['@code'] === latestTime)['@name'],
    comparedTo: timeClasses.find((c) => c['@code'] === previousTime)['@name'],
    sourceUrl: `https://www.e-stat.go.jp/dbview?sid=${STATS_DATA_ID}`,
    fetchedAt: new Date().toISOString(),
    prefectures,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${prefectures.length} prefectures to ${OUTPUT_PATH.pathname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

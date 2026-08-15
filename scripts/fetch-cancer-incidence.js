// 国立がん研究センター「がん情報サービス」の全国がん登録データ(全部位・罹患)を取得し、
// src/data/cancer-incidence.json に書き出す。
// 認証不要の公開Excel(.xls)ファイルをダウンロードしてパースする。
// 出典: https://ganjoho.jp/reg_stat/statistics/data/dl/index.html

import { writeFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

const SOURCE_URL =
  'https://ganjoho.jp/reg_stat/statistics/data/dl/excel/cancer_incidence3pref(1985-2023).xls';
const OUTPUT_PATH = new URL('../src/data/cancer-incidence.json', import.meta.url);
const MODEL_POP = '昭和60年モデル人口';

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  // 年齢調整罹患率(全部位・男女別・年次)
  const asrRows = XLSX.utils.sheet_to_json(wb.Sheets['asr'], { header: 1 });
  const asrHeader = asrRows[0];
  const years = asrHeader.slice(5).map(Number);
  const asrBySex = {};
  for (const row of asrRows.slice(1)) {
    if (row[1] !== '全部位' || row[4] !== MODEL_POP) continue;
    const sexKey = row[3] === '男女計' ? 'total' : row[3] === '男' ? 'male' : 'female';
    asrBySex[sexKey] = years.map((year, i) => ({ year, rate: row[5 + i] ?? null }));
  }

  // 粗罹患数・粗罹患率(全部位・男女計・年次)
  const numberRows = XLSX.utils.sheet_to_json(wb.Sheets['number'], { header: 1 });
  const rateRows = XLSX.utils.sheet_to_json(wb.Sheets['rate'], { header: 1 });
  const countByYear = new Map();
  for (const row of numberRows.slice(1)) {
    if (row[1] === '全部位' && row[3] === '男女計') countByYear.set(row[4], row[5]);
  }
  const rateByYear = new Map();
  for (const row of rateRows.slice(1)) {
    if (row[1] === '全部位' && row[3] === '男女計') rateByYear.set(row[4], row[5]);
  }
  const crude = [...countByYear.keys()].sort((a, b) => a - b).map((year) => ({
    year,
    count: countByYear.get(year),
    rate: rateByYear.get(year),
  }));

  const output = {
    sourceUrl: 'https://ganjoho.jp/reg_stat/statistics/data/dl/index.html',
    fileUrl: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    modelPopulation: MODEL_POP,
    note: '2016年以降は全国がん登録(義務化・全数把握)、2015年以前は地域がん登録(高精度地域の推計値)に基づく。集計方法の違いにより2016年で数値が不連続になる点に注意。',
    crude,
    ageAdjusted: {
      total: asrBySex.total,
      male: asrBySex.male,
      female: asrBySex.female,
    },
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`Wrote cancer incidence data (${crude.length} years) to ${OUTPUT_PATH.pathname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

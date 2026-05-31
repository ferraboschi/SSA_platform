import type { DeepPartial, Dictionary } from "../dictionary";

// Partial JA dictionary. The exam report is fully translated (it is generated in
// JA today); everything else falls back to the default locale until completed.
export const ja: DeepPartial<Dictionary> = {
  report: {
    cert: "試験報告書",
    family: {
      nihonshu: "酒ソムリエ · 認定レベル",
      shochu: "焼酎ソムリエ · 認定レベル",
    },
    passedTitle: "合格",
    retrialTitle: "条件付き合格",
    failedTitle: "不合格",
    score: "最終点数",
    breakdown: "カテゴリ別点数",
    aiSummary: "学習の要約",
    weakAreas: "復習が必要な分野",
    issued: "発行日",
    examDate: "試験日",
    location: "会場",
    educator: "講師",
    importantWrong: "復習すべき重要な問題",
    correctAnswer: "正解",
    yourAnswer: "あなたの回答",
    footer: "サケソムリエ協会 · sakesommelierassociation.it",
    advice: {
      passed:
        "素晴らしい成果です。プログラム全体に対する確かな理解を示しました。マスタークラスを継続しましょう。",
      retrial:
        "全体的に良い水準に達しましたが、いくつかの分野で更なる学習が必要です。60日以内に再試験を受けてください。",
      failed:
        "点数が基準を下回っています。教材を見直し、コースの再受講または再試験をお勧めします。",
    },
  },
};

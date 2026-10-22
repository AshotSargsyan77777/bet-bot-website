import type { Lang } from "./lang";

/**
 * Check texts are generated in Armenian (same text as the Telegram bot); this translates their
 * fixed phrases for the English and Russian UI. Team names and market names stay as they are.
 */
type Rule = [RegExp, string, string]; // pattern, English, Russian ($1, $2… are captured values)

const FACTS: Rule[] = [
  [/^ավելի լավ ձև$/, "better form", "лучшая форма"],
  [/^H2H՝ (\d+)\/(\d+) հաղթանակ$/, "H2H: $1/$2 wins", "H2H: $1/$2 побед"],
  [/^սպասվող գոլեր (.+)$/, "expected goals $1", "ожидаемые голы $1"],
  [/^մրցակիցն ունի (\d+) բացակա$/, "opponent has $1 absentees", "у соперника $1 отсутствующих"],
];

const LINES: Rule[] = [
  [/^⚽ GOALKING ՉԵԿ$/, "⚽ GOALKING CHECK", "⚽ GOALKING ЧЕК"],
  [/^🎯 Ընդհանուր գործակից՝ (.+)$/, "🎯 Total odds: $1", "🎯 Общий коэффициент: $1"],
  [/^💰 Գործակից՝ (.+)$/, "💰 Odds: $1", "💰 Коэффициент: $1"],
  [/^📊 Հավանականություն՝ (.+)$/, "📊 Probability: $1", "📊 Вероятность: $1"],
  [/^ℹ️ Գործակիցները՝ (.+)$/, "ℹ️ Odds from: $1", "ℹ️ Коэффициенты: $1"],
  [/^⚠️ Բարձր ռիսկի փաթեթ$/, "⚠️ High-risk package", "⚠️ Пакет высокого риска"],
  [/^⚠️ Միջին ռիսկի փաթեթ$/, "⚠️ Medium-risk package", "⚠️ Пакет среднего риска"],
  [
    /^⚠️ Ուշադրություն\. Մենք պատասխանատվություն չենք կրում չեկերի արդյունքների համար: Խաղադրույք կատարեք սեփական պատասխանատվությամբ:$/,
    "⚠️ Attention: we are not responsible for the results of the checks. Bet at your own risk.",
    "⚠️ Внимание: мы не несём ответственности за результаты чеков. Делайте ставки на свой риск.",
  ],
  [/^(.+) չեկը այսօր հասանելի չէ:$/, "$1 check is not available today.", "Чек $1 сегодня недоступен."],
  [/^(.+) չեկը դեռ տեղադրված չէ:$/, "$1 check has not been posted yet.", "Чек $1 ещё не опубликован."],
];

// 💡 explanations (order matters: more specific first)
const WHY: Rule[] = [
  [/^Երկու թիմն էլ գոլային է\. սպասվում է (.+) և (.+) գոլ։$/, "Both teams score regularly: $1 and $2 goals expected.", "Обе команды результативны: ожидается $1 и $2 гола."],
  [/^(.+)-ի հարձակումը թույլ է\. սպասվում է ~(.+) գոլ։$/, "$1's attack is weak: ~$2 goals expected.", "У $1 слабая атака: ожидается ~$2 гола."],
  [/^Սպասվում է ~(.+) գոլ, գծից \((.+)\) բարձր։$/, "~$1 goals expected, above the line ($2).", "Ожидается ~$1 гола, выше линии ($2)."],
  [/^Սպասվում է ~(.+) գոլ, գծից \((.+)\) ցածր։$/, "~$1 goals expected, below the line ($2).", "Ожидается ~$1 гола, ниже линии ($2)."],
  [/^1-ին խաղակեսում սպասվում է ~(.+) գոլ \(գիծը՝ (.+)\)։$/, "~$1 goals expected in the 1st half (line $2).", "В 1-м тайме ожидается ~$1 гола (линия $2)."],
  [/^Սպասվում է ~(.+) անկյունային \(գիծը՝ (.+)\)։$/, "~$1 corners expected (line $2).", "Ожидается ~$1 угловых (линия $2)."],
  [/^(.+)-ից սպասվում է ~(.+) անկյունային \(գիծը՝ (.+)\)։$/, "~$2 corners expected from $1 (line $3).", "От $1 ожидается ~$2 угловых (линия $3)."],
  [/^Թիմերի կարգապահությամբ սպասվում է ~(.+) քարտ \(գիծը՝ (.+)\)։$/, "Based on discipline, ~$1 cards expected (line $2).", "По дисциплине команд ожидается ~$1 карточек (линия $2)."],
  [/^(.+)-ից սպասվում է ընդամենը ~(.+) գոլ։$/, "Only ~$2 goals expected from $1.", "От $1 ожидается всего ~$2 гола."],
  [/^(.+)-ից սպասվում է ~(.+) գոլ \(գիծը՝ (.+)\)։$/, "~$2 goals expected from $1 (line $3).", "От $1 ожидается ~$2 гола (линия $3)."],
  [/^(.+)-ը սովորաբար գոլ է խփում \(~(.+)\)։$/, "$1 usually scores (~$2).", "$1 обычно забивает (~$2)."],
  [/^Ոչ-ոքիի դեպքում գումարը վերադարձվում է\. (.+)-ը ֆավորիտ է։$/, "Stake is returned on a draw; $1 is the favourite.", "При ничьей ставка возвращается; $1 — фаворит."],
  [/^(.+)-ը չպարտվելու դեպքում խաղադրույքը հաղթում է։$/, "The bet wins if $1 doesn't lose.", "Ставка выигрывает, если $1 не проиграет."],
  [/^(.+)-ն վերջին խաղերում ավելի լավ ձևի մեջ է։$/, "$1 is in better form in recent matches.", "$1 в лучшей форме в последних матчах."],
];

function apply(rules: Rule[], text: string, lang: "en" | "ru"): string | null {
  for (const [re, en, ru] of rules) {
    if (re.test(text)) return text.replace(re, lang === "en" ? en : ru);
  }
  return null;
}

function translateWhy(text: string, lang: "en" | "ru"): string {
  const favour = text.match(/^(.+)-ի օգտին՝ (.+)։$/);
  if (favour) {
    const facts = favour[2].split(", ").map((f) => apply(FACTS, f, lang) ?? f).join(", ");
    return lang === "en" ? `In favour of ${favour[1]}: ${facts}.` : `В пользу ${favour[1]}: ${facts}.`;
  }
  return apply(WHY, text, lang) ?? text;
}

export function translateCheck(text: string, lang: Lang): string {
  if (lang === "hy" || !text) return text;
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("💡 ")) return `💡 ${translateWhy(line.slice(3), lang)}`;
      return apply(LINES, line, lang) ?? line;
    })
    .join("\n");
}

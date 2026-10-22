// Չեկերի փաթեթները՝ բոտին և կայքին. combinator_selections-ը օգտագործում է միայն կայքի կոնստրուկտորը (բոտը անտեսում է)
const items = $input.all().map((item) => item.json);
const packages = items.filter((j) => j.tier);
const combinator_selections = items.flatMap((j) => j.combinator_selections || []);
return [{ json: { packages, combinator_selections } }];

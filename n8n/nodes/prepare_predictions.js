// Predictions կանչում ենք միայն այն խաղերի համար, որոնք odds ունեն
return $input.all().filter(
  (i) => Array.isArray(i.json.odds) && i.json.odds.length > 0
);
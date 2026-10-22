export type CatalogPackage = {
  key: string;
  label: string;
  price: number;
  ready: boolean;
  purchasable: boolean;
  combined_odds: string | number | null;
};

export type Catalog = {
  packages: CatalogPackage[];
  checks_date: string | null;
  today: string;
  disclaimer: string;
  card_number: string;
};

export type MyCheck = {
  active: boolean;
  text?: string;
  package_key?: string;
  valid_date?: string;
  from_promo?: boolean;
  is_admin?: boolean;
  checks?: { package_key: string; label: string; text: string }[];
};

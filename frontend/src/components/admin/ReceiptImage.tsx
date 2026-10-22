import { useEffect, useState } from "react";
import { apiBlobUrl } from "../../api/client";

import { useT } from "../../i18n";

/** Receipts are private: fetched with the admin's token and shown via an object URL. */
export function ReceiptImage({ path }: { path: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { t } = useT();

  useEffect(() => {
    if (!path) return;
    let url: string | null = null;
    let cancelled = false;
    apiBlobUrl(path)
      .then((u) => {
        url = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setSrc(u);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  if (!path || failed) return <p className="muted">{t("admin.noImage")}</p>;
  if (!src) return <div className="loading-shimmer" />;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img className="receipt-preview" src={src} alt={t("admin.receiptAlt")} />
    </a>
  );
}

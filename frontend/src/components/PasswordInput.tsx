import { useState } from "react";
import { useT } from "../i18n";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/** Password field with a 👁 button to show / hide what was typed. */
export function PasswordInput(props: Props) {
  const { t } = useT();
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-input">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-input__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("login.hidePassword") : t("login.showPassword")}
        title={visible ? t("login.hidePassword") : t("login.showPassword")}
      >
        {visible ? "🙈" : "👁"}
      </button>
    </span>
  );
}
